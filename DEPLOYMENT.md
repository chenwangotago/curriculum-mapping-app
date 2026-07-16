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
7. Use `Save snapshot` at milestones.
8. Use `Print / PDF` at the end of the workshop.
9. Use `Export JSON` as a backup.

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
