-- Existing entries retain an unknown time. PIN permissions stay closed.
begin;
alter table shared_studio.items add column upload_time text
  check (upload_time is null or upload_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
create unique index items_channel_upload_slot on shared_studio.items(channel_id, due_date, upload_time) where upload_time is not null;

create or replace function shared_studio.mutate(actor_id uuid, operation text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := actor_id; actor_name text; team_id uuid; old_member shared_studio.members%rowtype;
  channel uuid; item uuid; member uuid; old_item shared_studio.items%rowtype;
  old_step shared_studio.steps%rowtype; item_title text := ''; action_name text;
  stage_name text; new_done boolean; initial_status text;
begin
  -- Serialize board writes; per-record versions reject stale forms.
  select id into team_id from shared_studio.workspaces for update;
  select m.display_name into actor_name from shared_studio.members m
    where m.workspace_id = team_id and m.user_id = actor and m.active;
  if actor is null or actor_name is null then raise exception 'Choose an active team member before saving.'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'Invalid change.'; end if;

  if operation = 'add_member' then
    if (select count(*) from shared_studio.members) >= 200 then raise exception 'The roster already has 200 names.'; end if;
    if exists(select 1 from shared_studio.members where lower(display_name) = lower(btrim(payload->>'display_name'))) then raise exception 'That name is already on the roster. Rename or restore the existing member.'; end if;
    insert into shared_studio.members(workspace_id, display_name) values (team_id, btrim(payload->>'display_name')) returning display_name into item_title;
    action_name := 'added teammate';
  elsif operation in ('edit_member', 'remove_member', 'restore_member') then
    member := (payload->>'user_id')::uuid;
    select * into old_member from shared_studio.members where workspace_id = team_id and user_id = member;
    if not found then raise exception 'Member not found.'; end if;
    if (payload->>'version')::integer is distinct from old_member.version then raise exception 'Someone updated this teammate. Close this form and try again.'; end if;
    if operation = 'edit_member' then
      if exists(select 1 from shared_studio.members where lower(display_name) = lower(btrim(payload->>'display_name')) and user_id <> member) then raise exception 'That name is already on the roster.'; end if;
      update shared_studio.members set display_name = btrim(payload->>'display_name'), version = version + 1 where user_id = member returning display_name into item_title;
      action_name := 'renamed teammate to';
    else
      if operation = 'remove_member' and old_member.active and (select count(*) from shared_studio.members where active) <= 1 then raise exception 'Keep at least one active team member.'; end if;
      update shared_studio.members set active = (operation = 'restore_member'), version = version + 1 where user_id = member returning display_name into item_title;
      if operation = 'remove_member' then
        update shared_studio.steps set assigned_to = null, version = version + 1 where assigned_to = member and completed_at is null;
      end if;
      action_name := case when operation = 'restore_member' then 'restored teammate' else 'removed teammate' end;
    end if;
  elsif operation = 'add_channel' then
    if (select count(*) from shared_studio.channels where workspace_id = team_id) >= 20 then raise exception 'This team already has 20 channels.'; end if;
    insert into shared_studio.channels(workspace_id, name, handle, comic_goal, post_goal)
      values (team_id, btrim(payload->>'name'), btrim(coalesce(payload->>'handle', '')), (payload->>'comic_goal')::integer, (payload->>'post_goal')::integer)
      returning id, name into channel, item_title;
    action_name := 'added channel';
  else
    if operation in ('edit_item', 'delete_item', 'set_step') then
      item := (payload->>'item_id')::uuid;
      select i.* into old_item from shared_studio.items i join shared_studio.channels c on c.id = i.channel_id
        where i.id = item and c.workspace_id = team_id for update of i;
      if not found then raise exception 'This item is no longer available.'; end if;
      channel := old_item.channel_id; item_title := old_item.title;
    else
      channel := (payload->>'channel_id')::uuid;
      if not exists(select 1 from shared_studio.channels where id = channel and workspace_id = team_id) then raise exception 'Channel not found.'; end if;
    end if;

    if operation in ('add_item', 'edit_item') and nullif(payload->>'upload_time', '') is not null then
      if (payload->>'upload_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Enter an upload time between 00:00 and 23:59.';
      end if;
    end if;
    if operation in ('add_item', 'edit_item') and exists (
      select 1 from shared_studio.items i where i.channel_id = channel
        and i.due_date = (payload->>'due_date')::date
        and i.upload_time = case when operation = 'edit_item' and not (payload ? 'upload_time') then old_item.upload_time else nullif(payload->>'upload_time', '') end
        and i.id is distinct from item
    ) then raise exception 'This channel already has an upload at that time. Choose another time or leave it blank.'; end if;

    case operation
    when 'add_item' then
      initial_status := coalesce(payload->>'initial_status', 'planned');
      if initial_status not in ('planned', 'ready', 'scheduled') then raise exception 'Invalid initial status.'; end if;
      insert into shared_studio.items(channel_id, due_date, title, content_type, link, notes, submitted_by, upload_time)
        values (channel, (payload->>'due_date')::date, btrim(payload->>'title'), payload->>'content_type', btrim(coalesce(payload->>'link', '')), coalesce(payload->>'notes', ''), actor, nullif(payload->>'upload_time', ''))
        returning id, title into item, item_title;
      insert into shared_studio.steps(item_id, stage) select item, unnest(array['script', 'voiceover', 'edit', 'scheduled']);
      if initial_status in ('ready', 'scheduled') then
        update shared_studio.steps set completed_by = actor, completed_at = now() where item_id = item and stage = 'edit';
      end if;
      if initial_status = 'scheduled' then
        update shared_studio.steps set completed_by = actor, completed_at = now() where item_id = item and stage = 'scheduled';
      end if;
      action_name := case initial_status when 'ready' then 'submitted as finished' when 'scheduled' then 'submitted as scheduled' else 'submitted' end;
    when 'edit_item' then
      if (payload->>'version')::integer is distinct from old_item.version then raise exception 'Someone updated this item. Close this form and try again.'; end if;
      update shared_studio.items set title = btrim(payload->>'title'), due_date = (payload->>'due_date')::date,
        content_type = payload->>'content_type', link = btrim(coalesce(payload->>'link', '')), notes = coalesce(payload->>'notes', ''), upload_time = case when payload ? 'upload_time' then nullif(payload->>'upload_time', '') else upload_time end, version = version + 1 where id = item;
      action_name := 'updated';
    when 'delete_item' then
      if (payload->>'version')::integer is distinct from old_item.version then raise exception 'Someone updated this item. Close this form and try again.'; end if;
      delete from shared_studio.items where id = item;
      item := null; action_name := 'removed';
    when 'set_step' then
      stage_name := payload->>'stage';
      select * into old_step from shared_studio.steps where item_id = item and stage = stage_name for update;
      if not found then raise exception 'Stage not found.'; end if;
      if (payload->>'version')::integer is distinct from old_step.version then raise exception 'Someone updated this stage. Refresh and try again.'; end if;
      if payload ? 'assigned_to' then
        member := nullif(payload->>'assigned_to', '')::uuid;
        if member is not null and not exists(select 1 from shared_studio.members where workspace_id = team_id and user_id = member and active) then raise exception 'Choose an active team member.'; end if;
        update shared_studio.steps set assigned_to = member, version = version + 1 where item_id = item and stage = stage_name;
        action_name := case when member is null then 'unassigned' else 'assigned' end;
      elsif payload ? 'done' then
        new_done := (payload->>'done')::boolean;
        if new_done is null then raise exception 'Choose a completion status.'; end if;
        if new_done and old_step.completed_at is not null then return shared_studio.snapshot(); end if;
        if not new_done and old_step.completed_at is null then return shared_studio.snapshot(); end if;
        if stage_name = 'scheduled' and new_done and not exists(select 1 from shared_studio.steps where item_id = item and stage = 'edit' and completed_at is not null) then raise exception 'Mark the edit finished before scheduling.'; end if;
        if stage_name = 'edit' and not new_done and exists(select 1 from shared_studio.steps where item_id = item and stage = 'scheduled' and completed_at is not null) then raise exception 'Reopen scheduling before reopening the edit.'; end if;
        update shared_studio.steps set completed_by = case when new_done then actor else null end,
          completed_at = case when new_done then now() else null end, version = version + 1 where item_id = item and stage = stage_name;
        action_name := case when new_done then 'completed' else 'reopened' end;
      else raise exception 'Choose an assignment or completion status.';
      end if;
    when 'edit_channel' then
      if (payload->>'version')::integer is distinct from (select version from shared_studio.channels where id = channel) then raise exception 'Someone updated this channel. Close this form and try again.'; end if;
      update shared_studio.channels set name = btrim(payload->>'name'), handle = btrim(coalesce(payload->>'handle', '')), version = version + 1 where id = channel returning name into item_title;
      action_name := 'updated channel';
    when 'set_goal' then
      if (payload->>'version')::integer is distinct from coalesce((select version from shared_studio.goals where channel_id = channel and day = (payload->>'day')::date), 0) then raise exception 'Someone updated these targets. Close this form and try again.'; end if;
      insert into shared_studio.goals(channel_id, day, comic_goal, post_goal)
        values (channel, (payload->>'day')::date, (payload->>'comic_goal')::integer, (payload->>'post_goal')::integer)
        on conflict (channel_id, day) do update set comic_goal = excluded.comic_goal, post_goal = excluded.post_goal, version = shared_studio.goals.version + 1;
      item_title := payload->>'day'; action_name := 'changed daily targets for';
    else raise exception 'Unknown action.';
    end case;
  end if;
  insert into shared_studio.activity(workspace_id, channel_id, item_id, actor_id, actor_name, action, title, stage)
    values (team_id, channel, item, actor, actor_name, action_name, item_title, stage_name);
  update shared_studio.workspaces set revision = revision + 1 where id = team_id;
  return shared_studio.snapshot();
end;
$$;


revoke all on function shared_studio.mutate(uuid, text, jsonb) from public, anon, authenticated;
commit;
