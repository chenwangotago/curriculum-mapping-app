# Private Daily Curriculum Backups

This is a starter for a **separate private repository**, for example `curriculum-mapping-backups`.
No scheduled job runs while this folder is nested inside the public dashboard repository.

## One-Time Setup

1. Create the new repository as **Private**. Give access only to the facilitator and designated backup administrators, not programme edit-link participants.
2. Place the contents of this folder at the root of the private repository. The workflow must be at `.github/workflows/daily-backup.yml` on its default branch.
3. Under **Settings > Secrets and variables > Actions**, add three repository secrets:
   - `SUPABASE_URL`: the existing project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: the project's server-side service-role key. This is NOT the public anon key and must never go in `config.js`, chat messages, source files, or logs.
   - `BACKUP_PASSPHRASE`: a securely generated random passphrase of at least 32 characters. Keep a recovery copy in an approved password manager outside GitHub. Without it, encrypted backups cannot be recovered.
4. Open **Actions > Daily encrypted curriculum backup > Run workflow**. Do not assume backups are active until the first run succeeds and its encrypted artifact has passed an offline recovery test.
5. Enable GitHub Actions failure email notifications for this private repository. A failed or missing scheduled run needs investigation; the dashboard does not independently monitor backup freshness yet.

Default schedule: daily at **04:17 Pacific/Auckland**, automatically following daylight saving time. GitHub scheduling is best-effort and can be delayed or skipped; it is not a guaranteed recovery-point SLA.

Artifacts are retained for **14 days**, subject to the repository/account settings and available Actions storage. Check usage and budgets; uploaded documents increase backup size. Download a monthly verified archive to an approved independent location for longer retention. Do not enable paid overages without the account owner's approval.

## What Is Included

- Every current and archived programme workspace, with its complete mapping JSON, terminology, actions, staff profiles, external standards, dual-code cohort mappings, and access tokens.
- Saved versions, review comments, and the activity log, separated by programme.
- Document metadata and the actual uploaded file bytes, including archived documents, when the new Documents backend is enabled.
- A manifest with per-file byte counts and SHA-256 checksums.

Everything is encrypted with AES-256-GCM before it is uploaded as an artifact. A key derived using scrypt authenticates the encrypted header and contents. Encryption is not a substitute for keeping the repository private.

The exporter only reads production. It does not create, restore, rename, delete, or otherwise change a live workspace. A missing attachment, failed export, or failed integrity check makes the run fail; no incomplete archive is uploaded as a successful backup. The job also decrypts and verifies its own output before reporting success.

This is an application-level export across a time window, not an atomic PostgreSQL backup or point-in-time recovery. It does not include unrelated database schemas, Supabase Auth accounts, or unregistered storage objects. Keep provider database backups as a second layer. A whole-account takeover could affect both the app and the private GitHub repository, so keep periodic offline copies.

## Verify Or Recover Offline

Install Python 3.11 or later and the pinned requirements in an isolated environment. Provide `BACKUP_PASSPHRASE` securely through the environment, not as a command-line argument. Do not print it in a shared terminal.

```sh
python3 backup.py verify curriculum-EXAMPLE.cmap.enc
python3 backup.py unpack curriculum-EXAMPLE.cmap.enc --destination restored-example
```

The destination must not already exist. Authentication and checksum checks finish before any recovery files are extracted. Neither command writes to Supabase.

Inside the recovered folder:

- `manifest.json` identifies each programme's folder and backup times.
- `programmes/<workspace-id>/mapping.json` can be imported into a NEW test workspace using the dashboard's Import JSON.
- `programmes/<workspace-id>/files/<document-id>/...` contains the original attachments.
- `tables/` contains the relational exports needed for an administrator-led full recovery.

Import JSON does not re-upload documents or restore review comments. Test mapping imports and re-upload sample files into a separate test workspace before planning a production recovery. A full database/files restore needs administrator assistance; no automatic production overwrite is provided.

## Tests

```sh
python3 -m unittest -v test_backup.py
```

Tests use fictional programmes and files. No production credentials are required.
