-- Apply after supabase-schema.sql and supabase-documents.sql.
-- Review permissions are separate from mapping JSON and never rewrite programme data.
create schema if not exists curriculum_private;
revoke all on schema curriculum_private from public, anon, authenticated;

create table if not exists curriculum_private.review_settings (
  workspace_id uuid primary key references public.curriculum_workspaces(id) on delete cascade,
  password_hash text,
  password_revision integer not null default 0,
  hidden_tabs jsonb not null default '[]',
  hidden_blocks jsonb not null default '[]',
  failed_attempts integer not null default 0,
  attempt_window timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists curriculum_private.review_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.curriculum_workspaces(id) on delete cascade,
  secret_hash text unique not null,
  link_hash text not null,
  manager boolean not null default false,
  password_revision integer not null default 0,
  author text not null default '',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists review_sessions_workspace_idx on curriculum_private.review_sessions(workspace_id, created_at);
alter table curriculum_private.review_settings enable row level security;
alter table curriculum_private.review_sessions enable row level security;
revoke all on all tables in schema curriculum_private from public, anon, authenticated;
alter table public.curriculum_workspace_comments add column if not exists reviewer_id uuid references curriculum_private.review_sessions(id);
alter table public.curriculum_workspace_comments add column if not exists parent_id uuid references public.curriculum_workspace_comments(id) on delete cascade;
create index if not exists curriculum_comments_reviewer_idx on public.curriculum_workspace_comments(workspace_id, reviewer_id, created_at);
create index if not exists curriculum_comments_parent_idx on public.curriculum_workspace_comments(parent_id);

create or replace function curriculum_private.pick(value jsonb, keys text[]) returns jsonb
language sql immutable set search_path = '' as $$
 select coalesce(jsonb_object_agg(key, val), '{}'::jsonb)
 from jsonb_each(coalesce(value, '{}')) as e(key,val) where key = any(keys);
$$;
create or replace function curriculum_private.actor(w public.curriculum_workspaces, token text)
returns curriculum_private.review_sessions language sql stable security definer set search_path = '' as $$
 select s from curriculum_private.review_sessions s
 left join curriculum_private.review_settings cfg on cfg.workspace_id=w.id
 where s.workspace_id=w.id and s.secret_hash=encode(extensions.digest(token,'sha256'),'hex')
 and s.link_hash=encode(extensions.digest(w.view_token,'sha256'),'hex') and s.expires_at>now()
 and (not s.manager or s.password_revision=cfg.password_revision);
$$;
create or replace function curriculum_private.allowed(cfg jsonb, key text) returns boolean
language sql immutable set search_path = '' as $$
 select not (coalesce(cfg->'hiddenTabs','[]') ? split_part(key,':',1))
 and not (coalesce(cfg->'hiddenBlocks','[]') ? key);
$$;
create or replace function curriculum_private.uri_component(value text) returns text
language sql immutable set search_path = '' as $$
 select coalesce(string_agg(case
   when b between 48 and 57 or b between 65 and 90 or b between 97 and 122 or b=any(array[45,95,46,33,126,42,39,40,41]) then chr(b)
   else '%' || upper(lpad(to_hex(b),2,'0')) end,'' order by i),'')
 from (select i,get_byte(convert_to(value,'UTF8'),i) b from generate_series(0,octet_length(value)-1) i) bytes;
$$;
create or replace function curriculum_private.policy(workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cfg jsonb; tabs jsonb; blocks jsonb; key text;
begin
 select jsonb_build_object('hiddenTabs',hidden_tabs,'hiddenBlocks',hidden_blocks) into cfg
 from curriculum_private.review_settings where workspace_id=workspace;
 cfg:=coalesce(cfg,'{"hiddenTabs":[],"hiddenBlocks":[]}');
 tabs:=cfg->'hiddenTabs'; blocks:=cfg->'hiddenBlocks';
 -- Source blocks are redacted everywhere. Derived views close conservatively.
 if not curriculum_private.allowed(cfg,'programme:plos') then
   blocks:=blocks || '["programme:alignment","paper:plos","paper:vertical","assessment:evidence","assessment:summary","assessment:programmeEvidence"]';
   tabs:=tabs || '["accreditation"]';
 end if;
 if not curriculum_private.allowed(cfg,'programme:alignment') or not curriculum_private.allowed(cfg,'paper:plos') then
   blocks:=blocks || '["programme:alignment","paper:plos","paper:vertical"]';
 end if;
 if not curriculum_private.allowed(cfg,'programme:network') or not curriculum_private.allowed(cfg,'paper:network') then
   blocks:=blocks || '["programme:network","paper:network"]';
 end if;
 if not curriculum_private.allowed(cfg,'paper:clos') then blocks:=blocks || '["paper:vertical","paper:internal","paper:secondSide"]'; end if;
 if not curriculum_private.allowed(cfg,'paper:activities') then blocks:=blocks || '["paper:internal","paper:secondSide"]'; end if;
 if not curriculum_private.allowed(cfg,'assessment:items') or not curriculum_private.allowed(cfg,'paper:assessments') then
   tabs:=tabs || '["assessment"]'; blocks:=blocks || '["paper:assessments","paper:internal","paper:vertical","paper:secondSide"]';
 end if;
 if not curriculum_private.allowed(cfg,'assessment:evidence') then
   blocks:=blocks || '["assessment:summary","assessment:programmeEvidence","paper:vertical"]';
 end if;
 if jsonb_array_length(cfg->'hiddenTabs')+jsonb_array_length(cfg->'hiddenBlocks')>0 then
   tabs:=tabs || '["staff","actions"]';
   blocks:=blocks || '["paper:diagnosis"]';
 end if;
 select coalesce(jsonb_agg(distinct v),'[]') into tabs from jsonb_array_elements(tabs) v;
 select coalesce(jsonb_agg(distinct v),'[]') into blocks from jsonb_array_elements(blocks) v;
 return jsonb_build_object('hiddenTabs',tabs,'hiddenBlocks',blocks);
end; $$;

create or replace function curriculum_private.project(data jsonb, cfg jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare result jsonb; papers jsonb:='[]'; assessments jsonb:='[]'; frameworks jsonb:='[]';
 p jsonb; a jsonb; f jsonb; k text; design jsonb; second_hidden boolean;
begin
 result:=jsonb_build_object(
 'meta',curriculum_private.pick(data->'meta',array['programme','workspaceTitle','department','version','levelGroupingMode']),
 'wording',curriculum_private.pick(data->'wording',array['tabs','programme','alignment','network','assessment','paper','accreditation','documents','staff','actions']), 'plos','[]'::jsonb,'papers','[]'::jsonb,
 'alignments','{}'::jsonb,'secondaryAlignments','{}'::jsonb,'notes','{}'::jsonb,
 'pathways','[]'::jsonb,'connections','[]'::jsonb,'assessments','[]'::jsonb,
 'actions','[]'::jsonb,'noteActions','{}'::jsonb,'staffNotes','{}'::jsonb,'staffProfiles','{}'::jsonb,
 'externalFrameworks','[]'::jsonb);
 if curriculum_private.allowed(cfg,'programme:plos') then result:=jsonb_set(result,'{plos}',coalesce(data->'plos','[]')); end if;
 if curriculum_private.allowed(cfg,'programme:alignment') then
   result:=result || curriculum_private.pick(data,array['alignments','secondaryAlignments']);
   if curriculum_private.allowed(cfg,'actions:diagnosis') then result:=jsonb_set(result,'{notes}',coalesce(data->'notes','{}')); end if;
 end if;
 if curriculum_private.allowed(cfg,'programme:network') then result:=result || curriculum_private.pick(data,array['connections','pathways']); end if;
 for p in select value from jsonb_array_elements(coalesce(data->'papers','[]')) loop
   p:=curriculum_private.pick(p,array['id','code','title','level','x','y','structure','secondaryCode','secondaryLevel','secondaryNzqfLevel','requirement','deliveryMode','nzqfLevel','points','teachingStaff','status','roles','description','concepts','learningOutcomes','learningActivities','courseOutcomes','learningActivityItems','secondaryLearningOutcomes','secondaryLearningActivities','secondaryCourseOutcomes','secondaryLearningActivityItems','secondaryAssessmentNotes','designAlignment','diagnosisNote']);
   if not curriculum_private.allowed(cfg,'paper:profile') then
     p:=p - array['requirement','deliveryMode','nzqfLevel','points','teachingStaff','status','secondaryNzqfLevel'];
   end if;
   if not curriculum_private.allowed(cfg,'staff:summary') then p:=jsonb_set(p,'{teachingStaff}','""'); end if;
   if not curriculum_private.allowed(cfg,'paper:roles') then p:=jsonb_set(p,'{roles}','[]'); end if;
   if not curriculum_private.allowed(cfg,'paper:description') then p:=jsonb_set(p,'{description}','""'); end if;
   if not curriculum_private.allowed(cfg,'paper:concepts') then p:=jsonb_set(p,'{concepts}','""'); end if;
   if not curriculum_private.allowed(cfg,'paper:diagnosis') then p:=jsonb_set(p,'{diagnosisNote}','""'); end if;
   if not curriculum_private.allowed(cfg,'paper:clos') then
     p:=p || '{"learningOutcomes":"","courseOutcomes":[]}';
   end if;
   if not curriculum_private.allowed(cfg,'paper:activities') then
     p:=p || '{"learningActivities":"","learningActivityItems":[]}';
   end if;
   second_hidden:=not curriculum_private.allowed(cfg,'paper:secondSide');
   if second_hidden then p:=p || '{"secondaryLearningOutcomes":"","secondaryLearningActivities":"","secondaryAssessmentNotes":"","secondaryCourseOutcomes":[],"secondaryLearningActivityItems":[]}'; end if;
   design:='{}';
   if curriculum_private.allowed(cfg,'paper:vertical') and not second_hidden then design:=design || curriculum_private.pick(p->'designAlignment',array['ploClos']); end if;
   if curriculum_private.allowed(cfg,'paper:internal') and not second_hidden then design:=design || curriculum_private.pick(p->'designAlignment',array['cloActivities','cloAssessments']); end if;
   p:=jsonb_set(p,'{designAlignment}',design);
   papers:=papers || jsonb_build_array(p);
 end loop;
 result:=jsonb_set(result,'{papers}',papers);
 if curriculum_private.allowed(cfg,'assessment:items') then
   for a in select value from jsonb_array_elements(coalesce(data->'assessments','[]')) loop
     a:=curriculum_private.pick(a,array['id','paperId','name','week','weight','mode','purpose','side','evidence','diagnosisNote']);
     if not curriculum_private.allowed(cfg,'assessment:evidence') then a:=jsonb_set(a,'{evidence}','{}'); end if;
     if not curriculum_private.allowed(cfg,'actions:diagnosis') then a:=jsonb_set(a,'{diagnosisNote}','""'); end if;
     if curriculum_private.allowed(cfg,'paper:secondSide') or coalesce(a->>'side','')<>'Second code side' then assessments:=assessments || jsonb_build_array(a); end if;
   end loop;
 end if;
 result:=jsonb_set(result,'{assessments}',assessments);
 for f in select value from jsonb_array_elements(coalesce(data->'externalFrameworks','[]')) loop
   if curriculum_private.allowed(cfg,'accreditation:framework-' || curriculum_private.uri_component(f->>'id')) then
     frameworks:=frameworks || jsonb_build_array(curriculum_private.pick(f,array['id','name','organisation','version','source','notes','standards']));
   end if;
 end loop;
 result:=jsonb_set(result,'{externalFrameworks}',frameworks);
 if curriculum_private.allowed(cfg,'staff:summary') then result:=result || curriculum_private.pick(data,array['staffProfiles','staffNotes']); end if;
 if curriculum_private.allowed(cfg,'actions:diagnosis') then result:=result || curriculum_private.pick(data,array['actions','noteActions']); end if;
 return result;
end; $$;

create or replace function public.load_curriculum_workspace(workspace_slug text, access_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.curriculum_workspaces; s curriculum_private.review_sessions; cfg jsonb; admin boolean; editor boolean; settings curriculum_private.review_settings;
begin
 select * into w from public.curriculum_workspaces where slug=workspace_slug and archived_at is null;
 if not found then raise exception 'Workspace not found or access invalid'; end if;
 s:=curriculum_private.actor(w,access_token);
 admin:=coalesce(w.admin_token=access_token,false); editor:=admin or coalesce(w.edit_token=access_token,false);
 if not editor and access_token is distinct from w.view_token and s.id is null then raise exception 'Workspace not found or access invalid'; end if;
 select * into settings from curriculum_private.review_settings where workspace_id=w.id;
 cfg:=curriculum_private.policy(w.id);
 return jsonb_build_object('slug',w.slug,'title',w.title,'canEdit',editor,'canManageTemplate',admin,
 'adminToken',case when admin then w.admin_token end,'editToken',case when admin then w.edit_token end,
 'viewToken',case when editor then w.view_token end,
 'data',case when editor then w.data else curriculum_private.project(w.data,cfg) end,
 'review',jsonb_build_object('manager',coalesce(s.manager,false),'author',coalesce(s.author,''),
   'passwordConfigured',settings.password_hash is not null,'hiddenTabs',case when editor then '[]'::jsonb else cfg->'hiddenTabs' end,
   'hiddenBlocks',case when editor then '[]'::jsonb else cfg->'hiddenBlocks' end),
 'updatedAt',greatest(w.updated_at,coalesce(settings.updated_at,w.updated_at)));
end; $$;

create or replace function public.start_curriculum_review(workspace_slug text, access_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.curriculum_workspaces; secret text;
begin
 select * into w from public.curriculum_workspaces where slug=workspace_slug and view_token=access_token and archived_at is null;
 if not found then raise exception 'Review link invalid'; end if;
 if (select count(*) from curriculum_private.review_sessions where workspace_id=w.id and created_at>now()-interval '1 day')>=500 then raise exception 'Too many review sessions. Contact the programme administrator.'; end if;
 secret:='review_' || encode(extensions.gen_random_bytes(32),'hex');
 insert into curriculum_private.review_sessions(workspace_id,secret_hash,link_hash,expires_at)
 values(w.id,encode(extensions.digest(secret,'sha256'),'hex'),encode(extensions.digest(w.view_token,'sha256'),'hex'),now()+interval '1 year');
 return jsonb_build_object('token',secret);
end; $$;

create or replace function public.login_curriculum_review_manager(workspace_slug text, access_token text, manager_password text, manager_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.curriculum_workspaces; cfg curriculum_private.review_settings; secret text;
begin
 select * into w from public.curriculum_workspaces where slug=workspace_slug and view_token=access_token and archived_at is null;
 if not found then return jsonb_build_object('error','Review link invalid'); end if;
 select * into cfg from curriculum_private.review_settings where workspace_id=w.id for update;
 if not found or cfg.password_hash is null then return jsonb_build_object('error','The administrator must first set a programme lead password.'); end if;
 if cfg.attempt_window<now()-interval '15 minutes' then cfg.failed_attempts:=0; cfg.attempt_window:=now(); end if;
 if cfg.failed_attempts>=10 then return jsonb_build_object('error','Too many attempts. Wait 15 minutes before trying again.'); end if;
 if octet_length(coalesce(manager_password,''))>72 or extensions.crypt(coalesce(manager_password,''),cfg.password_hash)<>cfg.password_hash then
   update curriculum_private.review_settings set failed_attempts=cfg.failed_attempts+1,attempt_window=cfg.attempt_window where workspace_id=w.id;
   return jsonb_build_object('error','Password not recognised');
 end if;
 if length(trim(coalesce(manager_name,''))) not between 1 and 120 then return jsonb_build_object('error','Enter your name (up to 120 characters).'); end if;
 secret:='review_' || encode(extensions.gen_random_bytes(32),'hex');
 insert into curriculum_private.review_sessions(workspace_id,secret_hash,link_hash,manager,password_revision,author,expires_at)
 values(w.id,encode(extensions.digest(secret,'sha256'),'hex'),encode(extensions.digest(w.view_token,'sha256'),'hex'),true,cfg.password_revision,trim(manager_name),now()+interval '8 hours');
 update curriculum_private.review_settings set failed_attempts=0,attempt_window=now() where workspace_id=w.id;
 return jsonb_build_object('token',secret);
end; $$;

create or replace function public.curriculum_review_settings(workspace_slug text, access_token text, next_settings jsonb default null, new_password text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.curriculum_workspaces; s curriculum_private.review_sessions; cfg curriculum_private.review_settings; admin boolean; key text;
begin
 select * into w from public.curriculum_workspaces where slug=workspace_slug and archived_at is null;
 if not found then raise exception 'Access denied'; end if;
 s:=curriculum_private.actor(w,access_token); admin:=coalesce(w.admin_token=access_token,false);
 if not admin and not coalesce(s.manager,false) then raise exception 'Programme lead or administrator access required'; end if;
 insert into curriculum_private.review_settings(workspace_id) values(w.id) on conflict do nothing;
 select * into cfg from curriculum_private.review_settings where workspace_id=w.id for update;
 if new_password is not null then
   if not admin then raise exception 'Only the administrator can set or reset the password'; end if;
   if octet_length(new_password) not between 12 and 72 then raise exception 'Use a password of 12 to 72 bytes'; end if;
   update curriculum_private.review_settings set password_hash=extensions.crypt(new_password,extensions.gen_salt('bf',12)),
   password_revision=password_revision+1,failed_attempts=0,attempt_window=now(),updated_at=now() where workspace_id=w.id;
 end if;
 if next_settings is not null then
   if jsonb_typeof(next_settings->'hiddenTabs') is distinct from 'array' or jsonb_typeof(next_settings->'hiddenBlocks') is distinct from 'array'
     or jsonb_array_length(next_settings->'hiddenTabs')>7 or jsonb_array_length(next_settings->'hiddenBlocks')>200 then raise exception 'Invalid visibility settings'; end if;
   for key in select jsonb_array_elements_text(next_settings->'hiddenTabs') loop
     if not (key=any(array['programme','assessment','paper','accreditation','documents','staff','actions'])) then raise exception 'Unknown tab'; end if;
   end loop;
   for key in select jsonb_array_elements_text(next_settings->'hiddenBlocks') loop
     if key !~ '^(programme|assessment|paper|accreditation|documents|staff|actions):[a-zA-Z0-9_.%-]+$' or length(key)>240 then raise exception 'Invalid block'; end if;
   end loop;
   update curriculum_private.review_settings set hidden_tabs=next_settings->'hiddenTabs',hidden_blocks=next_settings->'hiddenBlocks',updated_at=now() where workspace_id=w.id;
 end if;
 if next_settings is not null or new_password is not null then
   insert into public.curriculum_workspace_activity(workspace_id,author,action,target,details)
   values(w.id,case when admin then 'Workspace admin' else s.author end,'Updated external review settings','External review',
     jsonb_build_object('passwordReset',new_password is not null,'visibilityChanged',next_settings is not null));
 end if;
 select * into cfg from curriculum_private.review_settings where workspace_id=w.id;
 return jsonb_build_object('hiddenTabs',cfg.hidden_tabs,'hiddenBlocks',cfg.hidden_blocks,'passwordConfigured',cfg.password_hash is not null,
   'effective',curriculum_private.policy(w.id),'wording',w.data->'wording',
   'frameworks',coalesce((select jsonb_agg(curriculum_private.pick(f,array['id','name'])) from jsonb_array_elements(coalesce(w.data->'externalFrameworks','[]')) f),'[]'));
end; $$;

create or replace function curriculum_private.target_allowed(cfg jsonb, target text) returns boolean
language sql immutable set search_path = '' as $$
 select case when target like 'block:%' then curriculum_private.allowed(cfg,split_part(target,':',2)||':'||split_part(target,':',3))
 when target like 'page:%' then not (cfg->'hiddenTabs' ? split_part(target,':',2))
 when target like 'paper:%' then not (cfg->'hiddenTabs' ? 'paper') else true end;
$$;
create or replace function public.list_curriculum_workspace_comments(workspace_slug text, access_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.curriculum_workspaces; s curriculum_private.review_sessions; cfg jsonb; manager boolean;
begin
 select * into w from public.curriculum_workspaces where slug=workspace_slug and archived_at is null;
 if not found then raise exception 'Access denied'; end if;
 s:=curriculum_private.actor(w,access_token); manager:=coalesce(w.admin_token=access_token,false) or coalesce(s.manager,false);
 if not manager and s.id is null then return '[]'; end if;
 cfg:=curriculum_private.policy(w.id);
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'author',c.author,'target',c.target,'body',c.body,'parentId',c.parent_id,'createdAt',c.created_at,'updatedAt',c.updated_at) order by c.created_at)
 from public.curriculum_workspace_comments c where c.workspace_id=w.id
 and (manager or (c.reviewer_id=s.id and curriculum_private.target_allowed(cfg,c.target)))),'[]');
end; $$;
create or replace function public.create_curriculum_workspace_comment(workspace_slug text, access_token text, comment_author text, comment_body text, comment_target text default 'Workspace') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.curriculum_workspaces; s curriculum_private.review_sessions; c public.curriculum_workspace_comments;
begin
 select * into w from public.curriculum_workspaces where slug=workspace_slug and archived_at is null;
 if not found then raise exception 'Access denied'; end if;
 s:=curriculum_private.actor(w,access_token);
 if s.id is null or s.manager then raise exception 'Use your private reviewer session to add a comment. Programme leads can reply to existing comments.'; end if;
 if length(trim(coalesce(comment_author,''))) not between 1 and 120 then raise exception 'Please enter your name (up to 120 characters)'; end if;
 if length(trim(coalesce(comment_body,''))) not between 1 and 20000 then raise exception 'Enter a comment of 1 to 20,000 characters'; end if;
 if length(coalesce(comment_target,''))>500 or not curriculum_private.target_allowed(curriculum_private.policy(w.id),comment_target) then raise exception 'This section is not available for review'; end if;
 if (select count(*) from public.curriculum_workspace_comments where reviewer_id=s.id and created_at>now()-interval '1 minute')>=10 then raise exception 'Please wait a minute before adding more comments'; end if;
 update curriculum_private.review_sessions set author=trim(comment_author) where id=s.id;
 insert into public.curriculum_workspace_comments(workspace_id,reviewer_id,author,target,body)
 values(w.id,s.id,trim(comment_author),comment_target,trim(comment_body)) returning * into c;
 insert into public.curriculum_workspace_activity(workspace_id,author,action,target,details)
 values(w.id,c.author,'Added private review comment',c.target,jsonb_build_object('commentId',c.id));
 return jsonb_build_object('id',c.id,'author',c.author,'target',c.target,'body',c.body,'createdAt',c.created_at,'updatedAt',c.updated_at);
end; $$;
create or replace function public.reply_curriculum_review_comment(workspace_slug text, access_token text, comment_id uuid, comment_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.curriculum_workspaces; s curriculum_private.review_sessions; parent public.curriculum_workspace_comments; c public.curriculum_workspace_comments;
begin
 select * into w from public.curriculum_workspaces where slug=workspace_slug and archived_at is null;
 if not found then raise exception 'Access denied'; end if;
 s:=curriculum_private.actor(w,access_token);
 if not coalesce(s.manager,false) then raise exception 'Programme lead access required'; end if;
 if length(trim(coalesce(comment_body,''))) not between 1 and 20000 then raise exception 'Enter a reply of 1 to 20,000 characters'; end if;
 select * into parent from public.curriculum_workspace_comments where id=comment_id and workspace_id=w.id and parent_id is null;
 if not found then raise exception 'Comment not found'; end if;
 insert into public.curriculum_workspace_comments(workspace_id,reviewer_id,parent_id,author,target,body)
 values(w.id,parent.reviewer_id,parent.id,s.author || ' (Programme lead)',parent.target,trim(comment_body)) returning * into c;
 insert into public.curriculum_workspace_activity(workspace_id,author,action,target,details)
 values(w.id,s.author,'Replied to review comment',c.target,jsonb_build_object('commentId',c.id,'parentId',parent.id));
 return jsonb_build_object('id',c.id);
end; $$;
create or replace function public.logout_curriculum_review(workspace_slug text, access_token text) returns void
language sql security definer set search_path = '' as $$
 delete from curriculum_private.review_sessions s using public.curriculum_workspaces w
 where s.workspace_id=w.id and w.slug=workspace_slug and s.secret_hash=encode(extensions.digest(access_token,'sha256'),'hex') and s.manager;
$$;

-- Historical versions contain full, unredacted programme data; never expose to review tokens.
create or replace function public.list_curriculum_workspace_versions(workspace_slug text, access_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.curriculum_workspaces;
begin
 select * into w from public.curriculum_workspaces where slug=workspace_slug and archived_at is null and (admin_token=access_token or edit_token=access_token);
 if not found then return '[]'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'label',v.label,'notes',v.notes,'createdAt',v.created_at,'data',v.data) order by v.created_at desc)
 from public.curriculum_workspace_versions v where v.workspace_id=w.id),'[]');
end; $$;
create or replace function public.resolve_curriculum_document_access(workspace_slug text, access_token text)
returns table(workspace_id uuid, can_edit boolean, can_manage_template boolean)
language plpgsql stable security definer set search_path = '' as $$
declare w public.curriculum_workspaces; s curriculum_private.review_sessions;
begin
 select * into w from public.curriculum_workspaces where slug=workspace_slug and archived_at is null;
 if not found then return; end if;
 s:=curriculum_private.actor(w,access_token);
 if w.admin_token=access_token or w.edit_token=access_token then return query select w.id,true,w.admin_token=access_token;
 elsif (w.view_token=access_token or s.id is not null) and curriculum_private.allowed(curriculum_private.policy(w.id),'documents:library') then
 return query select w.id,false,false;
 end if;
end; $$;

revoke all on all functions in schema curriculum_private from public, anon, authenticated;
revoke all on function public.load_curriculum_workspace(text,text), public.list_curriculum_workspace_comments(text,text),
 public.create_curriculum_workspace_comment(text,text,text,text,text), public.list_curriculum_workspace_versions(text,text) from public;
grant execute on function public.load_curriculum_workspace(text,text), public.list_curriculum_workspace_comments(text,text),
 public.create_curriculum_workspace_comment(text,text,text,text,text), public.list_curriculum_workspace_versions(text,text) to anon, authenticated, service_role;
revoke all on function public.start_curriculum_review(text,text), public.login_curriculum_review_manager(text,text,text,text),
 public.curriculum_review_settings(text,text,jsonb,text), public.reply_curriculum_review_comment(text,text,uuid,text),
 public.logout_curriculum_review(text,text) from public, anon, authenticated;
grant execute on function public.start_curriculum_review(text,text), public.login_curriculum_review_manager(text,text,text,text),
 public.curriculum_review_settings(text,text,jsonb,text), public.reply_curriculum_review_comment(text,text,uuid,text),
 public.logout_curriculum_review(text,text) to anon, authenticated;
revoke all on function public.resolve_curriculum_document_access(text,text) from public, anon, authenticated;
grant execute on function public.resolve_curriculum_document_access(text,text) to service_role;
