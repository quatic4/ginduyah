-- Shared board without accounts. Run once; independent of the older account schema.
-- Existing private studio data is not modified or exposed by this migration.
-- Keep shared_studio out of Supabase's exposed-schema list.
begin;
create schema shared_studio;
revoke all on schema shared_studio from public, anon, authenticated;

create table shared_studio.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  singleton boolean not null default true unique check (singleton),
  revision bigint not null default 1,
  created_at timestamptz not null default now()
);
create table shared_studio.members (
  workspace_id uuid not null references shared_studio.workspaces(id) on delete cascade,
  user_id uuid not null unique default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  active boolean not null default true,
  version integer not null default 1,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create table shared_studio.channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references shared_studio.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  handle text not null default '' check (handle = '' or handle ~ '^@[A-Za-z0-9_.-]{1,100}$'),
  comic_goal integer not null default 2 check (comic_goal between 0 and 50),
  post_goal integer not null default 1 check (post_goal between 0 and 50),
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create table shared_studio.goals (
  channel_id uuid not null references shared_studio.channels(id) on delete cascade,
  day date not null,
  comic_goal integer not null check (comic_goal between 0 and 50),
  post_goal integer not null check (post_goal between 0 and 50),
  version integer not null default 1,
  primary key (channel_id, day)
);
create table shared_studio.items (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references shared_studio.channels(id) on delete cascade,
  due_date date not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content_type text not null check (content_type in ('comic', 'internet_post')),
  link text not null default '' check (char_length(link) <= 2000 and (link = '' or link ~ '^https?://')),
  notes text not null default '' check (char_length(notes) <= 4000),
  submitted_by uuid not null references shared_studio.members(user_id),
  created_at timestamptz not null default now(),
  version integer not null default 1
);
create table shared_studio.steps (
  item_id uuid not null references shared_studio.items(id) on delete cascade,
  stage text not null check (stage in ('script', 'voiceover', 'edit', 'scheduled')),
  assigned_to uuid references shared_studio.members(user_id),
  completed_by uuid references shared_studio.members(user_id),
  completed_at timestamptz,
  version integer not null default 1,
  check ((completed_by is null) = (completed_at is null)),
  primary key (item_id, stage)
);
create table shared_studio.activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references shared_studio.workspaces(id) on delete cascade,
  channel_id uuid references shared_studio.channels(id) on delete set null,
  item_id uuid references shared_studio.items(id) on delete set null,
  actor_id uuid not null references shared_studio.members(user_id),
  actor_name text not null,
  action text not null,
  title text not null default '',
  stage text,
  created_at timestamptz not null default now()
);
create index studio_members_user on shared_studio.members(user_id, active);
create index studio_channels_workspace on shared_studio.channels(workspace_id);
create index studio_items_channel_date on shared_studio.items(channel_id, due_date);
create index studio_activity_workspace_date on shared_studio.activity(workspace_id, created_at desc);

alter table shared_studio.workspaces enable row level security;
alter table shared_studio.members enable row level security;
alter table shared_studio.channels enable row level security;
alter table shared_studio.goals enable row level security;
alter table shared_studio.items enable row level security;
alter table shared_studio.steps enable row level security;
alter table shared_studio.activity enable row level security;
revoke all on shared_studio.workspaces, shared_studio.members, shared_studio.channels,
  shared_studio.goals, shared_studio.items, shared_studio.steps, shared_studio.activity
  from public, anon, authenticated;

create unique index shared_members_name on shared_studio.members(workspace_id, lower(display_name));
create index shared_items_submitter on shared_studio.items(submitted_by);
create index shared_steps_assigned on shared_studio.steps(assigned_to);
create index shared_steps_completed on shared_studio.steps(completed_by);
create index shared_activity_actor on shared_studio.activity(actor_id);
create index shared_activity_channel on shared_studio.activity(channel_id);
create index shared_activity_item on shared_studio.activity(item_id);

-- One site-wide board. Names are labels, not authenticated identities.
do $$
declare team uuid;
begin
  insert into shared_studio.workspaces(name) values ('The upload crew') returning id into team;
  insert into shared_studio.members(workspace_id, display_name) values (team, 'Quatic');
  insert into shared_studio.channels(workspace_id, name, handle, comic_goal, post_goal)
    values (team, 'ginduyah', '@ginduyah', 2, 1), (team, 'NBA comics', '', 1, 0);
end;
$$;

create function shared_studio.snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; team_id uuid;
begin
  select id into team_id from shared_studio.workspaces;
  select jsonb_build_object(
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name, 'revision', w.revision) from shared_studio.workspaces w where w.id = team_id),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', m.display_name, 'active', m.active, 'version', m.version) order by m.joined_at), '[]'::jsonb) from shared_studio.members m where m.workspace_id = team_id),
    'channels', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at, (c.name = 'ginduyah') desc, c.name), '[]'::jsonb) from shared_studio.channels c where c.workspace_id = team_id),
    'goals', (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from shared_studio.goals g join shared_studio.channels c on c.id = g.channel_id where c.workspace_id = team_id),
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at), '[]'::jsonb) from shared_studio.items i join shared_studio.channels c on c.id = i.channel_id where c.workspace_id = team_id),
    'steps', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from shared_studio.steps s join shared_studio.items i on i.id = s.item_id join shared_studio.channels c on c.id = i.channel_id where c.workspace_id = team_id),
    'activity', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc, a.id), '[]'::jsonb) from (select * from shared_studio.activity where workspace_id = team_id order by created_at desc, id limit 200) a)
  ) into result;
  return result;
end;
$$;

create function shared_studio.mutate(actor_id uuid, operation text, payload jsonb)
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

    case operation
    when 'add_item' then
      initial_status := coalesce(payload->>'initial_status', 'planned');
      if initial_status not in ('planned', 'ready', 'scheduled') then raise exception 'Invalid initial status.'; end if;
      insert into shared_studio.items(channel_id, due_date, title, content_type, link, notes, submitted_by)
        values (channel, (payload->>'due_date')::date, btrim(payload->>'title'), payload->>'content_type', btrim(coalesce(payload->>'link', '')), coalesce(payload->>'notes', ''), actor)
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
        content_type = payload->>'content_type', link = btrim(coalesce(payload->>'link', '')), notes = coalesce(payload->>'notes', ''), version = version + 1 where id = item;
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

-- Only these narrow functions are exposed. Direct table writes stay forbidden.
-- The public board intentionally grants the same editing rights to all visitors.
create function public.studio_shared_snapshot()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select shared_studio.snapshot();
$$;
create function public.studio_shared_mutate(actor_id uuid, operation text, payload jsonb)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select shared_studio.mutate(actor_id, operation, payload);
$$;
revoke all on function shared_studio.snapshot() from public, anon, authenticated;
revoke all on function shared_studio.mutate(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.studio_shared_snapshot() from public, anon, authenticated;
revoke all on function public.studio_shared_mutate(uuid, text, jsonb) from public, anon, authenticated;
grant usage on schema shared_studio to anon, authenticated;
grant execute on function shared_studio.snapshot() to anon, authenticated;
grant execute on function shared_studio.mutate(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.studio_shared_snapshot() to anon, authenticated;
grant execute on function public.studio_shared_mutate(uuid, text, jsonb) to anon, authenticated;
commit;
