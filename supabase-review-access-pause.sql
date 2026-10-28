-- Emergency fail-closed rollback AFTER supabase-review-access.sql is installed.
-- Pauses ALL external review access; keeps editing/admin access and every data row.
-- Do not restore legacy read RPCs: they would expose private comments/hidden content.
begin;
create or replace function public.load_curriculum_workspace(workspace_slug text, access_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.curriculum_workspaces; admin boolean;
begin
 select * into w from public.curriculum_workspaces where slug=workspace_slug and archived_at is null and (admin_token=access_token or edit_token=access_token);
 if not found then raise exception 'External review is temporarily paused, or access is invalid'; end if;
 admin:=w.admin_token=access_token;
 return jsonb_build_object('slug',w.slug,'title',w.title,'canEdit',true,'canManageTemplate',admin,
 'adminToken',case when admin then w.admin_token end,'editToken',case when admin then w.edit_token end,
 'viewToken',w.view_token,'data',w.data,'updatedAt',w.updated_at);
end; $$;
create or replace function public.list_curriculum_workspace_comments(workspace_slug text, access_token text) returns jsonb
language sql security definer set search_path = '' as $$ select '[]'::jsonb; $$;
create or replace function public.resolve_curriculum_document_access(workspace_slug text, access_token text)
returns table(workspace_id uuid,can_edit boolean,can_manage_template boolean)
language sql stable security definer set search_path = '' as $$
 select w.id,true,w.admin_token=access_token from public.curriculum_workspaces w
 where w.slug=workspace_slug and w.archived_at is null and (w.admin_token=access_token or w.edit_token=access_token);
$$;
revoke execute on function public.start_curriculum_review(text,text), public.login_curriculum_review_manager(text,text,text,text),
 public.curriculum_review_settings(text,text,jsonb,text), public.reply_curriculum_review_comment(text,text,uuid,text),
 public.create_curriculum_workspace_comment(text,text,text,text,text) from public, anon, authenticated;
commit;
