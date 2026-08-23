-- ============================================================
-- MIGRAÇÃO VERSIONADA: COMPARTILHAMENTO DE TELA
--
-- Estado do compartilhamento (quem está compartilhando em cada
-- canal de voz) e sinalização WebRTC protegida por RLS.
--
-- Regra de segurança central:
--   uma "chamada" no CallVortex é um canal de voz (channels.type='voice')
--   e participar dela exige ser membro do servidor do canal.
--   Toda leitura/escrita aqui passa por essa mesma regra — o banco é
--   a fonte da verdade, nunca o frontend.
--
-- Idempotente: pode rodar via `supabase db push` ou SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- Função auxiliar: o usuário autenticado participa do canal?
-- (membro do servidor dono do canal — mesma regra da voz)
-- ------------------------------------------------------------
create or replace function public.is_call_participant(target_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.channels c
    join public.server_members sm on sm.server_id = c.server_id
    where c.id = target_channel and sm.user_id = auth.uid()
      and c.type = 'voice'
  )
$$;

revoke all on function public.is_call_participant(uuid) from public;
grant execute on function public.is_call_participant(uuid) to authenticated;

-- ------------------------------------------------------------
-- Tabela: UMA linha por canal com compartilhamento ATIVO
-- (PK em channel_id garante no máximo um compartilhamento por canal)
-- Armazena apenas metadados — vídeo/frames NUNCA tocam o banco.
-- ------------------------------------------------------------
create table if not exists public.screen_shares (
  channel_id uuid primary key references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.screen_shares enable row level security;

drop policy if exists "screen_shares_select" on public.screen_shares;
create policy "screen_shares_select" on public.screen_shares
  for select to authenticated using (
    public.is_call_participant(channel_id)
  );

drop policy if exists "screen_shares_insert" on public.screen_shares;
create policy "screen_shares_insert" on public.screen_shares
  for insert to authenticated with check (
    user_id = auth.uid() and public.is_call_participant(channel_id)
  );

drop policy if exists "screen_shares_update" on public.screen_shares;
create policy "screen_shares_update" on public.screen_shares
  for update to authenticated using (
    user_id = auth.uid() and public.is_call_participant(channel_id)
  );

drop policy if exists "screen_shares_delete" on public.screen_shares;
create policy "screen_shares_delete" on public.screen_shares
  for delete to authenticated using (
    user_id = auth.uid() and public.is_call_participant(channel_id)
  );

-- ------------------------------------------------------------
-- Tabela: SINALIZAÇÃO WebRTC efêmera (offer/answer/ICE de tela)
-- Cada linha é uma mensagem endereçada; o Realtime entrega via
-- postgres_changes, que RESPEITA estas políticas RLS — quem não
-- participa da chamada não recebe nem lê as linhas.
-- ------------------------------------------------------------
create table if not exists public.call_signals (
  id bigint generated always as identity primary key,
  channel_id uuid not null references public.channels (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('screen-offer', 'screen-answer', 'screen-ice')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists call_signals_receiver_idx on public.call_signals (receiver_id, id);
create index if not exists call_signals_created_idx on public.call_signals (created_at);

alter table public.call_signals enable row level security;

-- Lê apenas mensagens suas (enviadas ou recebidas) e só enquanto
-- ainda participa da chamada.
drop policy if exists "call_signals_select" on public.call_signals;
create policy "call_signals_select" on public.call_signals
  for select to authenticated using (
    (sender_id = auth.uid() or receiver_id = auth.uid())
    and public.is_call_participant(channel_id)
  );

-- Só envia como VOCÊ mesmo (sender_id é sempre auth.uid()) e somente
-- para participantes da MESMA chamada. O tipo é restrito por CHECK.
drop policy if exists "call_signals_insert" on public.call_signals;
create policy "call_signals_insert" on public.call_signals
  for insert to authenticated with check (
    sender_id = auth.uid()
    and receiver_id <> auth.uid()
    and public.is_call_participant(channel_id)
    and public.is_server_member((select server_id from public.channels where id = channel_id))
    -- o destinatário precisa existir como membro do servidor do canal
    and exists (
      select 1
      from public.server_members sm
      join public.channels c on c.server_id = sm.server_id
      where c.id = channel_id and sm.user_id = receiver_id
    )
    and pg_column_size(payload) < 65536
  );

-- Remetente ou destinatário podem apagar (limpeza após consumo).
drop policy if exists "call_signals_delete" on public.call_signals;
create policy "call_signals_delete" on public.call_signals
  for delete to authenticated using (
    (sender_id = auth.uid() or receiver_id = auth.uid())
    and public.is_call_participant(channel_id)
  );

-- Sem UPDATE: mensagens são imutáveis (evita adulteração após envio).

-- ------------------------------------------------------------
-- REALTIME: publica as tabelas para postgres_changes
-- (a entrega respeita RLS linha a linha)
-- ------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.screen_shares;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.call_signals;
  exception when duplicate_object then null;
  end;
end $$;

-- ------------------------------------------------------------
-- Inicia compartilhamento (RPC atômica):
--  - valida participação na chamada;
--  - limpa sessões órfãs (>90 s sem heartbeat);
--  - insere; se outro usuário já estiver compartilhando, falha
--    com violação de chave única ("um compartilhamento por vez").
-- Retorna started_at.
-- ------------------------------------------------------------
create or replace function public.start_screen_share(target_channel uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  started timestamptz;
begin
  if not public.is_call_participant(target_channel) then
    raise exception 'Sem permissão para este canal de voz';
  end if;

  -- sessão órfã (app fechou sem avisar): libera o canal
  delete from public.screen_shares
  where channel_id = target_channel
    and updated_at < now() - interval '90 seconds';

  begin
    insert into public.screen_shares (channel_id, user_id)
    values (target_channel, auth.uid())
    returning started_at into started;
  exception when unique_violation then
    raise exception 'Alguém já está compartilhando a tela neste canal';
  end;

  return started;
end
$$;

-- ------------------------------------------------------------
-- Heartbeat: mantém updated_at fresco enquanto compartilha.
-- ------------------------------------------------------------
create or replace function public.touch_screen_share(target_channel uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_call_participant(target_channel) then
    raise exception 'Sem permissão para este canal de voz';
  end if;
  update public.screen_shares
  set updated_at = now()
  where channel_id = target_channel and user_id = auth.uid();
end
$$;

-- ------------------------------------------------------------
-- Encerra o MEU compartilhamento no canal.
-- ------------------------------------------------------------
create or replace function public.stop_screen_share(target_channel uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_call_participant(target_channel) then
    raise exception 'Sem permissão para este canal de voz';
  end if;
  delete from public.screen_shares
  where channel_id = target_channel and user_id = auth.uid();
end
$$;

-- ------------------------------------------------------------
-- Envia um sinal de tela para um participante da chamada.
-- O remetente é SEMPRE auth.uid() — impossível falsificar identidade.
-- Impossível enviar para outra chamada: channel e receiver são
-- validados contra a participação real no banco.
-- Aproveita para purgar sinais antigos (>10 min).
-- ------------------------------------------------------------
create or replace function public.send_call_signal(
  p_channel uuid,
  p_receiver uuid,
  p_kind text,
  p_payload jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
begin
  if not public.is_call_participant(p_channel) then
    raise exception 'Sem permissão para este canal de voz';
  end if;

  if p_kind not in ('screen-offer', 'screen-answer', 'screen-ice') then
    raise exception 'Tipo de sinal inválido';
  end if;

  if p_receiver = auth.uid() then
    raise exception 'Não é possível sinalizar a si mesmo';
  end if;

  if pg_column_size(p_payload) >= 65536 then
    raise exception 'Payload muito grande';
  end if;

  -- o destinatário precisa participar da MESMA chamada
  if not exists (
    select 1
    from public.server_members sm
    join public.channels c on c.server_id = sm.server_id
    where c.id = p_channel and sm.user_id = p_receiver
  ) then
    raise exception 'Destinatário não participa desta chamada';
  end if;

  insert into public.call_signals (channel_id, sender_id, receiver_id, kind, payload)
  values (p_channel, auth.uid(), p_receiver, p_kind, p_payload)
  returning id into new_id;

  -- limpeza best-effort de sinais vencidos (efêmeros por design)
  delete from public.call_signals where created_at < now() - interval '10 minutes';

  return new_id;
end
$$;

-- Aplica os mesmos grants/revoke das demais funções do projeto
revoke all on function public.start_screen_share(uuid) from public;
revoke all on function public.touch_screen_share(uuid) from public;
revoke all on function public.stop_screen_share(uuid) from public;
revoke all on function public.send_call_signal(uuid, uuid, text, jsonb) from public;
grant execute on function public.start_screen_share(uuid) to authenticated;
grant execute on function public.touch_screen_share(uuid) to authenticated;
grant execute on function public.stop_screen_share(uuid) to authenticated;
grant execute on function public.send_call_signal(uuid, uuid, text, jsonb) to authenticated;
