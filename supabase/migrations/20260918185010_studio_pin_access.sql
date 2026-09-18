begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Stage the new API before deploying the new frontend. Activation closes the
-- old API atomically, either immediately or on the first correct PIN entry.
create table shared_studio.pin_settings (
  singleton boolean primary key default true check (singleton),
  pin_hash text,
  activated_at timestamptz,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  blocked_until timestamptz
);
insert into shared_studio.pin_settings (singleton) values (true);
create table shared_studio.pin_sessions (
  token_hash bytea primary key,
  expires_at timestamptz not null
);
create index pin_sessions_expiry_idx on shared_studio.pin_sessions (expires_at);
alter table shared_studio.pin_settings enable row level security;
alter table shared_studio.pin_sessions enable row level security;
revoke all on shared_studio.pin_settings, shared_studio.pin_sessions from public, anon, authenticated;

create function shared_studio.activate_pin()
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists(select 1 from shared_studio.pin_settings where singleton and pin_hash is not null) then
    raise exception 'Configure the team PIN first.';
  end if;
  -- Close every legacy route, including the core functions behind the wrappers.
  revoke all on function public.studio_shared_snapshot() from public, anon, authenticated;
  revoke all on function public.studio_shared_mutate(uuid, text, jsonb) from public, anon, authenticated;
  revoke all on function shared_studio.snapshot() from public, anon, authenticated;
  revoke all on function shared_studio.mutate(uuid, text, jsonb) from public, anon, authenticated;
  update shared_studio.pin_settings set activated_at = coalesce(activated_at, clock_timestamp()) where singleton;
end;
$$;
revoke all on function shared_studio.activate_pin() from public, anon, authenticated;

create function shared_studio.set_pin(new_pin text, activate_immediately boolean default true)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if new_pin is null or new_pin !~ '^[0-9]{3,12}$' then
    raise exception 'Choose a PIN of 3 to 12 digits.';
  end if;
  update shared_studio.pin_settings set
    pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf', 10)),
    failed_attempts = 0, blocked_until = null where singleton;
  delete from shared_studio.pin_sessions;
  if activate_immediately then perform shared_studio.activate_pin(); end if;
  -- Staging a new PIN never reopens an already protected board.
end;
$$;
revoke all on function shared_studio.set_pin(text, boolean) from public, anon, authenticated;

create function shared_studio.pin_unlock(pin text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  settings shared_studio.pin_settings%rowtype;
  issued_token text;
  expiry timestamptz;
  failures integer;
  wait_seconds integer;
begin
  select * into settings from shared_studio.pin_settings where singleton for update;
  if settings.pin_hash is null then
    return jsonb_build_object('ok', false, 'error', 'Team studio access is being set up. Please try again shortly.');
  end if;
  if settings.blocked_until > clock_timestamp() then
    wait_seconds := greatest(1, ceil(extract(epoch from (settings.blocked_until - clock_timestamp())))::integer);
    return jsonb_build_object('ok', false, 'error', 'Too many incorrect attempts. Please wait before trying again.', 'retry_after', wait_seconds);
  end if;
  if settings.blocked_until is not null then
    settings.failed_attempts := 0;
  end if;
  if pin is null or pin !~ '^[0-9]{3,12}$' or extensions.crypt(pin, settings.pin_hash) is distinct from settings.pin_hash then
    failures := settings.failed_attempts + 1;
    update shared_studio.pin_settings set failed_attempts = failures,
      blocked_until = case when failures >= 5 then clock_timestamp() + interval '15 minutes' else null end where singleton;
    -- A normal return commits the failed-attempt counter. An exception would undo it.
    return jsonb_build_object('ok', false,
      'error', case when failures >= 5 then 'Too many incorrect attempts. Please wait before trying again.' else 'That PIN isn’t right. Try again.' end,
      'retry_after', case when failures >= 5 then 900 else 0 end);
  end if;
  if settings.activated_at is null then perform shared_studio.activate_pin(); end if;
  update shared_studio.pin_settings set failed_attempts = 0, blocked_until = null where singleton;
  delete from shared_studio.pin_sessions where expires_at <= clock_timestamp();
  issued_token := encode(extensions.gen_random_bytes(32), 'hex');
  expiry := clock_timestamp() + interval '8 hours';
  insert into shared_studio.pin_sessions(token_hash, expires_at) values (extensions.digest(issued_token, 'sha256'), expiry);
  return jsonb_build_object('ok', true, 'access_token', issued_token, 'expires_at', expiry);
end;
$$;

create function shared_studio.require_pin_session(access_token text)
returns void language plpgsql volatile security invoker set search_path = '' as $$
begin
  if access_token is null or access_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '28000', message = 'Enter the team PIN to open the studio.';
  end if;
  -- Hold the session until this request finishes, so lock/rotation cannot race a save.
  perform 1 from shared_studio.pin_sessions
    where token_hash = extensions.digest(access_token, 'sha256') and expires_at > clock_timestamp() for share;
  if not found then
    raise exception using errcode = '28000', message = 'Your session ended. Enter the team PIN again.';
  end if;
end;
$$;
revoke all on function shared_studio.require_pin_session(text) from public, anon, authenticated;

create function shared_studio.pin_snapshot(access_token text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform shared_studio.require_pin_session(access_token);
  return shared_studio.snapshot();
end;
$$;
create function shared_studio.pin_mutate(access_token text, actor_id uuid, operation text, payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform shared_studio.require_pin_session(access_token);
  return shared_studio.mutate(actor_id, operation, payload);
end;
$$;
create function shared_studio.pin_lock(access_token text)
returns void language sql volatile security definer set search_path = '' as $$
  delete from shared_studio.pin_sessions where token_hash = extensions.digest(access_token, 'sha256');
$$;

create function public.studio_pin_unlock(pin text)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select shared_studio.pin_unlock(pin);
$$;
create function public.studio_pin_snapshot(access_token text)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select shared_studio.pin_snapshot(access_token);
$$;
create function public.studio_pin_mutate(access_token text, actor_id uuid, operation text, payload jsonb)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select shared_studio.pin_mutate(access_token, actor_id, operation, payload);
$$;
create function public.studio_pin_lock(access_token text)
returns void language sql volatile security invoker set search_path = '' as $$
  select shared_studio.pin_lock(access_token);
$$;

revoke all on function shared_studio.pin_unlock(text), shared_studio.pin_snapshot(text), shared_studio.pin_mutate(text, uuid, text, jsonb), shared_studio.pin_lock(text) from public, anon, authenticated;
revoke all on function public.studio_pin_unlock(text), public.studio_pin_snapshot(text), public.studio_pin_mutate(text, uuid, text, jsonb), public.studio_pin_lock(text) from public, anon, authenticated;
grant execute on function shared_studio.pin_unlock(text), shared_studio.pin_snapshot(text), shared_studio.pin_mutate(text, uuid, text, jsonb), shared_studio.pin_lock(text) to anon, authenticated;
grant execute on function public.studio_pin_unlock(text), public.studio_pin_snapshot(text), public.studio_pin_mutate(text, uuid, text, jsonb), public.studio_pin_lock(text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
