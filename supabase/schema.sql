-- ============================================================
-- DISCORD CLONE — Schema Supabase
-- Rode este arquivo inteiro no SQL Editor do seu projeto:
--   Dashboard -> SQL Editor -> New query -> colar -> Run
-- ============================================================

-- ------------------------------------------------------------
-- PERFIS DE USUÁRIO
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid references auth.users (id) on delete cascade primary key,
  username text not null,
  avatar_color text not null default '#5865f2',
  created_at timestamptz not null default now()
);

-- Garante que o username tenha um índice para busca (DMs)
create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- ------------------------------------------------------------
-- SERVIDORES
-- ------------------------------------------------------------
create table if not exists public.servers (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  icon_color text not null default '#5865f2',
  invite_code text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.server_members (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create index if not exists server_members_user_idx on public.server_members (user_id);

-- ------------------------------------------------------------
-- CANAIS DE TEXTO
-- ------------------------------------------------------------
create table if not exists public.channels (
  id uuid default gen_random_uuid() primary key,
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null,
  type text not null default 'text' check (type in ('text', 'voice')),
  created_at timestamptz not null default now()
);

alter table public.channels add column if not exists type text not null default 'text';
alter table public.channels drop constraint if exists channels_type_check;
alter table public.channels add constraint channels_type_check check (type in ('text', 'voice'));

create index if not exists channels_server_idx on public.channels (server_id);

-- ------------------------------------------------------------
-- MENSAGENS DE CANAL
-- ------------------------------------------------------------
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_idx on public.messages (channel_id, id);

-- ------------------------------------------------------------
-- MENSAGENS DIRETAS (conversas 1:1)
-- ------------------------------------------------------------
create table if not exists public.dm_threads (
  id uuid default gen_random_uuid() primary key,
  last_message text,
  last_message_author uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.dm_participants (
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (thread_id, user_id)
);

create index if not exists dm_participants_user_idx on public.dm_participants (user_id);

create table if not exists public.dm_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) > 0),
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_thread_idx on public.dm_messages (thread_id, id);

-- ------------------------------------------------------------
-- FUNÇÕES AUXILIARES PARA AS POLÍTICAS RLS
-- ------------------------------------------------------------
create or replace function public.is_server_member(target_server uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.server_members
    where server_id = target_server and user_id = auth.uid()
  )
$$;

create or replace function public.is_server_owner(target_server uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.servers
    where id = target_server and owner_id = auth.uid()
  )
$$;

create or replace function public.is_dm_participant(target_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dm_participants
    where thread_id = target_thread and user_id = auth.uid()
  )
$$;

-- ------------------------------------------------------------
-- ENTRAR EM SERVIDOR POR CÓDIGO DE CONVITE
-- ------------------------------------------------------------
create or replace function public.join_server(code text)
returns public.servers
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.servers;
begin
  select * into target from public.servers
  where invite_code = upper(trim(code));

  if not found then
    raise exception 'Código de convite inválido';
  end if;

  insert into public.server_members (server_id, user_id)
  values (target.id, auth.uid())
  on conflict (server_id, user_id) do nothing;

  return target;
end
$$;

grant execute on function public.join_server(text) to authenticated;

-- ------------------------------------------------------------
-- CRIAR/OBTER CONVERSA DE MENSAGEM DIRETA ENTRE DOIS USUÁRIOS
-- ------------------------------------------------------------
create or replace function public.create_dm_thread(other_user uuid)
returns public.dm_threads
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.dm_threads;
begin
  -- procura uma conversa existente entre os dois usuários
  select t.* into target
  from public.dm_threads t
  join public.dm_participants p1 on p1.thread_id = t.id and p1.user_id = auth.uid()
  join public.dm_participants p2 on p2.thread_id = t.id and p2.user_id = other_user
  limit 1;

  if not found then
    insert into public.dm_threads default values returning * into target;
    insert into public.dm_participants (thread_id, user_id)
    values (target.id, auth.uid()), (target.id, other_user);
  end if;

  return target;
end
$$;

grant execute on function public.create_dm_thread(uuid) to authenticated;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.dm_threads enable row level security;
alter table public.dm_participants enable row level security;
alter table public.dm_messages enable row level security;

-- profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- servers
drop policy if exists "servers_select" on public.servers;
create policy "servers_select" on public.servers
  for select to authenticated using (
    owner_id = auth.uid() or public.is_server_member(id)
  );

drop policy if exists "servers_insert" on public.servers;
create policy "servers_insert" on public.servers
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "servers_update" on public.servers;
create policy "servers_update" on public.servers
  for update to authenticated using (owner_id = auth.uid());

drop policy if exists "servers_delete" on public.servers;
create policy "servers_delete" on public.servers
  for delete to authenticated using (owner_id = auth.uid());

-- server_members
drop policy if exists "members_select" on public.server_members;
create policy "members_select" on public.server_members
  for select to authenticated using (
    user_id = auth.uid() or public.is_server_member(server_id)
  );

drop policy if exists "members_insert" on public.server_members;
create policy "members_insert" on public.server_members
  for insert to authenticated with check (
    user_id = auth.uid()
    and (public.is_server_owner(server_id) or public.is_server_member(server_id))
  );

-- channels
drop policy if exists "channels_select" on public.channels;
create policy "channels_select" on public.channels
  for select to authenticated using (public.is_server_member(server_id));

drop policy if exists "channels_insert" on public.channels;
create policy "channels_insert" on public.channels
  for insert to authenticated with check (public.is_server_owner(server_id));

drop policy if exists "channels_update" on public.channels;
create policy "channels_update" on public.channels
  for update to authenticated using (public.is_server_owner(server_id));

drop policy if exists "channels_delete" on public.channels;
create policy "channels_delete" on public.channels
  for delete to authenticated using (public.is_server_owner(server_id));

-- messages
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select to authenticated using (
    public.is_server_member((select server_id from public.channels where id = channel_id))
  );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated with check (
    author_id = auth.uid()
    and public.is_server_member((select server_id from public.channels where id = channel_id))
  );

drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages
  for update to authenticated using (
    author_id = auth.uid()
    or public.is_server_owner((select server_id from public.channels where id = channel_id))
  );

drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages
  for delete to authenticated using (
    author_id = auth.uid()
    or public.is_server_owner((select server_id from public.channels where id = channel_id))
  );

-- dm_threads
drop policy if exists "dm_threads_select" on public.dm_threads;
create policy "dm_threads_select" on public.dm_threads
  for select to authenticated using (public.is_dm_participant(id));

drop policy if exists "dm_threads_insert" on public.dm_threads;
create policy "dm_threads_insert" on public.dm_threads
  for insert to authenticated with check (true);

drop policy if exists "dm_threads_update" on public.dm_threads;
create policy "dm_threads_update" on public.dm_threads
  for update to authenticated using (public.is_dm_participant(id));

-- dm_participants
drop policy if exists "dm_participants_select" on public.dm_participants;
create policy "dm_participants_select" on public.dm_participants
  for select to authenticated using (public.is_dm_participant(thread_id));

drop policy if exists "dm_participants_insert" on public.dm_participants;
create policy "dm_participants_insert" on public.dm_participants
  for insert to authenticated with check (user_id = auth.uid());

-- dm_messages
drop policy if exists "dm_messages_select" on public.dm_messages;
create policy "dm_messages_select" on public.dm_messages
  for select to authenticated using (public.is_dm_participant(thread_id));

drop policy if exists "dm_messages_insert" on public.dm_messages;
create policy "dm_messages_insert" on public.dm_messages
  for insert to authenticated with check (
    author_id = auth.uid() and public.is_dm_participant(thread_id)
  );

drop policy if exists "dm_messages_update" on public.dm_messages;
create policy "dm_messages_update" on public.dm_messages
  for update to authenticated using (author_id = auth.uid());

drop policy if exists "dm_messages_delete" on public.dm_messages;
create policy "dm_messages_delete" on public.dm_messages
  for delete to authenticated using (author_id = auth.uid());

-- ------------------------------------------------------------
-- REALTIME (permite que o app receba mensagens ao vivo)
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.dm_messages;
alter publication supabase_realtime add table public.dm_threads;

-- ============================================================
-- FOTOS DE PERFIL + EMOJIS PERSONALIZADOS
-- (se você já rodou o schema antes, rode migration-avatars-emojis.sql)
-- ============================================================

alter table public.profiles add column if not exists avatar_url text;

create table if not exists public.server_emojis (
  id uuid default gen_random_uuid() primary key,
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists server_emojis_server_idx on public.server_emojis (server_id);
create unique index if not exists server_emojis_server_name_uq on public.server_emojis (server_id, lower(name));

alter table public.server_emojis enable row level security;

drop policy if exists "server_emojis_select" on public.server_emojis;
create policy "server_emojis_select" on public.server_emojis
  for select to authenticated using (public.is_server_member(server_id));

drop policy if exists "server_emojis_insert" on public.server_emojis;
create policy "server_emojis_insert" on public.server_emojis
  for insert to authenticated with check (public.is_server_owner(server_id));

drop policy if exists "server_emojis_update" on public.server_emojis;
create policy "server_emojis_update" on public.server_emojis
  for update to authenticated using (public.is_server_owner(server_id));

drop policy if exists "server_emojis_delete" on public.server_emojis;
create policy "server_emojis_delete" on public.server_emojis
  for delete to authenticated using (public.is_server_owner(server_id));

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('emojis', 'emojis', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_own_upload" on storage.objects;
create policy "avatars_own_upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_own_update" on storage.objects;
create policy "avatars_own_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_own_delete" on storage.objects;
create policy "avatars_own_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "emojis_public_read" on storage.objects;
create policy "emojis_public_read" on storage.objects
  for select using (bucket_id = 'emojis');

drop policy if exists "emojis_owner_upload" on storage.objects;
create policy "emojis_owner_upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'emojis'
    and exists (
      select 1 from public.servers s
      where s.id::text = (storage.foldername(name))[1] and s.owner_id = auth.uid()
    )
  );

drop policy if exists "emojis_owner_delete" on storage.objects;
create policy "emojis_owner_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'emojis'
    and exists (
      select 1 from public.servers s
      where s.id::text = (storage.foldername(name))[1] and s.owner_id = auth.uid()
    )
  );
