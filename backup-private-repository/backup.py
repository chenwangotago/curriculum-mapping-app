"""Read-only programme exports with authenticated encryption and offline recovery."""
import argparse
import hashlib
import json
import os
import shutil
import sys
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

MAGIC = b"CMAPBK1\n"
TABLES = ["curriculum_workspaces", "curriculum_workspace_versions",
          "curriculum_workspace_comments", "curriculum_workspace_activity"]
DOCUMENTS = "curriculum_workspace_documents"
CHUNK = 1024 * 1024


class BackupError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise BackupError("Unexpected API redirect; no credentials were forwarded.")


class SupabaseReader:
    def __init__(self, url, key):
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.query or parsed.fragment:
            raise BackupError("SUPABASE_URL must be the project's HTTPS URL.")
        self.url, self.key = url.rstrip("/"), key
        self.opener = build_opener(NoRedirect())

    def request(self, path):
        for attempt in range(4):
            try:
                request = Request(self.url + path, headers={"apikey": self.key, "Authorization": "Bearer " + self.key})
                return self.opener.open(request, timeout=90)
            except HTTPError as error:
                if error.code in [429, 500, 502, 503, 504] and attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                raise

    def rows(self, table, optional=False):
        result, last = [], None
        while True:
            params = {"select": "*", "order": "id.asc", "limit": "250"}
            if last:
                params["id"] = "gt." + last
            try:
                with self.request("/rest/v1/" + table + "?" + urlencode(params)) as response:
                    page = json.load(response)
            except HTTPError as error:
                if optional and error.code == 404 and not result:
                    return None
                raise BackupError(f"Could not export {table} (HTTP {error.code}).") from None
            if not isinstance(page, list) or any(not isinstance(row, dict) or not row.get("id") for row in page):
                raise BackupError("The database returned an invalid export page.")
            if not page:
                return result
            ids = [row["id"] for row in page]
            if ids != sorted(set(ids)) or (last and ids[0] <= last):
                raise BackupError("Export pagination was not stable; retry this backup.")
            result.extend(page)
            last = ids[-1]

    def download(self, storage_path, destination, expected_size):
        try:
            with self.request("/storage/v1/object/authenticated/curriculum-documents/" + quote(storage_path, safe="/")) as response:
                total = 0
                with destination.open("xb") as target:
                    while chunk := response.read(CHUNK):
                        total += len(chunk)
                        if total > expected_size:
                            raise BackupError("An attachment's size changed during backup.")
                        target.write(chunk)
        except HTTPError as error:
            raise BackupError(f"An attachment could not be downloaded (HTTP {error.code}); backup is incomplete.") from None
        if total != expected_size:
            raise BackupError("An attachment is incomplete; no successful backup will be published.")


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def safe_component(value):
    value = str(value)
    if not value or value in [".", ".."] or "/" in value or "\\" in value or "\x00" in value:
        raise BackupError("An unsafe file or workspace identifier was rejected.")
    return value


def collect(reader, root):
    started = utc_now()
    tables = {name: reader.rows(name) for name in TABLES}
    documents = reader.rows(DOCUMENTS, optional=True)
    if documents is not None:
        tables[DOCUMENTS] = documents
    workspaces = tables["curriculum_workspaces"]
    if not workspaces:
        raise BackupError("No workspaces were returned. Verify access before accepting an empty backup.")
    workspace_ids = {row["id"] for row in workspaces}
    if any(row.get("workspace_id") not in workspace_ids for name, rows in tables.items()
           if name != "curriculum_workspaces" for row in rows):
        raise BackupError("Workspace records changed during export. Retry to avoid an incomplete backup.")
    for name, rows in tables.items():
        write_json(root / "tables" / (name + ".json"), rows)
    programme_index = []
    for workspace in workspaces:
        identity = safe_component(workspace["id"])
        folder = root / "programmes" / identity
        write_json(folder / "workspace.json", workspace)
        write_json(folder / "mapping.json", workspace["data"])
        for name, rows in tables.items():
            if name != "curriculum_workspaces":
                write_json(folder / (name.removeprefix("curriculum_workspace_") + ".json"),
                           [row for row in rows if row["workspace_id"] == identity])
        programme_index.append({"id": identity, "title": workspace["title"], "slug": workspace["slug"], "folder": "programmes/" + identity})
    for document in documents or []:
        workspace_id = safe_component(document["workspace_id"])
        storage_path = document["storage_path"]
        if not storage_path.startswith(workspace_id + "/") or any(part in [".", ".."] for part in storage_path.split("/")):
            raise BackupError("An attachment has an invalid workspace storage path.")
        filename = safe_component(document["filename"])
        destination = root / "programmes" / workspace_id / "files" / safe_component(document["id"]) / filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        reader.download(storage_path, destination, int(document["size_bytes"]))
    entries = [{"path": path.relative_to(root).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}
               for path in sorted(root.rglob("*")) if path.is_file()]
    manifest = {"format": "curriculum-backup-v1", "startedAt": started, "finishedAt": utc_now(),
                "consistency": "Read-only application export across a time window; not an atomic PostgreSQL snapshot or PITR backup.",
                "programmes": programme_index, "tableCounts": {name: len(rows) for name, rows in tables.items()},
                "documentStorage": "not_enabled" if documents is None else "included",
                "attachmentCount": len(documents or []), "files": entries}
    write_json(root / "manifest.json", manifest)
    return manifest


def key_for(passphrase, salt):
    if len(passphrase) < 32:
        raise BackupError("Use a generated backup passphrase of at least 32 characters, stored separately for recovery.")
    return Scrypt(salt=salt, length=32, n=2 ** 15, r=8, p=1).derive(passphrase.encode("utf-8"))


def encrypt_archive(source, destination, passphrase):
    salt, nonce = os.urandom(16), os.urandom(12)
    header = MAGIC + salt + nonce
    encryptor = Cipher(algorithms.AES(key_for(passphrase, salt)), modes.GCM(nonce)).encryptor()
    encryptor.authenticate_additional_data(header)
    with source.open("rb") as plain, destination.open("xb") as encrypted:
        encrypted.write(header)
        while chunk := plain.read(CHUNK):
            encrypted.write(encryptor.update(chunk))
        encrypted.write(encryptor.finalize())
        encrypted.write(encryptor.tag)


def decrypt_archive(source, destination, passphrase):
    with source.open("rb") as encrypted:
        header = encrypted.read(len(MAGIC) + 28)
        if not header.startswith(MAGIC) or len(header) != len(MAGIC) + 28:
            raise BackupError("Unsupported encrypted backup format.")
        remaining = source.stat().st_size - len(header) - 16
        if remaining < 0:
            raise BackupError("Truncated encrypted backup.")
        encrypted.seek(-16, 2)
        tag = encrypted.read(16)
        encrypted.seek(len(header))
        decryptor = Cipher(algorithms.AES(key_for(passphrase, header[len(MAGIC):len(MAGIC) + 16])), modes.GCM(header[-12:], tag)).decryptor()
        decryptor.authenticate_additional_data(header)
        with destination.open("xb") as plain:
            while remaining:
                chunk = encrypted.read(min(CHUNK, remaining))
                if not chunk:
                    raise BackupError("Truncated encrypted backup.")
                remaining -= len(chunk)
                plain.write(decryptor.update(chunk))
            plain.write(decryptor.finalize())


def verify_contents(archive, destination=None):
    with tarfile.open(archive, "r:gz") as source:
        members = source.getmembers()
        names = [item.name for item in members]
        if len(names) != len(set(names)) or any(not item.isfile() or PurePosixPath(item.name).is_absolute()
            or ".." in PurePosixPath(item.name).parts or "\\" in item.name for item in members):
            raise BackupError("Unsafe or duplicate paths in backup archive.")
        manifest = json.load(source.extractfile("manifest.json"))
        entries = manifest["files"]
        if manifest["format"] != "curriculum-backup-v1" or set(names) != {entry["path"] for entry in entries} | {"manifest.json"}:
            raise BackupError("Backup manifest does not match archive contents.")
        for entry in entries:
            digest, size = hashlib.sha256(), 0
            with source.extractfile(entry["path"]) as item:
                while chunk := item.read(CHUNK):
                    digest.update(chunk); size += len(chunk)
            if digest.hexdigest() != entry["sha256"] or size != entry["bytes"]:
                raise BackupError("A backup file failed its integrity check.")
        if destination:
            destination.mkdir(mode=0o700)
            for member in members:
                target = destination.joinpath(*PurePosixPath(member.name).parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.extractfile(member) as item, target.open("xb") as output:
                    shutil.copyfileobj(item, output)
        return manifest


def create_backup(reader, output, passphrase):
    os.umask(0o077)
    key_for(passphrase, os.urandom(16))
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    encrypted = output / ("curriculum-" + stamp + ".cmap.enc")
    try:
        with tempfile.TemporaryDirectory(prefix="curriculum-backup-") as temporary:
            base = Path(temporary); root = base / "export"; root.mkdir()
            manifest = collect(reader, root)
            archive = base / "export.tar.gz"
            with tarfile.open(archive, "w:gz") as target:
                for path in sorted(root.rglob("*")):
                    if path.is_file():
                        target.add(path, arcname=path.relative_to(root).as_posix(), recursive=False)
            encrypt_archive(archive, encrypted, passphrase)
            verified = base / "verified.tar.gz"
            decrypt_archive(encrypted, verified, passphrase)
            verify_contents(verified)
            summary = {"status": "verified", "finishedAt": manifest["finishedAt"], "programmes": len(manifest["programmes"]),
                       "attachments": manifest["attachmentCount"], "file": encrypted.name,
                       "bytes": encrypted.stat().st_size, "sha256": sha256(encrypted)}
            write_json(output / "backup-summary.json", summary)
            return summary
    except Exception:
        encrypted.unlink(missing_ok=True)
        (output / "backup-summary.json").unlink(missing_ok=True)
        raise


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["backup", "verify", "unpack", "summary"])
    parser.add_argument("file", nargs="?", type=Path)
    parser.add_argument("--destination", type=Path)
    args = parser.parse_args()
    output = Path("backups")
    if args.command == "summary":
        info = json.loads((output / "backup-summary.json").read_text())
        print(f"Verified encrypted backup: {info['programmes']} programmes; {info['attachments']} attachments.\n\nDownload the encrypted artifact from this run. It expires after the configured retention period.")
        return
    passphrase = os.environ.get("BACKUP_PASSPHRASE", "")
    if args.command == "backup":
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not key:
            raise BackupError("Configure SUPABASE_SERVICE_ROLE_KEY as a private repository secret.")
        summary = create_backup(SupabaseReader(os.environ.get("SUPABASE_URL", ""), key), output, passphrase)
        print(f"Encrypted backup verified: {summary['programmes']} programmes; {summary['attachments']} attachments.")
    else:
        if not args.file or (args.command == "unpack" and not args.destination):
            parser.error("Supply an encrypted backup file and, for unpack, a new --destination folder.")
        with tempfile.TemporaryDirectory(prefix="curriculum-recovery-") as temporary:
            archive = Path(temporary) / "recovery.tar.gz"
            decrypt_archive(args.file, archive, passphrase)
            manifest = verify_contents(archive, args.destination if args.command == "unpack" else None)
            print(f"Recovery verified: {len(manifest['programmes'])} programmes; {manifest['attachmentCount']} attachments. No live workspace was changed.")


if __name__ == "__main__":
    try:
        main()
    except BackupError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        # Never print raw API errors, key material, tokens, or programme content.
        print("Backup or recovery failed. Nothing was published as a successful backup. Check configuration, access, passphrase, and file availability.", file=sys.stderr)
        sys.exit(1)
