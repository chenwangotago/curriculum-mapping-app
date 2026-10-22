-- Additive setup for the private Documents library. Run once in Supabase SQL Editor.
-- Existing mapping, comments, share links, and saved versions are not changed.
begin;

create table if not exists public.curriculum_workspace_documents (
  id uuid primary key,
  workspace_id uuid not null references public.curriculum_workspaces(id) on delete cascade,
  storage_path text unique not null,
  filename text not null check (length(filename) between 1 and 240),
  content_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 6291456),
  title text not null check (length(title) between 1 and 200),
  category text not null check (category in ('Programme design', 'Proposal', 'Policy', 'Course documentation', 'Other')),
  version text not null default '' check (length(version) <= 100),
  notes text not null default '' check (length(notes) <= 10000),
  uploaded_by text not null default '' check (length(uploaded_by) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists curriculum_documents_workspace_idx
  on public.curriculum_workspace_documents (workspace_id, created_at desc);
alter table public.curriculum_workspace_documents enable row level security;
revoke all on table public.curriculum_workspace_documents from public, anon, authenticated;
grant select, insert, update, delete on table public.curriculum_workspace_documents to service_role;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'curriculum_documents_touch_updated_at'
    and tgrelid = 'public.curriculum_workspace_documents'::regclass) then
    create trigger curriculum_documents_touch_updated_at
      before update on public.curriculum_workspace_documents
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- Only the server-side gateway can resolve a capability token to a workspace ID.
create or replace function public.resolve_curriculum_document_access(workspace_slug text, access_token text)
returns table (workspace_id uuid, can_edit boolean, can_manage_template boolean)
language sql stable security definer set search_path = ''
as $$
  select w.id, w.admin_token = access_token or w.edit_token = access_token, w.admin_token = access_token
  from public.curriculum_workspaces w
  where w.slug = workspace_slug and w.archived_at is null
    and (w.admin_token = access_token or w.edit_token = access_token or w.view_token = access_token);
$$;
revoke all on function public.resolve_curriculum_document_access(text, text) from public, anon, authenticated;
grant execute on function public.resolve_curriculum_document_access(text, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('curriculum-documents', 'curriculum-documents', false, 6291456, array[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv'
]) on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A restrictive rule also protects this bucket if another bucket has broad policies.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'Curriculum documents require private gateway') then
    create policy "Curriculum documents require private gateway" on storage.objects
      as restrictive for all to anon, authenticated
      using (bucket_id <> 'curriculum-documents') with check (bucket_id <> 'curriculum-documents');
  end if;
end $$;

commit;
