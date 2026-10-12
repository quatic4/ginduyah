begin;
-- The workspace row lock in files() serializes allocation across uploaders.
-- No client role can call this helper or read the private tables directly.
create or replace function shared_studio.next_screenshot_slot(channel_id uuid, content_type text, start_date date, at_time timestamptz default now())
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  channel shared_studio.channels; today date := (at_time at time zone 'America/Toronto')::date;
  clock text := to_char(at_time at time zone 'America/Toronto','HH24:MI');
  first_day date; next_day date; target integer; occupied bigint; standard text[]; candidate text; slot text;
begin
  if content_type not in ('comic','internet_post') or content_type is null then raise exception 'Choose Comic or Internet post for each screenshot.'; end if;
  select * into channel from shared_studio.channels c where c.id=channel_id;
  if not found then raise exception 'Choose a channel.'; end if;
  first_day := greatest(coalesce(start_date,today),today);
  standard := case when lower(channel.handle)='@ginduyah' then
    case content_type when 'comic' then array['11:00','21:00'] else array['16:00'] end else array[]::text[] end;
  for offset_day in 0..365 loop
    next_day := first_day + offset_day;
    select coalesce((select case content_type when 'comic' then g.comic_goal else g.post_goal end
      from shared_studio.goals g where g.channel_id=channel.id and g.day=next_day),
      case content_type when 'comic' then channel.comic_goal else channel.post_goal end) into target;
    select count(*) into occupied from shared_studio.items i where i.channel_id=channel.id and i.due_date=next_day and i.content_type=next_screenshot_slot.content_type;
    if occupied>=target then continue; end if;
    if next_day=today and cardinality(standard)>0 and clock>=standard[cardinality(standard)] then continue; end if;
    slot := null;
    foreach candidate in array standard loop
      if (next_day<>today or candidate>clock) and not exists(select 1 from shared_studio.items i where i.channel_id=channel.id and i.due_date=next_day and i.upload_time=candidate) then
        slot := candidate; exit;
      end if;
    end loop;
    if cardinality(standard)>0 and slot is null and target<=cardinality(standard) then continue; end if;
    return jsonb_build_object('day',next_day,'time',slot);
  end loop;
  return null;
end;
$$;
revoke all on function shared_studio.next_screenshot_slot(uuid,text,date,timestamptz) from public,anon,authenticated;

create or replace function shared_studio.files(access_token text, actor_id uuid, action text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  team uuid; actor_name text; entry shared_studio.items; file shared_studio.attachments;
  channel shared_studio.channels; allocation jsonb; content_kind text;
  file_id uuid; file_path text; result jsonb;
begin
  perform shared_studio.require_pin_session(access_token);
  select id into team from shared_studio.workspaces where singleton for update;
  if action = 'authorize' then return '{"ok":true}'::jsonb; end if;
  if action = 'list' then
    select i.* into entry from shared_studio.items i join shared_studio.channels c on c.id=i.channel_id
      where i.id=(payload->>'item_id')::uuid and c.workspace_id=team;
    if not found then raise exception 'Submission no longer exists.'; end if;
    select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('uploader',m.display_name) order by a.created_at,a.id),'[]'::jsonb)
      into result from shared_studio.attachments a join shared_studio.members m on m.user_id=a.uploaded_by where a.item_id=entry.id;
    return result;
  end if;
  select display_name into actor_name from shared_studio.members where user_id=actor_id and workspace_id=team and active;
  if not found then raise exception 'Choose your name before uploading or removing screenshots.'; end if;
  file_id := (payload->>'id')::uuid;
  select * into file from shared_studio.attachments where id=file_id for update;
  if action = 'reserve' then
    if found then
      if file.uploaded_by <> actor_id or file.sha256 <> payload->>'sha256' then raise exception 'This upload ID belongs to another file. Select the file again.'; end if;
      select * into entry from shared_studio.items where id=file.item_id;
      if (payload->>'item_id' is not null and (payload->>'item_id')::uuid <> entry.id)
        or (payload->>'item_id' is null and payload->>'channel_id' is not null and (payload->>'channel_id')::uuid <> entry.channel_id)
        or (payload->>'content_type' is not null and payload->>'content_type' <> entry.content_type) then
        raise exception 'Retry this file with its original submission and type.';
      end if;
      if file.state='deleting' then raise exception 'This screenshot is being removed.'; end if;
      if file.state='pending' then
        if file.upload_lease_until>now() then raise exception 'This upload may still be finishing. Refresh to check it; an interrupted upload can be retried after ten minutes.'; end if;
        update shared_studio.attachments set upload_lease_until=now()+interval '10 minutes' where id=file.id returning * into file;
      end if;
      select * into entry from shared_studio.items where id=file.item_id;
      return to_jsonb(file) || jsonb_build_object('due_date',entry.due_date,'upload_time',entry.upload_time,'content_type',entry.content_type);
    end if;
    content_kind := coalesce(payload->>'content_type','internet_post');
    if content_kind not in ('comic','internet_post') then raise exception 'Choose Comic or Internet post for each screenshot.'; end if;
    if (payload->>'item_id') is not null then
      select i.* into entry from shared_studio.items i join shared_studio.channels c on c.id=i.channel_id
        where i.id=(payload->>'item_id')::uuid and c.workspace_id=team;
      if not found then raise exception 'Submission no longer exists.'; end if;
    else
      select * into channel from shared_studio.channels where id=(payload->>'channel_id')::uuid and workspace_id=team;
      if not found then raise exception 'Choose a channel.'; end if;
      allocation := shared_studio.next_screenshot_slot(channel.id,content_kind,nullif(payload->>'start_date','')::date);
      if allocation is null then raise exception 'No open % dates in the next year. Set daily targets for this channel first.',replace(content_kind,'_',' '); end if;
      insert into shared_studio.items(channel_id,due_date,upload_time,title,content_type,submitted_by,notes)
        values(channel.id,(allocation->>'day')::date,allocation->>'time',left(coalesce(nullif(btrim(payload->>'title'),''),case content_kind when 'comic' then 'Comic screenshot' else 'Internet post screenshot' end),200),content_kind,actor_id,'Screenshot uploaded for editing. Date assigned automatically; change it any time.') returning * into entry;
      insert into shared_studio.steps(item_id,stage) select entry.id,unnest(array['script','voiceover','edit','scheduled']);
    end if;
    if (select count(*) from shared_studio.attachments where item_id=entry.id) >= 20 then raise exception 'This submission already has 20 screenshots.'; end if;
    file_path := entry.id::text || '/' || file_id::text || case payload->>'mime_type' when 'image/png' then '.png' when 'image/jpeg' then '.jpg' when 'image/webp' then '.webp' else '' end;
    insert into shared_studio.attachments(id,item_id,file_name,mime_type,byte_size,sha256,object_path,uploaded_by)
      values(file_id,entry.id,payload->>'file_name',payload->>'mime_type',(payload->>'byte_size')::integer,payload->>'sha256',file_path,actor_id) returning * into file;
    update shared_studio.workspaces set revision=revision+1 where id=team;
    return to_jsonb(file) || jsonb_build_object('due_date',entry.due_date,'upload_time',entry.upload_time,'content_type',entry.content_type);
  end if;
  if file.id is null then
    if action='removed' then return '{"ok":true}'::jsonb; end if;
    raise exception 'Screenshot no longer exists.';
  end if;
  select * into entry from shared_studio.items where id=file.item_id;
  if not exists(select 1 from shared_studio.channels where id=entry.channel_id and workspace_id=team) then raise exception 'Submission no longer exists.'; end if;
  if action='complete' then
    if file.state='ready' then return to_jsonb(file) || jsonb_build_object('due_date',entry.due_date,'upload_time',entry.upload_time,'content_type',entry.content_type); end if;
    if file.state<>'pending' then raise exception 'This screenshot is being removed.'; end if;
    update shared_studio.attachments set state='ready' where id=file.id returning * into file;
    insert into shared_studio.activity(workspace_id,channel_id,item_id,actor_id,actor_name,action,title)
      values(team,entry.channel_id,entry.id,actor_id,actor_name,'uploaded screenshot for',entry.title);
  elsif action='remove' then
    -- Upload completion cannot race deletion; unfinished uploads can be cleaned
    -- after its upload lease expires, once the Edge Function has stopped handling their bytes.
    if file.state='pending' and file.upload_lease_until>now() then raise exception 'This upload may still be finishing. Retry it, or wait ten minutes before removing it.'; end if;
    update shared_studio.attachments set state='deleting' where id=file.id returning * into file;
    return to_jsonb(file);
  elsif action='removed' then
    if file.state<>'deleting' then raise exception 'Remove the stored file first.'; end if;
    delete from shared_studio.attachments where id=file.id;
    insert into shared_studio.activity(workspace_id,channel_id,item_id,actor_id,actor_name,action,title)
      values(team,entry.channel_id,entry.id,actor_id,actor_name,'removed screenshot from',entry.title);
  else raise exception 'Unknown screenshot action.';
  end if;
  update shared_studio.workspaces set revision=revision+1 where id=team;
  return to_jsonb(file) || jsonb_build_object('due_date',entry.due_date,'upload_time',entry.upload_time,'content_type',entry.content_type);
end;
$$;
commit;
