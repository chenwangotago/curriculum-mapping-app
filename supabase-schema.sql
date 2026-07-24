-- Curriculum Mapping Workspace: private-link collaborative backend
-- Run this in Supabase SQL Editor.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.curriculum_workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null default 'Untitled Programme',
  admin_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  edit_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  view_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

-- Existing workspaces created before admin links keep their current edit URL as the
-- admin setup link. A fresh participant edit token is generated for future sharing.
alter table public.curriculum_workspaces add column if not exists admin_token text;
alter table public.curriculum_workspaces alter column admin_token set default encode(extensions.gen_random_bytes(24), 'hex');
update public.curriculum_workspaces
set admin_token = edit_token,
    edit_token = encode(extensions.gen_random_bytes(24), 'hex')
where admin_token is null;
alter table public.curriculum_workspaces alter column admin_token set not null;

create table if not exists public.curriculum_workspace_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.curriculum_workspaces(id) on delete cascade,
  label text not null,
  notes text,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_workspace_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.curriculum_workspaces(id) on delete cascade,
  author text not null default 'Anonymous reviewer',
  target text not null default 'Workspace',
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_workspace_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.curriculum_workspaces(id) on delete cascade,
  author text not null default 'Unknown',
  action text not null,
  target text not null default 'Workspace',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_workspace_presence (
  workspace_id uuid not null references public.curriculum_workspaces(id) on delete cascade,
  client_id text not null,
  author text not null default 'Unknown',
  field_key text not null,
  field_label text not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, client_id)
);

alter table public.curriculum_workspaces enable row level security;
alter table public.curriculum_workspace_versions enable row level security;
alter table public.curriculum_workspace_comments enable row level security;
alter table public.curriculum_workspace_activity enable row level security;
alter table public.curriculum_workspace_presence enable row level security;

-- Do not expose tables directly to the public anon role.
drop policy if exists "No direct workspace access" on public.curriculum_workspaces;
drop policy if exists "No direct version access" on public.curriculum_workspace_versions;
drop policy if exists "No direct comment access" on public.curriculum_workspace_comments;
drop policy if exists "No direct activity access" on public.curriculum_workspace_activity;
drop policy if exists "No direct presence access" on public.curriculum_workspace_presence;
create policy "No direct workspace access" on public.curriculum_workspaces for all using (false);
create policy "No direct version access" on public.curriculum_workspace_versions for all using (false);
create policy "No direct comment access" on public.curriculum_workspace_comments for all using (false);
create policy "No direct activity access" on public.curriculum_workspace_activity for all using (false);
create policy "No direct presence access" on public.curriculum_workspace_presence for all using (false);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists curriculum_workspaces_touch_updated_at on public.curriculum_workspaces;
create trigger curriculum_workspaces_touch_updated_at
before update on public.curriculum_workspaces
for each row execute function public.touch_updated_at();

create or replace function public.make_workspace_slug(title text)
returns text
language plpgsql
set search_path = public, extensions
as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(coalesce(title, 'programme'), '[^a-zA-Z0-9]+', '-', 'g'));
  base := trim(both '-' from base);
  if base = '' then
    base := 'programme';
  end if;
  candidate := base || '-' || substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8);
  return candidate;
end;
$$;

create or replace function public.create_curriculum_workspace(title text, initial_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  row curriculum_workspaces;
begin
  insert into public.curriculum_workspaces (slug, title, data)
  values (public.make_workspace_slug(title), coalesce(title, 'Untitled Programme'), initial_data)
  returning * into row;

  return jsonb_build_object(
    'slug', row.slug,
    'title', row.title,
    'adminToken', row.admin_token,
    'editToken', row.edit_token,
    'viewToken', row.view_token,
    'canEdit', true,
    'canManageTemplate', true,
    'data', row.data,
    'updatedAt', row.updated_at
  );
end;
$$;

create or replace function public.load_curriculum_workspace(workspace_slug text, access_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row curriculum_workspaces;
  can_edit boolean;
  can_manage_template boolean;
begin
  select * into row
  from public.curriculum_workspaces
  where slug = workspace_slug
    and archived_at is null
    and (admin_token = access_token or edit_token = access_token or view_token = access_token);

  if not found then
    raise exception 'Workspace not found or token invalid';
  end if;

  can_manage_template := row.admin_token = access_token;
  can_edit := can_manage_template or row.edit_token = access_token;

  return jsonb_build_object(
    'slug', row.slug,
    'title', row.title,
    'canEdit', can_edit,
    'canManageTemplate', can_manage_template,
    'adminToken', case when can_manage_template then row.admin_token else null end,
    'editToken', case when can_manage_template then row.edit_token else null end,
    'viewToken', case when can_edit then row.view_token else null end,
    'data', row.data,
    'updatedAt', row.updated_at
  );
end;
$$;

create or replace function public.save_curriculum_workspace(workspace_slug text, access_token text, next_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row curriculum_workspaces;
  can_manage_template boolean;
  data_to_save jsonb;
begin
  select * into row
  from public.curriculum_workspaces
  where slug = workspace_slug
    and archived_at is null
    and (admin_token = access_token or edit_token = access_token);

  if not found then
    raise exception 'Workspace not found, read-only, or token invalid';
  end if;

  can_manage_template := row.admin_token = access_token;
  data_to_save := next_data;

  if not can_manage_template then
    data_to_save := jsonb_set(data_to_save, '{wording}', coalesce(row.data -> 'wording', 'null'::jsonb), true);
    data_to_save := jsonb_set(data_to_save, '{meta,workspaceTitle}', coalesce(row.data #> '{meta,workspaceTitle}', 'null'::jsonb), true);
  end if;

  update public.curriculum_workspaces
  set data = data_to_save,
      title = case
        when can_manage_template
          then coalesce(nullif(data_to_save #>> '{meta,workspaceTitle}', ''), nullif(data_to_save #>> '{meta,programme}', ''), title)
        else title
      end
  where id = row.id
  returning * into row;

  return jsonb_build_object(
    'slug', row.slug,
    'title', row.title,
    'data', row.data,
    'updatedAt', row.updated_at
  );
end;
$$;

create or replace function public.create_curriculum_workspace_version(
  workspace_slug text,
  access_token text,
  version_label text,
  version_notes text,
  version_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace curriculum_workspaces;
  version curriculum_workspace_versions;
begin
  select * into workspace
  from public.curriculum_workspaces
  where slug = workspace_slug
    and (admin_token = access_token or edit_token = access_token)
    and archived_at is null;

  if not found then
    raise exception 'Workspace not found, read-only, or token invalid';
  end if;

  insert into public.curriculum_workspace_versions (workspace_id, label, notes, data)
  values (workspace.id, version_label, version_notes, version_data)
  returning * into version;

  return jsonb_build_object(
    'id', version.id,
    'label', version.label,
    'notes', version.notes,
    'createdAt', version.created_at
  );
end;
$$;

create or replace function public.list_curriculum_workspace_versions(workspace_slug text, access_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace curriculum_workspaces;
begin
  select * into workspace
  from public.curriculum_workspaces
  where slug = workspace_slug
    and archived_at is null
    and (admin_token = access_token or edit_token = access_token or view_token = access_token);

  if not found then
    raise exception 'Workspace not found or token invalid';
  end if;

  return coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'label', v.label,
        'notes', v.notes,
        'createdAt', v.created_at,
        'data', v.data
      ) order by v.created_at desc)
      from public.curriculum_workspace_versions v
      where v.workspace_id = workspace.id
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.create_curriculum_workspace_comment(
  workspace_slug text,
  access_token text,
  comment_author text,
  comment_body text,
  comment_target text default 'Workspace'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace curriculum_workspaces;
  comment curriculum_workspace_comments;
begin
  select * into workspace
  from public.curriculum_workspaces
  where slug = workspace_slug
    and archived_at is null
    and (admin_token = access_token or edit_token = access_token or view_token = access_token);

  if not found then
    raise exception 'Workspace not found or token invalid';
  end if;

  insert into public.curriculum_workspace_comments (workspace_id, author, target, body)
  values (
    workspace.id,
    coalesce(nullif(comment_author, ''), 'Anonymous reviewer'),
    coalesce(nullif(comment_target, ''), 'Workspace'),
    comment_body
  )
  returning * into comment;

  insert into public.curriculum_workspace_activity (workspace_id, author, action, target, details)
  values (
    workspace.id,
    comment.author,
    'Added review comment',
    comment.target,
    jsonb_build_object('commentId', comment.id)
  );

  return jsonb_build_object(
    'id', comment.id,
    'author', comment.author,
    'target', comment.target,
    'body', comment.body,
    'createdAt', comment.created_at
  );
end;
$$;

create or replace function public.list_curriculum_workspace_comments(workspace_slug text, access_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace curriculum_workspaces;
begin
  select * into workspace
  from public.curriculum_workspaces
  where slug = workspace_slug
    and archived_at is null
    and (admin_token = access_token or edit_token = access_token or view_token = access_token);

  if not found then
    raise exception 'Workspace not found or token invalid';
  end if;

  return coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'author', c.author,
        'target', c.target,
        'body', c.body,
        'createdAt', c.created_at
      ) order by c.created_at desc)
      from (
        select *
        from public.curriculum_workspace_comments
        where workspace_id = workspace.id
        order by created_at desc
        limit 200
      ) c
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.create_curriculum_workspace_activity(
  workspace_slug text,
  access_token text,
  activity_author text,
  activity_action text,
  activity_target text default 'Workspace',
  activity_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace curriculum_workspaces;
  activity curriculum_workspace_activity;
begin
  select * into workspace
  from public.curriculum_workspaces
  where slug = workspace_slug
    and archived_at is null
    and (admin_token = access_token or edit_token = access_token);

  if not found then
    raise exception 'Workspace not found, read-only, or token invalid';
  end if;

  insert into public.curriculum_workspace_activity (workspace_id, author, action, target, details)
  values (
    workspace.id,
    coalesce(nullif(activity_author, ''), 'Unknown'),
    activity_action,
    coalesce(nullif(activity_target, ''), 'Workspace'),
    coalesce(activity_details, '{}'::jsonb)
  )
  returning * into activity;

  return jsonb_build_object(
    'id', activity.id,
    'author', activity.author,
    'action', activity.action,
    'target', activity.target,
    'details', activity.details,
    'createdAt', activity.created_at
  );
end;
$$;

create or replace function public.list_curriculum_workspace_activity(workspace_slug text, access_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace curriculum_workspaces;
begin
  select * into workspace
  from public.curriculum_workspaces
  where slug = workspace_slug
    and archived_at is null
    and admin_token = access_token;

  if not found then
    raise exception 'Workspace not found, admin only, or token invalid';
  end if;

  return coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'author', a.author,
        'action', a.action,
        'target', a.target,
        'details', a.details,
        'createdAt', a.created_at
      ) order by a.created_at desc)
      from (
        select *
        from public.curriculum_workspace_activity
        where workspace_id = workspace.id
        order by created_at desc
        limit 300
      ) a
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.list_curriculum_workspace_presence(workspace_slug text, access_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace curriculum_workspaces;
begin
  select * into workspace
  from public.curriculum_workspaces
  where slug = workspace_slug
    and archived_at is null
    and (admin_token = access_token or edit_token = access_token);

  if not found then
    raise exception 'Workspace not found, read-only, or token invalid';
  end if;

  delete from public.curriculum_workspace_presence
  where workspace_id = workspace.id
    and updated_at < now() - interval '20 seconds';

  return coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'clientId', p.client_id,
        'author', p.author,
        'fieldKey', p.field_key,
        'fieldLabel', p.field_label,
        'updatedAt', p.updated_at
      ) order by p.updated_at desc)
      from public.curriculum_workspace_presence p
      where p.workspace_id = workspace.id
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.set_curriculum_workspace_presence(
  workspace_slug text,
  access_token text,
  client_identifier text,
  presence_author text,
  presence_field_key text,
  presence_field_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace curriculum_workspaces;
begin
  select * into workspace
  from public.curriculum_workspaces
  where slug = workspace_slug
    and archived_at is null
    and (admin_token = access_token or edit_token = access_token);

  if not found then
    raise exception 'Workspace not found, read-only, or token invalid';
  end if;

  insert into public.curriculum_workspace_presence (workspace_id, client_id, author, field_key, field_label, updated_at)
  values (
    workspace.id,
    client_identifier,
    coalesce(nullif(presence_author, ''), 'Unknown'),
    presence_field_key,
    presence_field_label,
    now()
  )
  on conflict (workspace_id, client_id)
  do update set
    author = excluded.author,
    field_key = excluded.field_key,
    field_label = excluded.field_label,
    updated_at = now();

  return public.list_curriculum_workspace_presence(workspace_slug, access_token);
end;
$$;

create or replace function public.clear_curriculum_workspace_presence(
  workspace_slug text,
  access_token text,
  client_identifier text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace curriculum_workspaces;
begin
  select * into workspace
  from public.curriculum_workspaces
  where slug = workspace_slug
    and archived_at is null
    and (admin_token = access_token or edit_token = access_token);

  if not found then
    raise exception 'Workspace not found, read-only, or token invalid';
  end if;

  delete from public.curriculum_workspace_presence
  where workspace_id = workspace.id
    and client_id = client_identifier;

  return public.list_curriculum_workspace_presence(workspace_slug, access_token);
end;
$$;

grant usage on schema public to anon;
grant usage on schema extensions to anon;
grant execute on function public.create_curriculum_workspace(text, jsonb) to anon;
grant execute on function public.load_curriculum_workspace(text, text) to anon;
grant execute on function public.save_curriculum_workspace(text, text, jsonb) to anon;
grant execute on function public.create_curriculum_workspace_version(text, text, text, text, jsonb) to anon;
grant execute on function public.list_curriculum_workspace_versions(text, text) to anon;
grant execute on function public.create_curriculum_workspace_comment(text, text, text, text, text) to anon;
grant execute on function public.list_curriculum_workspace_comments(text, text) to anon;
grant execute on function public.create_curriculum_workspace_activity(text, text, text, text, text, jsonb) to anon;
grant execute on function public.list_curriculum_workspace_activity(text, text) to anon;
grant execute on function public.list_curriculum_workspace_presence(text, text) to anon;
grant execute on function public.set_curriculum_workspace_presence(text, text, text, text, text, text) to anon;
grant execute on function public.clear_curriculum_workspace_presence(text, text, text) to anon;
