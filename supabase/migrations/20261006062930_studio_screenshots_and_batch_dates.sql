begin;
create table shared_studio.attachments (
  id uuid primary key,
  item_id uuid not null references shared_studio.items(id) on delete restrict,
  file_name text not null check (length(file_name) between 1 and 180),
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  object_path text not null unique,
  uploaded_by uuid not null references shared_studio.members(user_id),
  state text not null default 'pending' check (state in ('pending','ready','deleting')),
  upload_lease_until timestamptz not null default (now()+interval '10 minutes'),
  created_at timestamptz not null default now()
);
create index attachments_item on shared_studio.attachments(item_id,created_at);
alter table shared_studio.attachments enable row level security;
revoke all on shared_studio.attachments from public,anon,authenticated;

-- Only the server's storage function may call this API. Every operation also
-- checks the real PIN session; service credentials alone never replace that check.
create function shared_studio.files(access_token text, actor_id uuid, action text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  team uuid; actor_name text; entry shared_studio.items; file shared_studio.attachments;
  channel shared_studio.channels; next_day date; first_day date; goal integer;
  file_id uuid; file_path text; slot text; result jsonb;
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
      if file.state='deleting' then raise exception 'This screenshot is being removed.'; end if;
      if file.state='pending' then
        if file.upload_lease_until>now() then raise exception 'This upload may still be finishing. Refresh to check it; an interrupted upload can be retried after ten minutes.'; end if;
        update shared_studio.attachments set upload_lease_until=now()+interval '10 minutes' where id=file.id returning * into file;
      end if;
      select * into entry from shared_studio.items where id=file.item_id;
      return to_jsonb(file) || jsonb_build_object('due_date',entry.due_date,'upload_time',entry.upload_time);
    end if;
    if (payload->>'item_id') is not null then
      select i.* into entry from shared_studio.items i join shared_studio.channels c on c.id=i.channel_id
        where i.id=(payload->>'item_id')::uuid and c.workspace_id=team;
      if not found then raise exception 'Submission no longer exists.'; end if;
    else
      select * into channel from shared_studio.channels where id=(payload->>'channel_id')::uuid and workspace_id=team;
      if not found then raise exception 'Choose a channel.'; end if;
      first_day := greatest(coalesce(nullif(payload->>'start_date','')::date,(now() at time zone 'America/Toronto')::date),(now() at time zone 'America/Toronto')::date);
      -- Skip today's standard slot when it has already passed.
      if lower(channel.handle)='@ginduyah' and (now() at time zone 'America/Toronto')::time >= time '16:00' then
        first_day := greatest(first_day,(now() at time zone 'America/Toronto')::date+1);
      end if;
      for offset_day in 0..365 loop
        next_day := first_day + offset_day;
        select coalesce((select g.post_goal from shared_studio.goals g where g.channel_id=channel.id and g.day=next_day),channel.post_goal) into goal;
        if goal > (select count(*) from shared_studio.items i where i.channel_id=channel.id and i.due_date=next_day and i.content_type='internet_post') then
          slot := null;
          if lower(channel.handle)='@ginduyah' and not exists(select 1 from shared_studio.items i where i.channel_id=channel.id and i.due_date=next_day and i.upload_time='16:00') then slot := '16:00'; end if;
          exit;
        end if;
        next_day := null;
      end loop;
      if next_day is null then raise exception 'No open internet-post dates in the next year. Set internet-post targets for this channel first.'; end if;
      insert into shared_studio.items(channel_id,due_date,upload_time,title,content_type,submitted_by,notes)
        values(channel.id,next_day,slot,left(coalesce(nullif(btrim(payload->>'title'),''),'Internet post screenshot'),200),'internet_post',actor_id,'Screenshot uploaded for editing. Date assigned automatically; change it any time.') returning * into entry;
      insert into shared_studio.steps(item_id,stage) select entry.id,unnest(array['script','voiceover','edit','scheduled']);
    end if;
    if (select count(*) from shared_studio.attachments where item_id=entry.id) >= 20 then raise exception 'This submission already has 20 screenshots.'; end if;
    file_path := entry.id::text || '/' || file_id::text || case payload->>'mime_type' when 'image/png' then '.png' when 'image/jpeg' then '.jpg' when 'image/webp' then '.webp' else '' end;
    insert into shared_studio.attachments(id,item_id,file_name,mime_type,byte_size,sha256,object_path,uploaded_by)
      values(file_id,entry.id,payload->>'file_name',payload->>'mime_type',(payload->>'byte_size')::integer,payload->>'sha256',file_path,actor_id) returning * into file;
    update shared_studio.workspaces set revision=revision+1 where id=team;
    return to_jsonb(file) || jsonb_build_object('due_date',entry.due_date,'upload_time',entry.upload_time);
  end if;
  if file.id is null then
    if action='removed' then return '{"ok":true}'::jsonb; end if;
    raise exception 'Screenshot no longer exists.';
  end if;
  select * into entry from shared_studio.items where id=file.item_id;
  if not exists(select 1 from shared_studio.channels where id=entry.channel_id and workspace_id=team) then raise exception 'Submission no longer exists.'; end if;
  if action='complete' then
    if file.state='ready' then return to_jsonb(file) || jsonb_build_object('due_date',entry.due_date,'upload_time',entry.upload_time); end if;
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
  return to_jsonb(file) || jsonb_build_object('due_date',entry.due_date,'upload_time',entry.upload_time);
end;
$$;
create function public.studio_files(access_token text, actor_id uuid, action text, payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select shared_studio.files(access_token,actor_id,action,payload); $$;
revoke all on function shared_studio.files(text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.studio_files(text,uuid,text,jsonb) from public,anon,authenticated;
grant usage on schema shared_studio to service_role;
grant execute on function shared_studio.files(text,uuid,text,jsonb) to service_role;
grant execute on function public.studio_files(text,uuid,text,jsonb) to service_role;

create function shared_studio.protect_item_files() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from shared_studio.attachments where item_id=old.id) then raise exception 'Remove this submission''s screenshots before deleting it.'; end if;
  return old;
end;
$$;
revoke all on function shared_studio.protect_item_files() from public,anon,authenticated;
create trigger protect_item_files before delete on shared_studio.items for each row execute function shared_studio.protect_item_files();
commit;
