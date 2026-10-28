-- Run after supabase-review-access.sql. All fixture rows roll back, even on failure.
begin;
do $$
declare w public.curriculum_workspaces; other public.curriculum_workspaces; r1 text; r2 text; lead text;
 c1 jsonb; c2 jsonb; response jsonb; cfg jsonb; before_hash text; denied boolean; i integer;
begin
 insert into public.curriculum_workspaces(slug,title,data) values('review-qa-'||gen_random_uuid(),'Fictional access test',
 '{"meta":{"programme":"Fictional","participants":"PRIVATE-PARTICIPANTS"},"plos":[{"id":"plo1","code":"PLO1","title":"Fictional outcome"}],
 "papers":[{"id":"p1","code":"TEST101","title":"Fictional paper","level":100,"structure":"Double-coded","secondaryCode":"TEST201","roles":[],
 "learningOutcomes":"Visible CLO","courseOutcomes":[{"id":"clo1","text":"Visible CLO"}],
 "learningActivities":"PRIVATE-ACTIVITY","learningActivityItems":[{"id":"la1","text":"PRIVATE-ACTIVITY"}],
 "secondaryLearningActivities":"PRIVATE-SECOND-ACTIVITY","secondaryLearningActivityItems":[{"id":"la2","text":"PRIVATE-SECOND-ACTIVITY"}],
 "activityLinks":{"plo1":"PRIVATE-LEGACY"},"designAlignment":{"ploClos":{"plo1":["clo1"]},"cloActivities":{"clo1":["la1"]},"cloAssessments":{"clo1":["a1"]}},"diagnosisNote":"PRIVATE-DIAGNOSIS"}],
 "alignments":{"p1":{"plo1":"D"}},"assessments":[{"id":"a1","paperId":"p1","name":"PRIVATE-ASSESSMENT","week":15,"evidence":{"plo1":"D"}}],
 "staffProfiles":{"Fictional":{"researchInterests":"PRIVATE-STAFF"}},"actions":[{"id":"action1","title":"PRIVATE-ACTION"}],
 "noteActions":{"note1":{"notes":"PRIVATE-NOTE-ACTION"}},"connections":[],"externalFrameworks":[],"unknownFutureField":"PRIVATE-UNKNOWN"}') returning * into w;
 insert into public.curriculum_workspaces(slug,title,data) values('review-other-'||gen_random_uuid(),'Other fictional test','{}') returning * into other;
 before_hash:=md5(w.data::text);
 r1:=public.start_curriculum_review(w.slug,w.view_token)->>'token';
 r2:=public.start_curriculum_review(w.slug,w.view_token)->>'token';
 c1:=public.create_curriculum_workspace_comment(w.slug,r1,'Same name','Reviewer ONE secret','block:paper:clos:p1');
 c2:=public.create_curriculum_workspace_comment(w.slug,r2,'Same name','Reviewer TWO secret','page:programme');
 insert into public.curriculum_workspace_comments(workspace_id,author,target,body) values(w.id,'Same name','Workspace','PRIVATE-LEGACY-COMMENT');
 response:=public.list_curriculum_workspace_comments(w.slug,r1);
 if jsonb_array_length(response)<>1 or response::text like '%TWO%' or response::text like '%LEGACY%' then raise exception 'Reviewer ownership isolation failed'; end if;
 if jsonb_array_length(public.list_curriculum_workspace_comments(w.slug,r2))<>1 then raise exception 'Second reviewer isolation failed'; end if;
 update curriculum_private.review_sessions set expires_at=now()-interval '1 second' where secret_hash=encode(extensions.digest(r2,'sha256'),'hex');
 denied:=false; begin perform public.load_curriculum_workspace(w.slug,r2); exception when others then denied:=true; end;
 if not denied then raise exception 'Expired reviewer session accepted'; end if;
 update curriculum_private.review_sessions set expires_at=now()+interval '1 year' where secret_hash=encode(extensions.digest(r2,'sha256'),'hex');
 if public.list_curriculum_workspace_comments(w.slug,w.view_token)<>'[]' or public.list_curriculum_workspace_comments(w.slug,w.edit_token)<>'[]' then raise exception 'Shared-token comment bypass'; end if;
 denied:=false; begin perform public.load_curriculum_workspace(other.slug,r1); exception when others then denied:=true; end;
 if not denied then raise exception 'Cross-workspace token accepted'; end if;
 denied:=false; begin perform public.load_curriculum_workspace(w.slug,null); exception when others then denied:=true; end;
 if not denied then raise exception 'Null access accepted'; end if;
 denied:=false; begin perform public.curriculum_review_settings(w.slug,null); exception when others then denied:=true; end;
 if not denied then raise exception 'Null settings access accepted'; end if;
 denied:=false; begin perform public.save_curriculum_workspace(w.slug,r1,'{}'); exception when others then denied:=true; end;
 if not denied then raise exception 'Reviewer could modify mapping'; end if;
 insert into public.curriculum_workspace_versions(workspace_id,label,data) values(w.id,'Fictional private snapshot',w.data);
 if public.list_curriculum_workspace_versions(w.slug,r1)<>'[]' or public.list_curriculum_workspace_versions(w.slug,w.view_token)<>'[]' then raise exception 'Unredacted version leak'; end if;
 perform public.curriculum_review_settings(w.slug,w.admin_token,null,'Fictional-test-password-92!');
 response:=public.login_curriculum_review_manager(w.slug,w.view_token,'Wrong password','Head');
 if not (response ? 'error') then raise exception 'Wrong password accepted'; end if;
 response:=public.login_curriculum_review_manager(w.slug,w.view_token,'Fictional-test-password-92!','Head');
 lead:=response->>'token';
 if lead is null then raise exception 'Lead login failed'; end if;
 response:=public.load_curriculum_workspace(w.slug,lead);
 if (response->>'canEdit')::boolean or not (response->'review'->>'manager')::boolean or response->>'editToken' is not null or response->>'adminToken' is not null then raise exception 'Lead mapping privilege escalation'; end if;
 if jsonb_array_length(public.list_curriculum_workspace_comments(w.slug,lead))<>3 then raise exception 'Lead cannot see all original comments'; end if;
 perform public.reply_curriculum_review_comment(w.slug,lead,(c1->>'id')::uuid,'Private lead reply to ONE');
 if jsonb_array_length(public.list_curriculum_workspace_comments(w.slug,r1))<>2 or public.list_curriculum_workspace_comments(w.slug,r2)::text like '%reply%' then raise exception 'Reply privacy failed'; end if;
 denied:=false; begin perform public.reply_curriculum_review_comment(w.slug,r2,(c1->>'id')::uuid,'Not authorised'); exception when others then denied:=true; end;
 if not denied then raise exception 'Reviewer could reply as lead'; end if;
 denied:=false; begin perform public.save_curriculum_workspace(w.slug,lead,'{}'); exception when others then denied:=true; end;
 if not denied then raise exception 'Lead could edit mapping'; end if;
 denied:=false; begin perform public.curriculum_review_settings(w.slug,lead,null,'Not-allowed-password'); exception when others then denied:=true; end;
 if not denied then raise exception 'Lead could replace admin-owned password'; end if;
 cfg:='{"hiddenTabs":["assessment","documents"],"hiddenBlocks":["paper:activities"]}';
 perform public.curriculum_review_settings(w.slug,lead,cfg);
 response:=public.load_curriculum_workspace(w.slug,r1);
 if response->'data'->'papers'->0->>'learningActivities'<>'' or jsonb_array_length(response->'data'->'papers'->0->'learningActivityItems')<>0 then raise exception 'Activity source redaction failed'; end if;
 if response->'data'->>'assessments'<>'[]' or response->'data'->'papers'->0->'designAlignment' ? 'cloActivities' then raise exception 'Assessment or dependent link leak'; end if;
 if (response->'data')::text like '%PRIVATE-%' then raise exception 'Hidden content leaked through JSON projection: %',response->'data'; end if;
 if public.load_curriculum_workspace(w.slug,w.view_token)->'data'<>response->'data' then raise exception 'Shared view token bypassed redaction'; end if;
 if exists(select 1 from public.resolve_curriculum_document_access(w.slug,r1)) or exists(select 1 from public.resolve_curriculum_document_access(w.slug,w.view_token)) then raise exception 'Hidden document access bypass'; end if;
 if not exists(select 1 from public.resolve_curriculum_document_access(w.slug,w.edit_token)) then raise exception 'Editing document access broken'; end if;
 denied:=false; begin perform public.create_curriculum_workspace_comment(w.slug,r1,'Name','Hidden block comment','block:paper:activities:p1'); exception when others then denied:=true; end;
 if not denied then raise exception 'Hidden block accepted comment'; end if;
 if md5((public.load_curriculum_workspace(w.slug,w.admin_token)->'data')::text)<>before_hash or md5((public.load_curriculum_workspace(w.slug,w.edit_token)->'data')::text)<>before_hash then raise exception 'Mapping JSON was altered'; end if;
 for i in 1..10 loop perform public.login_curriculum_review_manager(w.slug,w.view_token,'Wrong password','Head'); end loop;
 if public.login_curriculum_review_manager(w.slug,w.view_token,'Fictional-test-password-92!','Head')->>'token' is not null then raise exception 'Password throttling failed'; end if;
 perform public.curriculum_review_settings(w.slug,w.admin_token,null,'Fictional-reset-password-92!');
 denied:=false; begin perform public.load_curriculum_workspace(w.slug,lead); exception when others then denied:=true; end;
 if not denied then raise exception 'Password reset did not revoke lead session'; end if;
 update public.curriculum_workspaces set view_token=encode(extensions.gen_random_bytes(24),'hex') where id=w.id;
 denied:=false; begin perform public.load_curriculum_workspace(w.slug,r1); exception when others then denied:=true; end;
 if not denied then raise exception 'Link rotation did not revoke reviewer session'; end if;
 if has_schema_privilege('anon','curriculum_private','usage') or has_function_privilege('anon','curriculum_private.project(jsonb,jsonb)','execute') then raise exception 'Internal permission helper exposed'; end if;
 raise notice 'PASS: isolated ownership, lead replies, redaction, documents, versions, null/foreign tokens, expiry, password throttle/reset and mapping preservation';
end; $$;
rollback;
