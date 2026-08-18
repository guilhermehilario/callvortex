-- ============================================================
-- MIGRAÇÃO VERSIONADA: SESSÕES DE VOZ (atividade das salas)
-- Mostra quem está em cada canal de voz mesmo sem estar dentro,
-- e há quanto tempo a sala está ativa (relógio ao lado do nome).
-- Idempotente: pode rodar via db push mesmo se o SQL já foi
-- aplicado manualmente no SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- Tabela: uma linha por canal de voz ATIVO
-- ------------------------------------------------------------
create table if not exists public.voice_sessions (
  channel_id uuid primary key references public.channels (id) on delete cascade,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.voice_sessions enable row level security;

-- Membros do servidor do canal podem ver/gerenciar a sessão
drop policy if exists "voice_sessions_select" on public.voice_sessions;
create policy "voice_sessions_select" on public.voice_sessions
  for select to authenticated using (
    public.is_server_member((select server_id from public.channels where id = channel_id))
  );

drop policy if exists "voice_sessions_insert" on public.voice_sessions;
create policy "voice_sessions_insert" on public.voice_sessions
  for insert to authenticated with check (
    public.is_server_member((select server_id from public.channels where id = channel_id))
  );

drop policy if exists "voice_sessions_update" on public.voice_sessions;
create policy "voice_sessions_update" on public.voice_sessions
  for update to authenticated using (
    public.is_server_member((select server_id from public.channels where id = channel_id))
  );

drop policy if exists "voice_sessions_delete" on public.voice_sessions;
create policy "voice_sessions_delete" on public.voice_sessions
  for delete to authenticated using (
    public.is_server_member((select server_id from public.channels where id = channel_id))
  );

-- ------------------------------------------------------------
-- Garante a sessão: cria com now() se não existir, mantém o
-- horário original enquanto a sala estiver ativa (heartbeat) e
-- reinicia o relógio se a sessão ficou órfã (ex.: app fechado
-- sem avisar — ninguém atualizou nos últimos 5 minutos).
-- ------------------------------------------------------------
create or replace function public.ensure_voice_session(target_channel uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  started timestamptz;
  upd timestamptz;
begin
  -- só membro do servidor do canal pode registrar atividade
  if not exists (
    select 1 from public.channels c
    join public.server_members sm on sm.server_id = c.server_id
    where c.id = target_channel and sm.user_id = auth.uid()
  ) then
    raise exception 'Sem permissão para este canal de voz';
  end if;

  select started_at, updated_at into started, upd
  from public.voice_sessions
  where channel_id = target_channel;

  if started is null then
    insert into public.voice_sessions (channel_id, started_at, updated_at)
    values (target_channel, now(), now())
    returning started_at into started;
  elsif now() - upd > interval '5 minutes' then
    -- sessão órfã (crash/saída sem avisar): reinicia o relógio
    update public.voice_sessions
    set started_at = now(), updated_at = now()
    where channel_id = target_channel
    returning started_at into started;
  else
    -- sala continua ativa: só renova o heartbeat
    update public.voice_sessions set updated_at = now()
    where channel_id = target_channel;
  end if;

  return started;
end
$$;

-- ------------------------------------------------------------
-- Encerra a sessão quando a sala fica vazia.
-- ------------------------------------------------------------
create or replace function public.end_voice_session(target_channel uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.channels c
    join public.server_members sm on sm.server_id = c.server_id
    where c.id = target_channel and sm.user_id = auth.uid()
  ) then
    raise exception 'Sem permissão para este canal de voz';
  end if;

  delete from public.voice_sessions where channel_id = target_channel;
end
$$;

revoke all on function public.ensure_voice_session(uuid) from public;
revoke all on function public.end_voice_session(uuid) from public;
grant execute on function public.ensure_voice_session(uuid) to authenticated;
grant execute on function public.end_voice_session(uuid) to authenticated;
