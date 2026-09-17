-- Run once in the SQL editor of the Supabase project connected to this site.
-- All browser access goes through the checked functions below. No service key is needed.
begin;

create table public.studio_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  owner_id uuid not null references auth.users(id),
  invite_code uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create table public.studio_members (
  workspace_id uuid not null references public.studio_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create table public.studio_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.studio_workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  handle text not null default '' check (handle = '' or handle ~ '^@[A-Za-z0-9_.-]{1,100}$'),
  comic_goal integer not null default 2 check (comic_goal between 0 and 50),
  post_goal integer not null default 1 check (post_goal between 0 and 50),
  created_at timestamptz not null default now()
);
create table public.studio_goals (
  channel_id uuid not null references public.studio_channels(id) on delete cascade,
  day date not null,
  comic_goal integer not null check (comic_goal between 0 and 50),
  post_goal integer not null check (post_goal between 0 and 50),
  primary key (channel_id, day)
);
create table public.studio_items (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.studio_channels(id) on delete cascade,
  due_date date not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content_type text not null check (content_type in ('comic', 'internet_post')),
  link text not null default '' check (char_length(link) <= 2000 and (link = '' or link ~ '^https?://')),
  notes text not null default '' check (char_length(notes) <= 4000),
  submitted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  version integer not null default 1
);
create table public.studio_steps (
  item_id uuid not null references public.studio_items(id) on delete cascade,
  stage text not null check (stage in ('script', 'voiceover', 'edit', 'scheduled')),
  assigned_to uuid references auth.users(id),
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  version integer not null default 1,
  check ((completed_by is null) = (completed_at is null)),
  primary key (item_id, stage)
);
create table public.studio_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.studio_workspaces(id) on delete cascade,
  channel_id uuid references public.studio_channels(id) on delete set null,
  item_id uuid references public.studio_items(id) on delete set null,
  actor_id uuid not null references auth.users(id),
  actor_name text not null,
  action text not null,
  title text not null default '',
  stage text,
  created_at timestamptz not null default now()
);
create index studio_members_user on public.studio_members(user_id, active);
create index studio_channels_workspace on public.studio_channels(workspace_id);
create index studio_items_channel_date on public.studio_items(channel_id, due_date);
create index studio_activity_workspace_date on public.studio_activity(workspace_id, created_at desc);

alter table public.studio_workspaces enable row level security;
alter table public.studio_members enable row level security;
alter table public.studio_channels enable row level security;
alter table public.studio_goals enable row level security;
alter table public.studio_items enable row level security;
alter table public.studio_steps enable row level security;
alter table public.studio_activity enable row level security;
revoke all on public.studio_workspaces, public.studio_members, public.studio_channels,
  public.studio_goals, public.studio_items, public.studio_steps, public.studio_activity
  from public, anon, authenticated;

create function public.studio_list_workspaces()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by w.created_at), '[]'::jsonb)
  from public.studio_workspaces w join public.studio_members m on m.workspace_id = w.id
  where m.user_id = auth.uid() and m.active;
$$;

create function public.studio_create_workspace(team_name text, member_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result uuid;
begin
  if actor is null then raise exception 'Sign in first.'; end if;
  if (select count(*) from public.studio_workspaces where owner_id = actor) >= 10 then
    raise exception 'You already own 10 teams.';
  end if;
  insert into public.studio_workspaces(name, owner_id) values (btrim(team_name), actor) returning id into result;
  insert into public.studio_members(workspace_id, user_id, display_name) values (result, actor, btrim(member_name));
  insert into public.studio_channels(workspace_id, name, handle, comic_goal, post_goal)
    values (result, 'ginduyah', '@ginduyah', 2, 1), (result, 'NBA comics', '', 1, 0);
  return result;
end;
$$;

create function public.studio_join_workspace(invite text, member_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result uuid;
begin
  if actor is null then raise exception 'Sign in first.'; end if;
  select id into result from public.studio_workspaces where invite_code::text = btrim(invite);
  if result is null then raise exception 'This invite code is invalid or has expired.'; end if;
  if exists(select 1 from public.studio_members where workspace_id = result and user_id = actor and not active) then
    raise exception 'Your access to this team was removed. Ask the owner to restore it.';
  end if;
  insert into public.studio_members(workspace_id, user_id, display_name) values (result, actor, btrim(member_name))
    on conflict (workspace_id, user_id) do nothing;
  return result;
end;
$$;

create function public.studio_snapshot(team_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.studio_members where workspace_id = team_id and user_id = auth.uid() and active) then
    raise exception 'You do not have access to this team.';
  end if;
  select jsonb_build_object(
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name, 'owner_id', w.owner_id, 'invite_code', case when w.owner_id = auth.uid() then w.invite_code else null end) from public.studio_workspaces w where w.id = team_id),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', m.display_name, 'active', m.active) order by m.joined_at), '[]'::jsonb) from public.studio_members m where m.workspace_id = team_id),
    'channels', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at, c.name), '[]'::jsonb) from public.studio_channels c where c.workspace_id = team_id),
    'goals', (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from public.studio_goals g join public.studio_channels c on c.id = g.channel_id where c.workspace_id = team_id),
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at), '[]'::jsonb) from public.studio_items i join public.studio_channels c on c.id = i.channel_id where c.workspace_id = team_id),
    'steps', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.studio_steps s join public.studio_items i on i.id = s.item_id join public.studio_channels c on c.id = i.channel_id where c.workspace_id = team_id),
    'activity', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc, a.id), '[]'::jsonb) from (select * from public.studio_activity where workspace_id = team_id order by created_at desc, id limit 200) a)
  ) into result;
  return result;
end;
$$;

create function public.studio_mutate(team_id uuid, operation text, payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); actor_name text; owner uuid;
  channel uuid; item uuid; member uuid; old_item public.studio_items%rowtype;
  old_step public.studio_steps%rowtype; item_title text := ''; action_name text;
  stage_name text; new_done boolean; initial_status text;
begin
  select m.display_name, w.owner_id into actor_name, owner from public.studio_members m
    join public.studio_workspaces w on w.id = m.workspace_id
    where m.workspace_id = team_id and m.user_id = actor and m.active;
  if actor is null or actor_name is null then raise exception 'You do not have access to this team.'; end if;

  if operation in ('rotate_invite', 'remove_member', 'restore_member') then
    if actor <> owner then raise exception 'Only the team owner can do that.'; end if;
    if operation = 'rotate_invite' then
      update public.studio_workspaces set invite_code = gen_random_uuid() where id = team_id;
      action_name := 'replaced the invite code';
    else
      member := (payload->>'user_id')::uuid;
      if member = owner then raise exception 'The owner cannot be removed.'; end if;
      update public.studio_members set active = (operation = 'restore_member') where workspace_id = team_id and user_id = member returning display_name into item_title;
      if not found then raise exception 'Member not found.'; end if;
      action_name := case when operation = 'restore_member' then 'restored access for' else 'removed access for' end;
      if operation = 'remove_member' then
        update public.studio_workspaces set invite_code = gen_random_uuid() where id = team_id;
      end if;
    end if;
  elsif operation = 'add_channel' then
    if (select count(*) from public.studio_channels where workspace_id = team_id) >= 20 then raise exception 'This team already has 20 channels.'; end if;
    insert into public.studio_channels(workspace_id, name, handle, comic_goal, post_goal)
      values (team_id, btrim(payload->>'name'), btrim(coalesce(payload->>'handle', '')), (payload->>'comic_goal')::integer, (payload->>'post_goal')::integer)
      returning id, name into channel, item_title;
    action_name := 'added channel';
  else
    if operation in ('edit_item', 'delete_item', 'set_step') then
      item := (payload->>'item_id')::uuid;
      select i.* into old_item from public.studio_items i join public.studio_channels c on c.id = i.channel_id
        where i.id = item and c.workspace_id = team_id for update of i;
      if not found then raise exception 'This item is no longer available.'; end if;
      channel := old_item.channel_id; item_title := old_item.title;
    else
      channel := (payload->>'channel_id')::uuid;
      if not exists(select 1 from public.studio_channels where id = channel and workspace_id = team_id) then raise exception 'Channel not found.'; end if;
    end if;

    case operation
    when 'add_item' then
      initial_status := coalesce(payload->>'initial_status', 'planned');
      if initial_status not in ('planned', 'ready', 'scheduled') then raise exception 'Invalid initial status.'; end if;
      insert into public.studio_items(channel_id, due_date, title, content_type, link, notes, submitted_by)
        values (channel, (payload->>'due_date')::date, btrim(payload->>'title'), payload->>'content_type', btrim(coalesce(payload->>'link', '')), coalesce(payload->>'notes', ''), actor)
        returning id, title into item, item_title;
      insert into public.studio_steps(item_id, stage) select item, unnest(array['script', 'voiceover', 'edit', 'scheduled']);
      if initial_status in ('ready', 'scheduled') then
        update public.studio_steps set completed_by = actor, completed_at = now() where item_id = item and stage = 'edit';
      end if;
      if initial_status = 'scheduled' then
        update public.studio_steps set completed_by = actor, completed_at = now() where item_id = item and stage = 'scheduled';
      end if;
      action_name := case initial_status when 'ready' then 'submitted as finished' when 'scheduled' then 'submitted as scheduled' else 'submitted' end;
    when 'edit_item' then
      if (payload->>'version')::integer is distinct from old_item.version then raise exception 'Someone updated this item. Refresh and try again.'; end if;
      update public.studio_items set title = btrim(payload->>'title'), due_date = (payload->>'due_date')::date,
        content_type = payload->>'content_type', link = btrim(coalesce(payload->>'link', '')), notes = coalesce(payload->>'notes', ''), version = version + 1 where id = item;
      action_name := 'updated';
    when 'delete_item' then
      if actor <> owner and actor <> old_item.submitted_by then raise exception 'Only the submitter or team owner can remove this item.'; end if;
      if (payload->>'version')::integer is distinct from old_item.version then raise exception 'Someone updated this item. Refresh and try again.'; end if;
      delete from public.studio_items where id = item;
      item := null; action_name := 'removed';
    when 'set_step' then
      stage_name := payload->>'stage';
      select * into old_step from public.studio_steps where item_id = item and stage = stage_name for update;
      if not found then raise exception 'Stage not found.'; end if;
      if (payload->>'version')::integer is distinct from old_step.version then raise exception 'Someone updated this stage. Refresh and try again.'; end if;
      if payload ? 'assigned_to' then
        member := nullif(payload->>'assigned_to', '')::uuid;
        if member is not null and not exists(select 1 from public.studio_members where workspace_id = team_id and user_id = member and active) then raise exception 'Choose an active team member.'; end if;
        update public.studio_steps set assigned_to = member, version = version + 1 where item_id = item and stage = stage_name;
        action_name := case when member is null then 'unassigned' else 'assigned' end;
      elsif payload ? 'done' then
        new_done := (payload->>'done')::boolean;
        if new_done is null then raise exception 'Choose a completion status.'; end if;
        if new_done and old_step.completed_at is not null then return; end if;
        if not new_done and old_step.completed_at is null then return; end if;
        if stage_name = 'scheduled' and new_done and not exists(select 1 from public.studio_steps where item_id = item and stage = 'edit' and completed_at is not null) then raise exception 'Mark the edit finished before scheduling.'; end if;
        if stage_name = 'edit' and not new_done and exists(select 1 from public.studio_steps where item_id = item and stage = 'scheduled' and completed_at is not null) then raise exception 'Reopen scheduling before reopening the edit.'; end if;
        if not new_done and old_step.completed_by <> actor and actor <> owner then raise exception 'Only the person who completed this stage or the owner can reopen it.'; end if;
        update public.studio_steps set completed_by = case when new_done then actor else null end,
          completed_at = case when new_done then now() else null end, version = version + 1 where item_id = item and stage = stage_name;
        action_name := case when new_done then 'completed' else 'reopened' end;
      else raise exception 'Choose an assignment or completion status.';
      end if;
    when 'edit_channel' then
      update public.studio_channels set name = btrim(payload->>'name'), handle = btrim(coalesce(payload->>'handle', '')) where id = channel returning name into item_title;
      action_name := 'updated channel';
    when 'set_goal' then
      insert into public.studio_goals(channel_id, day, comic_goal, post_goal)
        values (channel, (payload->>'day')::date, (payload->>'comic_goal')::integer, (payload->>'post_goal')::integer)
        on conflict (channel_id, day) do update set comic_goal = excluded.comic_goal, post_goal = excluded.post_goal;
      item_title := payload->>'day'; action_name := 'changed daily targets for';
    else raise exception 'Unknown action.';
    end case;
  end if;
  insert into public.studio_activity(workspace_id, channel_id, item_id, actor_id, actor_name, action, title, stage)
    values (team_id, channel, item, actor, actor_name, action_name, item_title, stage_name);
end;
$$;

revoke all on function public.studio_list_workspaces() from public, anon;
revoke all on function public.studio_create_workspace(text, text) from public, anon;
revoke all on function public.studio_join_workspace(text, text) from public, anon;
revoke all on function public.studio_snapshot(uuid) from public, anon;
revoke all on function public.studio_mutate(uuid, text, jsonb) from public, anon;
grant execute on function public.studio_list_workspaces() to authenticated;
grant execute on function public.studio_create_workspace(text, text) to authenticated;
grant execute on function public.studio_join_workspace(text, text) to authenticated;
grant execute on function public.studio_snapshot(uuid) to authenticated;
grant execute on function public.studio_mutate(uuid, text, jsonb) to authenticated;
commit;
