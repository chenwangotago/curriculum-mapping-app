-- Curriculum Mapping Workspace: private-link collaborative backend
-- Run this in Supabase SQL Editor.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.curriculum_workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null default 'Untitled Programme',
  edit_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  view_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.curriculum_workspace_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.curriculum_workspaces(id) on delete cascade,
  label text not null,
  notes text,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.curriculum_workspaces enable row level security;
alter table public.curriculum_workspace_versions enable row level security;

-- Do not expose tables directly to the public anon role.
drop policy if exists "No direct workspace access" on public.curriculum_workspaces;
drop policy if exists "No direct version access" on public.curriculum_workspace_versions;
create policy "No direct workspace access" on public.curriculum_workspaces for all using (false);
create policy "No direct version access" on public.curriculum_workspace_versions for all using (false);

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
    'editToken', row.edit_token,
    'viewToken', row.view_token,
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
begin
  select * into row
  from public.curriculum_workspaces
  where slug = workspace_slug
    and archived_at is null
    and (edit_token = access_token or view_token = access_token);

  if not found then
    raise exception 'Workspace not found or token invalid';
  end if;

  can_edit := row.edit_token = access_token;

  return jsonb_build_object(
    'slug', row.slug,
    'title', row.title,
    'canEdit', can_edit,
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
begin
  update public.curriculum_workspaces
  set data = next_data,
      title = coalesce(nullif(next_data #>> '{meta,workspaceTitle}', ''), nullif(next_data #>> '{meta,programme}', ''), title)
  where slug = workspace_slug
    and edit_token = access_token
    and archived_at is null
  returning * into row;

  if not found then
    raise exception 'Workspace not found, read-only, or token invalid';
  end if;

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
    and edit_token = access_token
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
    and (edit_token = access_token or view_token = access_token);

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

grant usage on schema public to anon;
grant usage on schema extensions to anon;
grant execute on function public.create_curriculum_workspace(text, jsonb) to anon;
grant execute on function public.load_curriculum_workspace(text, text) to anon;
grant execute on function public.save_curriculum_workspace(text, text, jsonb) to anon;
grant execute on function public.create_curriculum_workspace_version(text, text, text, text, jsonb) to anon;
grant execute on function public.list_curriculum_workspace_versions(text, text) to anon;
