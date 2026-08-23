-- ============================================================
-- MIGRAÇÃO VERSIONADA: COMPARTILHAMENTO DE TELA × CICLO DE VIDA DA SALA
--
-- Regra central: um compartilhamento NÃO pode sobreviver à sala.
--
-- Problema resolvido: se todos saírem da sala e quem compartilhava
-- fechou o app sem avisar (crash/kill/rede caiu), a linha em
-- screen_shares ficava presa por até 90 s — quem voltava via o erro
-- "Alguém já está compartilhando a tela neste canal".
--
-- Três mudanças (todas idempotentes):
--   1. ensure_voice_session: quando a sessão da sala é (re)criada —
--      primeira pessoa entrando numa sala vazia/órfã — apaga qualquer
--      compartilhamento remanescente do canal. Retorno à sala = estado limpo.
--   2. start_screen_share: além da regra de 90 s sem heartbeat, agora
--      também considera órfão todo compartilhamento cujo canal não tem
--      sessão de voz viva (voice_sessions com heartbeat < 5 min).
--   3. touch_screen_share: se a sala morreu (sessão ausente/velha),
--      o heartbeat APAGA a própria linha em vez de renovar — o
--      compartilhamento morre junto com a sala, e os espectadores são
--      notificados em tempo real pelo evento DELETE.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ensure_voice_session: retorno à sala limpa compartilhamentos
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
  reiniciou boolean := false;
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
    reiniciou := true;
  elsif now() - upd > interval '5 minutes' then
    -- sessão órfã (crash/saída sem avisar): reinicia o relógio
    update public.voice_sessions
    set started_at = now(), updated_at = now()
    where channel_id = target_channel
    returning started_at into started;
    reiniciou := true;
  else
    -- sala continua ativa: só renova o heartbeat
    update public.voice_sessions set updated_at = now()
    where channel_id = target_channel;
  end if;

  -- Sala (re)começando AGORA: nenhum compartilhamento de uma rodada
  -- anterior sobrevive. É isso que garante que voltar à sala nunca
  -- esbarre em "alguém já está compartilhando" fantasma.
  if reiniciou then
    delete from public.screen_shares where channel_id = target_channel;
  end if;

  return started;
end
$$;

-- ------------------------------------------------------------
-- 2) start_screen_share: órfão = sem heartbeat 90 s OU sala morta
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

  -- sessões órfãs liberam o canal: sem heartbeat recente OU sem sala viva
  delete from public.screen_shares s
  where s.channel_id = target_channel
    and (
      s.updated_at < now() - interval '90 seconds'
      or not exists (
        select 1 from public.voice_sessions vs
        where vs.channel_id = s.channel_id
          and vs.updated_at > now() - interval '5 minutes'
      )
    );

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
-- 3) touch_screen_share: sala morta ⇒ encerra o compartilhamento
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

  -- A sala acabou (todos saíram / app dos participantes morreu):
  -- o compartilhamento não sobrevive a ela. Apagar (em vez de apenas
  -- não renovar) dispara o evento DELETE no Realtime e limpa a UI de
  -- qualquer espectador que ainda esteja vendo.
  if not exists (
    select 1 from public.voice_sessions
    where channel_id = target_channel
      and updated_at > now() - interval '5 minutes'
  ) then
    delete from public.screen_shares
    where channel_id = target_channel and user_id = auth.uid();
    return;
  end if;

  update public.screen_shares
  set updated_at = clock_timestamp() -- now() congela na transação; heartbeat quer o instante real
  where channel_id = target_channel and user_id = auth.uid();
end
$$;

-- Mantém os grants das funções recriadas
revoke all on function public.ensure_voice_session(uuid) from public, anon;
grant execute on function public.ensure_voice_session(uuid) to authenticated;
revoke all on function public.start_screen_share(uuid) from public, anon;
grant execute on function public.start_screen_share(uuid) to authenticated;
revoke all on function public.touch_screen_share(uuid) from public, anon;
grant execute on function public.touch_screen_share(uuid) to authenticated;
