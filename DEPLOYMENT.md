# Curriculum Mapping App Cloud Deployment

This app runs in two modes:

- Local mode: no setup required. Data is stored in the browser and can be exported as JSON/PDF.
- Private-link collaborative mode: GitHub Pages static app plus Supabase cloud workspace storage.

## Recommended Simple Stack

- GitHub Pages: hosts the static app files (`index.html`, `styles.css`, `app.js`, `config.js`).
- Supabase: stores each programme workspace, private edit/view tokens, and version snapshots.
- Browser print: exports the current workspace as PDF using `Print / PDF`.

GitHub alone is not enough for collaboration because GitHub Pages only serves static files. The editable programme data needs a database, which is why Supabase is used.

## Enable Private-Link Collaboration

1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase-schema.sql`.
3. Copy `config.example.js` to `config.js`.
4. Fill in:
   - `supabaseUrl`
   - `supabaseAnonKey`
5. Deploy the folder to GitHub Pages or another static host.

## How Links Work

The app creates links like:

```text
https://your-site/curriculum-mapping-app/?workspace=history-major-2026-ab12cd34&token=ADMIN_TOKEN
https://your-site/curriculum-mapping-app/?workspace=history-major-2026-ab12cd34&token=EDIT_TOKEN
https://your-site/curriculum-mapping-app/?workspace=history-major-2026-ab12cd34&token=VIEW_TOKEN
```

- Admin link: workspace owner/setup link. Can edit template wording, block titles, level bands, link title, import JSON, and create a new template.
- Edit link: programme team link. Can edit mapping content, but not template wording or block titles.
- View link: anyone with the link can view, export PDF/JSON, but not edit.

This is a private-link model, similar to "anyone with the link can edit" in a document editor.
It is not a full login/role system. Do not use it for highly sensitive data until an authenticated version is added.

## Programme Workflow

1. Open the deployed app.
2. Click `Create private link`.
3. Keep the admin link for the facilitator/template owner.
4. Use `Template wording` to customise terminology, block titles, and level bands for the programme.
5. Copy the edit link and share with the programme team.
6. Copy the view link if someone only needs to review/export.
7. Use `Save version` at milestones.
8. Use `Print / PDF` at the end of the workshop.
9. Use `Export JSON` as a backup.

To start another programme, use `New workspace` from an admin link. The app will ask for the programme name, create a separate cloud workspace, and switch to that new workspace's admin link.

## Reviewer Comments

Comments are available only through the workspace's read-only/review link. Editing and admin views have no comment buttons, either in the toolbar or beside blocks. External reviewers and programme team members use the same read-only link for feedback and responses; to respond, add a comment on the relevant block under your own name. This is a shared block-based conversation, not threaded replies.

In the read-only view, open the tab to review, then choose `Add comment`. Its target menu contains only that page and its available blocks. On Papers, select a paper first: block comments keep that paper's stable ID. A double-coded paper also offers its second-code section. `Review comments` lists existing comments across the workspace and can filter by their target.

Existing comments, mapping data, and server-side permissions are unchanged. No database migration or new share links are needed. The admin comment-management backend is retained, but the editable UI no longer exposes its entry points.

Run `python3 tests/review-comments-browser.py` with Chrome installed to check fictional reviewer, editor, and admin flows on desktop and mobile. The test mocks cloud responses and never accesses production workspaces.

## External Standards Mapping

The fourth tab, `External Accreditation`, maps the programme's existing PLOs to multiple standards sets. Each workspace keeps its own sets; existing workspaces start with an empty standards area. No Supabase schema change is required for this addition.

1. Use `Add standards set` to enter a name, issuing organisation, version, and source reference.
2. Add standards individually, or paste one standard per line using `code | title | statement`.
3. Tick every supporting PLO in each set's table and add mapping rationale where needed.
4. Review the PLO summary across all sets. Download the summary CSV for a PLO-centred view, or the detailed CSV for source metadata, individual links, rationale, and unmapped standards. Both open in Excel.

The complete mapping is included in JSON backups, saved versions, and the PDF report. Read-only reviewers can read, comment, and export; edit links can change sets and mappings. The page records the team's alignment judgements, not an accreditation decision. Official standards are not preloaded; use the correct source and version for the programme.

## Double-Coded / Dual-Level Papers

Keep a double-coded paper as one record with two codes and levels. The Program matrix displays two cohort rows within one shared teaching-delivery group, so each code can have its own I/D/A judgements. The network still has one card, staff summaries count one teaching paper, and programme discussion notes remain shared.

Existing shared judgements are copied into independent cohort rows and labelled as carried over. Review each cohort, edit its cells, or use `Confirm carried-over values` to retain its values after review. Changing or clearing one cohort does not change the other. Paper Details and the PDF display both code-specific contributions, and JSON backups and saved versions include both rows. No new links or Supabase schema migration are required.

## Documents And Private Uploads

The fifth tab, `Documents`, is a private file library for programme designs, proposals, policies, and course documentation. Staff and Actions move to positions six and seven; custom tab names remain unchanged. The mapping model and existing share links are unchanged.

This feature requires one-time backend setup in the existing Supabase project:

1. Run `supabase-documents.sql` in SQL Editor. It only adds a documents table, a private storage bucket, and a server-only access resolver; it does not update programme mapping data or rotate links.
2. Deploy the Edge Function `curriculum-documents` from `supabase/functions/curriculum-documents/index.js`. The dashboard editor can deploy this single-file JavaScript handler. Disable the gateway's legacy JWT verification for this function: the handler validates the workspace capability token itself on EVERY request. Never disable its internal permission checks.
3. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the server function. Do not copy a service-role key into the website or GitHub source. The function uses the pinned Supabase JS SDK.
4. The default permitted website origin is `https://chenwangotago.github.io`. If deploying elsewhere, set the server secret `DOCUMENT_ALLOWED_ORIGINS` to an explicit comma-separated list of trusted origins.
5. Test with a fictional cloud workspace: edit links can upload/edit/archive/restore; review links can list/download/comment, but all mutations must be rejected by the server. Check another programme's token cannot download the test file. Confirm the bucket is private.

CLI alternative after authenticating:

```sh
supabase functions deploy curriculum-documents --project-ref YOUR_PROJECT_REF
```

Supported files: PDF, Word (`.doc`, `.docx`), Excel, PowerPoint, UTF-8 text and CSV, up to 6 MiB each. Executables, HTML, and macro-enabled Office extensions are not accepted. Content-header checks are NOT malware scanning; upload trusted documents only. Downloads use short-lived signed attachment URLs rather than public object URLs. Anyone holding this workspace's review/edit/admin link can download its files; do not use this as a confidential student/personnel records system.

Files have generated, immutable workspace-scoped paths. A new content version is a new upload, not an overwrite. Details can be edited independently, with a server-side stale-revision check. Archive/Restore is reversible and keeps the original file. There is no permanent deletion or automatic cleanup in this first version; archived files still use storage.

The document catalogue and files are separate from the mapping JSON and version snapshots. Import JSON and restoring a mapping version do NOT replace the library. Export JSON, Save version and PDF do NOT back up actual uploaded files. Use the private backup starter below, or independently back up the bucket and its metadata.

Until the backend is enabled, the Documents tab reports that storage is unavailable; the rest of the dashboard continues working. No uploaded files are stored in public GitHub Pages.

## Daily Independent Backups

`backup-private-repository/` contains a tested, read-only export and encrypted recovery tool plus a daily GitHub Actions workflow. Place this folder's CONTENTS at the root of a separate PRIVATE repository, following its README. The nested workflow does not run inside this public app repository.

The workflow exports every programme, comments, saved versions, activity, document metadata, and registered attachments; encrypts the package; verifies decryption and per-file checksums; then stores an encrypted artifact for 14 days. It is scheduled for 04:17 Pacific/Auckland and can also run manually. Initial setup, private repository secrets, the first successful cloud run, and an offline recovery test are required before considering backups enabled.

This is an application-level export, not an atomic database snapshot or guaranteed scheduling SLA. It supplements, rather than replaces, provider database backups. See `backup-private-repository/README.md` for access restrictions, storage usage, recovery instructions, and limitations.

## Division Overview

The division overview lives at:

```text
https://your-site/curriculum-mapping-app/division.html
```

It is a lightweight admin/leadership dashboard that reads the programme workspace links you add to it. It does not automatically list every workspace in Supabase.

Recommended use:

1. Open `division.html`.
2. Paste one or more programme workspace links into `Programme workspace links`.
3. Prefer view links when leadership only needs read-only access.
4. Click `Add links`.
5. Use `Refresh data` to reload the latest programme data.
6. Use the CSV exports for programme-level and staff-level summary tables.

The list of programme sources is saved in the current browser only. For a future stricter division dashboard, add a separate cloud-saved division workspace and user login/roles.

## Collaboration Model

The first cloud version uses private links, autosave, and polling every few seconds for near-real-time updates.
This is intended for workshop collaboration with around 20 participants where people are mostly working in different areas of the map.

Important limitation: if two people edit the exact same field at the same time, the latest saved version wins.
For high-intensity simultaneous editing, the next upgrade should split the workspace into row-level records or add real-time conflict handling.

For a later stricter version, add:

- University SSO/login
- named users and permissions
- field-level conflict resolution
- workspace dashboard/folder listing

## Template Updates After Deployment

The template can still be changed after cloud deployment.

- UI/layout/text changes: update the GitHub Pages files and redeploy.
- Small data-model additions: add defaults in `normaliseState()` so existing programme workspaces continue to load.
- Major data-model changes: create a migration or keep an old template version available for programmes already in progress.
