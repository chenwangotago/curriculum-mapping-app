-- Additive programme lead username support; existing password-only setups remain valid.
-- Does not update mapping JSON, visibility settings, existing passwords or share URLs.
alter table curriculum_private.review_settings add column if not exists lead_username text;

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
 if (cfg.lead_username is not null and lower(trim(coalesce(manager_name,'')))<>lower(cfg.lead_username))
   or octet_length(coalesce(manager_password,''))>72 or extensions.crypt(coalesce(manager_password,''),cfg.password_hash)<>cfg.password_hash then
   update curriculum_private.review_settings set failed_attempts=cfg.failed_attempts+1,attempt_window=cfg.attempt_window where workspace_id=w.id;
   return jsonb_build_object('error','Username or password not recognised');
 end if;
 if length(trim(coalesce(manager_name,''))) not between 1 and 120 then return jsonb_build_object('error','Enter your name (up to 120 characters).'); end if;
 secret:='review_' || encode(extensions.gen_random_bytes(32),'hex');
 insert into curriculum_private.review_sessions(workspace_id,secret_hash,link_hash,manager,password_revision,author,expires_at)
 values(w.id,encode(extensions.digest(secret,'sha256'),'hex'),encode(extensions.digest(w.view_token,'sha256'),'hex'),true,cfg.password_revision,coalesce(cfg.lead_username,trim(manager_name)),now()+interval '8 hours');
 update curriculum_private.review_settings set failed_attempts=0,attempt_window=now() where workspace_id=w.id;
 return jsonb_build_object('token',secret);
end; $$;

create or replace function public.curriculum_review_settings(workspace_slug text, access_token text, next_settings jsonb default null, new_password text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.curriculum_workspaces; s curriculum_private.review_sessions; cfg curriculum_private.review_settings; admin boolean; key text; username text;
begin
 select * into w from public.curriculum_workspaces where slug=workspace_slug and archived_at is null;
 if not found then raise exception 'Access denied'; end if;
 s:=curriculum_private.actor(w,access_token); admin:=coalesce(w.admin_token=access_token,false);
 if not admin and not coalesce(s.manager,false) then raise exception 'Programme lead or administrator access required'; end if;
 insert into curriculum_private.review_settings(workspace_id) values(w.id) on conflict do nothing;
 select * into cfg from curriculum_private.review_settings where workspace_id=w.id for update;
 if next_settings ? 'leadUsername' then
   if not admin then raise exception 'Only the administrator can set the programme lead username'; end if;
   username:=trim(coalesce(next_settings->>'leadUsername',''));
   if length(username) not between 1 and 120 then raise exception 'Enter a programme lead username of 1 to 120 characters'; end if;
   if username is distinct from cfg.lead_username and new_password is null then raise exception 'Set a password when setting or changing the programme lead username'; end if;
   update curriculum_private.review_settings set lead_username=username where workspace_id=w.id;
 end if;
 if new_password is not null then
   if not admin then raise exception 'Only the administrator can set or reset the password'; end if;
   if octet_length(new_password) not between 12 and 72 then raise exception 'Use a password of 12 to 72 bytes'; end if;
   update curriculum_private.review_settings set password_hash=extensions.crypt(new_password,extensions.gen_salt('bf',12)),
   password_revision=password_revision+1,failed_attempts=0,attempt_window=now(),updated_at=now() where workspace_id=w.id;
 end if;
 if next_settings is not null and (next_settings ? 'hiddenTabs' or next_settings ? 'hiddenBlocks') then
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
     jsonb_build_object('passwordReset',new_password is not null,'usernameChanged',next_settings ? 'leadUsername','visibilityChanged',coalesce(next_settings ? 'hiddenTabs',false)));
 end if;
 select * into cfg from curriculum_private.review_settings where workspace_id=w.id;
 return jsonb_build_object('hiddenTabs',cfg.hidden_tabs,'hiddenBlocks',cfg.hidden_blocks,'passwordConfigured',cfg.password_hash is not null,'leadUsername',cfg.lead_username,
   'effective',curriculum_private.policy(w.id),'wording',w.data->'wording',
   'frameworks',coalesce((select jsonb_agg(curriculum_private.pick(f,array['id','name'])) from jsonb_array_elements(coalesce(w.data->'externalFrameworks','[]')) f),'[]'));
end; $$;
