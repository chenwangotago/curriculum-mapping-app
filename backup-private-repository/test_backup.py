import copy
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import backup

PASSPHRASE = "mock-recovery-passphrase-for-tests-only-12345"


class MockReader:
    def __init__(self):
        self.tables = {
            "curriculum_workspaces": [
                {"id": "one", "title": "Mock Programme", "slug": "mock-programme", "admin_token": "mock-admin-token",
                 "data": {"plos": [{"id": "plo1", "title": "Mock learning outcome"}], "secondaryAlignments": {"p1": {"plo1": "A"}}}},
                {"id": "two", "title": "Other Mock Programme", "slug": "other-programme", "data": {"plos": []}}
            ],
            "curriculum_workspace_versions": [{"id": "v1", "workspace_id": "one", "data": {"test": "saved version"}}],
            "curriculum_workspace_comments": [{"id": "c1", "workspace_id": "one", "body": "Mock reviewer feedback"}],
            "curriculum_workspace_activity": [{"id": "a1", "workspace_id": "one", "action": "Mock edit"}],
            "curriculum_workspace_documents": [{"id": "d1", "workspace_id": "one", "storage_path": "one/d1.pdf",
                                                "filename": "proposal.pdf", "size_bytes": 17, "archived_at": "2026-10-23"}]
        }
        self.content = b"%PDF-1.7 mock file"
        self.tables[backup.DOCUMENTS][0]["size_bytes"] = len(self.content)

    def rows(self, table, optional=False):
        return copy.deepcopy(self.tables.get(table))

    def download(self, path, destination, expected_size):
        if self.content is None:
            raise backup.BackupError("Mock missing attachment")
        if expected_size != len(self.content):
            raise backup.BackupError("Mock size mismatch")
        destination.write_bytes(self.content)


class BackupTests(unittest.TestCase):
    def test_encrypted_roundtrip_includes_every_programme_and_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            summary = backup.create_backup(MockReader(), base / "backups", PASSPHRASE)
            encrypted = base / "backups" / summary["file"]
            self.assertEqual(summary["programmes"], 2)
            self.assertEqual(summary["attachments"], 1)
            self.assertNotIn(b"mock-admin-token", encrypted.read_bytes())
            self.assertNotIn(b"Mock reviewer feedback", encrypted.read_bytes())
            archive = base / "restored.tar.gz"
            backup.decrypt_archive(encrypted, archive, PASSPHRASE)
            manifest = backup.verify_contents(archive, base / "restored")
            self.assertEqual(manifest["documentStorage"], "included")
            self.assertEqual((base / "restored/programmes/one/files/d1/proposal.pdf").read_bytes(), MockReader().content)
            mapping = json.loads((base / "restored/programmes/one/mapping.json").read_text())
            self.assertEqual(mapping["secondaryAlignments"]["p1"]["plo1"], "A")
            self.assertTrue((base / "restored/programmes/two/mapping.json").exists())
            for name in ["comments", "activity", "versions", "documents"]:
                self.assertTrue((base / ("restored/programmes/one/" + name + ".json")).exists())
            self.assertEqual(summary["sha256"], backup.sha256(encrypted))

    def test_wrong_password_and_ciphertext_tampering_fail_authentication(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            summary = backup.create_backup(MockReader(), base, PASSPHRASE)
            encrypted = base / summary["file"]
            with self.assertRaises(Exception):
                backup.decrypt_archive(encrypted, base / "wrong-key.tar.gz", "a-completely-different-password-for-test")
            damaged = bytearray(encrypted.read_bytes()); damaged[-1] ^= 1
            (base / "damaged.enc").write_bytes(damaged)
            with self.assertRaises(Exception):
                backup.decrypt_archive(base / "damaged.enc", base / "damaged.tar.gz", PASSPHRASE)

    def test_missing_file_never_produces_a_successful_backup(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary); reader = MockReader(); reader.content = None
            with self.assertRaises(backup.BackupError):
                backup.create_backup(reader, base, PASSPHRASE)
            self.assertFalse(list(base.glob("*.cmap.enc")))
            self.assertFalse((base / "backup-summary.json").exists())

    def test_legacy_project_without_documents_still_backs_up_mapping(self):
        with tempfile.TemporaryDirectory() as temporary:
            reader = MockReader(); del reader.tables[backup.DOCUMENTS]
            manifest = backup.collect(reader, Path(temporary))
            self.assertEqual(manifest["documentStorage"], "not_enabled")
            self.assertEqual(manifest["attachmentCount"], 0)

    def test_invalid_cross_workspace_storage_path_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            reader = MockReader(); reader.tables[backup.DOCUMENTS][0]["storage_path"] = "two/d1.pdf"
            with self.assertRaises(backup.BackupError):
                backup.collect(reader, Path(temporary))

    def test_unsafe_archives_cannot_write_outside_the_destination(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "unsafe.tar.gz"
            with tarfile.open(archive, "w:gz") as target:
                entry = tarfile.TarInfo("../escaped.txt"); entry.size = 4
                target.addfile(entry, io.BytesIO(b"test"))
            with self.assertRaises(backup.BackupError):
                backup.verify_contents(archive, Path(temporary) / "recovery")
            self.assertFalse((Path(temporary) / "recovery").exists())

    def test_recovery_does_not_overwrite_existing_folders(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary); summary = backup.create_backup(MockReader(), base / "backup", PASSPHRASE)
            backup.decrypt_archive(base / "backup" / summary["file"], base / "restore.tar.gz", PASSPHRASE)
            destination = base / "existing"; destination.mkdir(); (destination / "keep.txt").write_text("keep")
            with self.assertRaises(FileExistsError):
                backup.verify_contents(base / "restore.tar.gz", destination)
            self.assertEqual((destination / "keep.txt").read_text(), "keep")

    def test_short_passphrases_and_empty_exports_are_not_accepted(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(backup.BackupError):
                backup.create_backup(MockReader(), Path(temporary), "too-short")
            reader = MockReader(); reader.tables["curriculum_workspaces"] = []
            with self.assertRaises(backup.BackupError):
                backup.create_backup(reader, Path(temporary), PASSPHRASE)

    def test_api_pagination_does_not_truncate_large_tables(self):
        class Reader(backup.SupabaseReader):
            def __init__(self):
                super().__init__("https://example.supabase.co", "mock-key")
                self.pages = []

            def request(self, path):
                params = parse_qs(urlparse(path).query)
                self.pages.append(params)
                start = int(params.get("id", ["gt.0000"])[0][3:])
                rows = [{"id": f"{i:04d}"} for i in range(start + 1, min(start + 251, 602))]
                return io.BytesIO(json.dumps(rows).encode())

        reader = Reader()
        rows = reader.rows("curriculum_workspaces")
        self.assertEqual(len(rows), 601)
        self.assertEqual(len({row["id"] for row in rows}), 601)
        self.assertTrue(all(page["select"] == ["*"] for page in reader.pages))


if __name__ == "__main__":
    unittest.main()
