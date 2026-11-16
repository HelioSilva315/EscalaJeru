-- =====================================================================
--  EscalaJeru — Backend (Supabase) · schema v1
--
--  Como aplicar:
--    1. Supabase → SQL Editor → cole este arquivo inteiro → Run
--    2. (Opcional) supabase db push  — se você usa a CLI
--
--  Modelo de dados
--    auth.users
--      └── profiles            (1 linha por pessoa; papel leader/member/pending)
--      └── invites             (código de ativação de uso único)
--      └── notifications       (avisos dentro do app)
--
--    ministries                (times da igreja)
--      └── ministry_members    (quem serve em cada time)
--      └── chat_channels       (1 canal por ministério + canal Geral)
--
--    events                    (agenda: cultos, ensaios, reuniões)
--      └── schedules           (pessoa × ministério × encontro)
--
--    chat_channels
--      └── messages
--      └── channel_reads       (controle de não lidas)
--
--  Regra central de negócio:
--    uma pessoa só pode estar em 1 ministério por dia.
--    Garantida por índice único parcial (status <> 'declined').
-- =====================================================================

create extension if not exists pgcrypto;

set check_function_bodies = off;

-- ---------------------------------------------------------------------
--  Utilitários de permissão
-- ---------------------------------------------------------------------
-- SECURITY DEFINER: lê profiles sem acionar RLS (evita recursão).
create or replace function public.is_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'leader'
      and active
  );
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active
      and role in ('leader', 'member')
  );
$$;

create or replace function public.needs_bootstrap()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles where role = 'leader');
$$;

-- ---------------------------------------------------------------------
--  Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 90),
  phone text unique check (phone is null or phone ~ '^\+?[0-9]{10,15}$'),
  email text,
  role text not null default 'pending' check (role in ('leader', 'member', 'pending')),
  avatar_color text not null default '#2c5a4b' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  birth_date date check (birth_date is null or birth_date <= current_date),
  active boolean not null default true,
  must_change_password boolean not null default false,
  notify_whatsapp boolean not null default true,
  notify_sms boolean not null default false,
  calendar_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_calendar_token_key
  on public.profiles (calendar_token);
create unique index if not exists profiles_email_key
  on public.profiles (lower(email)) where email is not null;

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists invites_profile_idx on public.invites (profile_id);

create table if not exists public.ministries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 40),
  description text check (description is null or char_length(description) <= 160),
  color text not null default '#2c5a4b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  leader_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ministry_members (
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_in_ministry text not null default 'member' check (role_in_ministry in ('leader', 'member')),
  created_at timestamptz not null default now(),
  primary key (ministry_id, profile_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 80),
  description text check (description is null or char_length(description) <= 300),
  event_date date not null,
  start_time time not null,
  end_time time,
  location text check (location is null or char_length(location) <= 120),
  kind text not null default 'culto' check (kind in ('culto', 'ensaio', 'reuniao', 'evento', 'especial')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or end_time > start_time)
);

create index if not exists events_date_idx on public.events (event_date, start_time);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_date date not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  note text check (note is null or char_length(note) <= 160),
  notified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, ministry_id, profile_id)
);

-- 🚨 Regra de negócio central: 1 ministério por pessoa por dia.
--    Escalas recusadas não bloqueiam (a pessoa pode servir em outro lugar).
create unique index if not exists schedules_one_per_day
  on public.schedules (profile_id, event_date)
  where status <> 'declined';

create index if not exists schedules_event_idx on public.schedules (event_id);
create index if not exists schedules_profile_idx on public.schedules (profile_id, event_date);

create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  kind text not null default 'general' check (kind in ('general', 'ministry')),
  ministry_id uuid unique references public.ministries(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (kind = 'ministry' and ministry_id is not null)
    or (kind = 'general' and ministry_id is null)
  )
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_idx on public.messages (channel_id, created_at desc);
create index if not exists messages_sender_idx on public.messages (sender_id, created_at desc);

create table if not exists public.channel_reads (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, profile_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) <= 140),
  body text check (body is null or char_length(body) <= 400),
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_profile_idx
  on public.notifications (profile_id, created_at desc);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  schedule_id uuid references public.schedules(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'sms', 'app')),
  provider text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_substitutions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.schedules(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  ministry_id uuid references public.ministries(id) on delete set null,
  old_profile_id uuid references public.profiles(id) on delete set null,
  new_profile_id uuid references public.profiles(id) on delete set null,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists schedule_substitutions_event_idx
  on public.schedule_substitutions (event_id, created_at desc);

create table if not exists public.password_change_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  method text not null check (method in ('self', 'admin_reset', 'invite_activation')),
  created_at timestamptz not null default now()
);

create index if not exists password_change_log_profile_idx
  on public.password_change_log (profile_id, created_at desc);

-- ---------------------------------------------------------------------
--  Funções e triggers
-- ---------------------------------------------------------------------

-- updated_at automático
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists ministries_touch on public.ministries;
create trigger ministries_touch before update on public.ministries
  for each row execute function public.touch_updated_at();

drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

drop trigger if exists schedules_touch on public.schedules;
create trigger schedules_touch before update on public.schedules
  for each row execute function public.touch_updated_at();

-- Novo usuário: primeiro vira líder; convidados entram com o papel definido
-- no app_metadata (não falsificável pelo cliente); demais ficam pendentes.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_leader boolean;
  v_invited boolean;
  v_role text;
  v_name text;
  v_phone text;
  v_color text;
begin
  select exists (select 1 from public.profiles where role = 'leader') into v_has_leader;

  v_invited := coalesce((new.raw_app_meta_data ->> 'invited')::boolean, false);
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'Membro'), '@', 1)
  );
  v_phone := nullif(btrim(new.raw_user_meta_data ->> 'phone'), '');
  v_color := coalesce(nullif(new.raw_user_meta_data ->> 'avatar_color', ''), '#2c5a4b');

  if not v_has_leader then
    v_role := 'leader';
  elsif v_invited then
    v_role := coalesce(new.raw_app_meta_data ->> 'role', 'member');
    if v_role not in ('leader', 'member') then
      v_role := 'member';
    end if;
  else
    v_role := 'pending';
  end if;

  insert into public.profiles (id, full_name, phone, email, role, avatar_color)
  values (new.id, left(v_name, 90), v_phone, new.email, v_role, v_color)
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when public.profiles.full_name = '' then excluded.full_name
          else public.profiles.full_name
        end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Protege campos sensíveis: só líder altera papel, situação e e-mail.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A service_role (Edge Functions) pode alterar qualquer campo com segurança.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if public.is_leader() and auth.uid() = old.id then
    -- líder não pode se rebaixar nem se desativar
    if new.role <> old.role then
      raise exception 'Você não pode alterar a sua própria função.';
    end if;
    if new.active = false and old.active = true then
      raise exception 'Você não pode desativar o seu próprio acesso.';
    end if;
  end if;

  if not public.is_leader() then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.email is distinct from old.email then
      raise exception 'Somente líderes podem alterar função, situação ou e-mail.';
    end if;
  end if;

  if old.role = 'leader' and new.role <> 'leader' then
    if not exists (
      select 1 from public.profiles
      where role = 'leader' and active and id <> old.id
    ) then
      raise exception 'A igreja precisa de pelo menos um líder ativo.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Escala herda a data do encontro e registra quem criou.
create or replace function public.schedule_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
begin
  select event_date into v_date from public.events where id = new.event_id;
  if v_date is null then
    raise exception 'Encontro não encontrado.';
  end if;
  new.event_date := v_date;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists schedules_before_write on public.schedules;
create trigger schedules_before_write before insert or update on public.schedules
  for each row execute function public.schedule_before_write();

-- Avisa a pessoa dentro do app quando ela é escalada.
create or replace function public.notify_new_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_ministry public.ministries;
begin
  select * into v_event from public.events where id = new.event_id;
  select * into v_ministry from public.ministries where id = new.ministry_id;
  if v_event.id is null then
    return new;
  end if;

  insert into public.notifications (profile_id, title, body, link)
  values (
    new.profile_id,
    'Você foi escalado(a) em ' || coalesce(v_ministry.name, 'um ministério'),
    v_event.title || ' · ' || to_char(v_event.event_date, 'DD/MM') || ' às ' ||
      to_char(v_event.start_time, 'HH24:MI'),
    '/escalas'
  );

  return new;
end;
$$;

drop trigger if exists schedules_notify on public.schedules;
create trigger schedules_notify after insert on public.schedules
  for each row execute function public.notify_new_schedule();

-- Canal de chat automático para cada ministério.
create or replace function public.create_ministry_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_channels (name, kind, ministry_id)
  values (new.name, 'ministry', new.id)
  on conflict (ministry_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ministries_channel on public.ministries;
create trigger ministries_channel after insert on public.ministries
  for each row execute function public.create_ministry_channel();

create or replace function public.rename_ministry_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name <> old.name then
    update public.chat_channels set name = new.name where ministry_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists ministries_channel_rename on public.ministries;
create trigger ministries_channel_rename after update of name on public.ministries
  for each row execute function public.rename_ministry_channel();

-- Limite simples de mensagens: 12 por minuto por pessoa (anti-flood).
create or replace function public.rate_limit_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.messages
  where sender_id = new.sender_id
    and created_at > now() - interval '1 minute';

  if v_count >= 12 then
    raise exception 'Muitas mensagens em pouco tempo. Aguarde um instante.';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit before insert on public.messages
  for each row execute function public.rate_limit_messages();

-- Resposta da própria pessoa à escala (não precisa ser líder).
create or replace function public.respond_schedule(p_schedule uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('confirmed', 'declined', 'pending') then
    raise exception 'Status inválido.';
  end if;

  update public.schedules
    set status = p_status
  where id = p_schedule
    and (profile_id = auth.uid() or public.is_leader());

  if not found then
    raise exception 'Escala não encontrada ou sem permissão.';
  end if;
end;
$$;

revoke all on function public.respond_schedule(uuid, text) from public, anon;
grant execute on function public.respond_schedule(uuid, text) to authenticated;

-- Acesso a um canal de chat.
create or replace function public.can_access_channel(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_channels c
    where c.id = p_channel
      and public.is_active_member()
      and (
        c.kind = 'general'
        or public.is_leader()
        or exists (
          select 1 from public.ministry_members mm
          where mm.ministry_id = c.ministry_id
            and mm.profile_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.can_access_channel(uuid) from public, anon;
grant execute on function public.can_access_channel(uuid) to authenticated;

-- Diretório público interno: nome, papel e cor — nunca telefone/e-mail.
create or replace view public.people_directory as
  select id, full_name, role, avatar_color
  from public.profiles
  where active and role in ('leader', 'member');

revoke all on public.people_directory from public, anon, authenticated;
grant select (id, full_name, role, avatar_color) on public.people_directory to authenticated;

-- ---------------------------------------------------------------------
--  RLS
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.ministries enable row level security;
alter table public.ministry_members enable row level security;
alter table public.events enable row level security;
alter table public.schedules enable row level security;
alter table public.chat_channels enable row level security;
alter table public.messages enable row level security;
alter table public.channel_reads enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_log enable row level security;
alter table public.password_change_log enable row level security;
alter table public.schedule_substitutions enable row level security;

-- profiles ------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (public.is_leader() and active)
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_leader())
  with check (id = auth.uid() or public.is_leader());

-- Sem insert/delete direto: cadastro passa pela Edge Function `admin`
-- e exclusão é feita pela própria pessoa via `delete-account`.

-- invites -------------------------------------------------------------
drop policy if exists invites_leader on public.invites;
create policy invites_leader on public.invites
  for all to authenticated
  using (public.is_leader())
  with check (public.is_leader());

-- ministries ----------------------------------------------------------
drop policy if exists ministries_select on public.ministries;
create policy ministries_select on public.ministries
  for select to authenticated
  using (public.is_active_member());

drop policy if exists ministries_write on public.ministries;
create policy ministries_write on public.ministries
  for all to authenticated
  using (public.is_leader())
  with check (public.is_leader());

-- ministry_members ----------------------------------------------------
drop policy if exists ministry_members_select on public.ministry_members;
create policy ministry_members_select on public.ministry_members
  for select to authenticated
  using (public.is_active_member());

drop policy if exists ministry_members_write on public.ministry_members;
create policy ministry_members_write on public.ministry_members
  for all to authenticated
  using (public.is_leader())
  with check (public.is_leader());

-- events --------------------------------------------------------------
drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated
  using (public.is_active_member());

drop policy if exists events_write on public.events;
create policy events_write on public.events
  for all to authenticated
  using (public.is_leader())
  with check (public.is_leader());

-- schedules -----------------------------------------------------------
drop policy if exists schedules_select on public.schedules;
create policy schedules_select on public.schedules
  for select to authenticated
  using (public.is_active_member());

drop policy if exists schedules_write on public.schedules;
create policy schedules_write on public.schedules
  for all to authenticated
  using (public.is_leader())
  with check (public.is_leader());

-- chat_channels -------------------------------------------------------
drop policy if exists chat_channels_select on public.chat_channels;
create policy chat_channels_select on public.chat_channels
  for select to authenticated
  using (public.can_access_channel(id));

drop policy if exists chat_channels_write on public.chat_channels;
create policy chat_channels_write on public.chat_channels
  for all to authenticated
  using (public.is_leader())
  with check (public.is_leader());

-- messages ------------------------------------------------------------
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (public.can_access_channel(channel_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_channel(channel_id)
  );

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete to authenticated
  using (public.is_leader() or sender_id = auth.uid());

-- channel_reads -------------------------------------------------------
drop policy if exists channel_reads_own on public.channel_reads;
create policy channel_reads_own on public.channel_reads
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- notifications -------------------------------------------------------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- notification_log ----------------------------------------------------
drop policy if exists notification_log_leader on public.notification_log;
create policy notification_log_leader on public.notification_log
  for select to authenticated
  using (public.is_leader());

drop policy if exists password_change_log_select on public.password_change_log;
create policy password_change_log_select on public.password_change_log
  for select to authenticated
  using (profile_id = auth.uid() or public.is_leader());

drop policy if exists password_change_log_insert on public.password_change_log;
create policy password_change_log_insert on public.password_change_log
  for insert to authenticated
  with check (profile_id = auth.uid() or public.is_leader());

-- schedule_substitutions
drop policy if exists schedule_substitutions_select on public.schedule_substitutions;
create policy schedule_substitutions_select on public.schedule_substitutions
  for select to authenticated
  using (
    public.is_leader()
    or old_profile_id = auth.uid()
    or new_profile_id = auth.uid()
  );

drop policy if exists schedule_substitutions_insert on public.schedule_substitutions;
create policy schedule_substitutions_insert on public.schedule_substitutions
  for insert to authenticated
  with check (public.is_leader());

-- notifications: líderes podem criar avisos (para substituições)
drop policy if exists notifications_insert_leader on public.notifications;
create policy notifications_insert_leader on public.notifications
  for insert to authenticated
  with check (public.is_leader());

-- ---------------------------------------------------------------------
--  Privilégios (PostgREST)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.invites to authenticated;
grant select, insert, update, delete on public.ministries to authenticated;
grant select, insert, update, delete on public.ministry_members to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.schedules to authenticated;
grant select, insert, update, delete on public.chat_channels to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant select, insert, update, delete on public.channel_reads to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.notification_log to authenticated;
grant select, insert on public.password_change_log to authenticated;
grant select, insert on public.schedule_substitutions to authenticated;
grant select, insert on public.schedule_substitutions to authenticated;

-- O app precisa descobrir se é o primeiro acesso antes do login.
revoke all on function public.needs_bootstrap() from public;
grant execute on function public.needs_bootstrap() to anon, authenticated;

revoke all on function public.is_leader() from public, anon;
revoke all on function public.is_active_member() from public, anon;
grant execute on function public.is_leader() to authenticated;
grant execute on function public.is_active_member() to authenticated;

-- ---------------------------------------------------------------------
--  Realtime
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'schedules'
    ) then
      alter publication supabase_realtime add table public.schedules;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
--  Seed mínimo
-- ---------------------------------------------------------------------
insert into public.chat_channels (id, name, kind)
values ('00000000-0000-4000-8000-000000000001', 'Geral', 'general')
on conflict (id) do nothing;

-- =====================================================================
--  Fim. Depois de rodar:
--    Authentication → Providers → Email: deixe ON
--    Authentication → URL Configuration: adicione a URL do Netlify
--    Project Settings → Edge Functions: configure os segredos do README
-- =====================================================================
