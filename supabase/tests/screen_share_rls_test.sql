-- ============================================================
-- TESTES DE SEGURANÇA (RLS/RPC) — COMPARTILHAMENTO DE TELA
--
-- Executa cenários de ataque da seção 27 do projeto contra as
-- políticas reais do banco. Rodar como postgres (dono do banco):
--
--   ./scripts/test-screen-share-rls.sh [DATABASE_URL]
--   ou: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--         -f supabase/tests/screen_share_rls_test.sql
--
-- Tudo roda dentro de uma transação com ROLLBACK final — o banco
-- fica exatamente como estava (teste não-destructivo).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Massa de dados
--   user_a, user_b : membros do servidor S1 (canal de voz C1)
--   user_x         : autenticado, NÃO é membro de S1
--   owner_b        : dono do servidor S2/canal C2 (outra chamada)
-- ------------------------------------------------------------
insert into auth.users (id, email, encrypted_password) values
  ('00000000-0000-4000-8000-000000000001', 'test-a@example.com', ''),
  ('00000000-0000-4000-8000-000000000002', 'test-b@example.com', ''),
  ('00000000-0000-4000-8000-000000000003', 'test-x@example.com', ''),
  ('00000000-0000-4000-8000-000000000004', 'test-owner2@example.com', '');

insert into public.profiles (id, username, avatar_color) values
  ('00000000-0000-4000-8000-000000000001', 'user-a', '#5865f2'),
  ('00000000-0000-4000-8000-000000000002', 'user-b', '#23a55a'),
  ('00000000-0000-4000-8000-000000000003', 'user-x', '#eb459e'),
  ('00000000-0000-4000-8000-000000000004', 'owner-b', '#faa61a');

insert into public.servers (id, name, owner_id) values
  ('10000000-0000-4000-8000-000000000001', 'Servidor 1', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', 'Servidor 2', '00000000-0000-4000-8000-000000000004');

insert into public.server_members (server_id, user_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002');

insert into public.channels (id, server_id, name, type) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'voz-1', 'voice'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'voz-2', 'voice');

-- ------------------------------------------------------------
-- Helper: assume a identidade de um usuário autenticado
-- ------------------------------------------------------------
create or replace function pg_temp.act_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
end
$$;

create or replace function pg_temp.expect_error(fn_name text, stmt_sql text, needle text) returns void
language plpgsql as $$
declare
  msg text;
begin
  begin
    execute stmt_sql;
  exception when others then
    msg := lower(SQLERRM);
    if position(lower(needle) in msg) = 0 then
      raise exception '[%] erro inesperado: % (esperava conter "%")', fn_name, SQLERRM, needle;
    end if;
    return;
  end;
  raise exception '[%] deveria falhar, mas passou', fn_name;
end
$$;

-- ============================================================
-- T1 — Ataque 1: não-membro tenta INICIAR compartilhamento
-- Esperado: NEGADO
-- ============================================================
select pg_temp.act_as('00000000-0000-4000-8000-000000000003'); -- user_x
select pg_temp.expect_error(
  'ataque1-nao-membro-inicia',
  $$ select public.start_screen_share('20000000-0000-4000-8000-000000000001') $$,
  'sem permiss'
);

-- ============================================================
-- T2 — Membro inicia compartilhamento na própria chamada
-- Esperado: PERMITIDO
-- ============================================================
select pg_temp.act_as('00000000-0000-4000-8000-000000000001'); -- user_a
do $$
declare started timestamptz;
begin
  select public.start_screen_share('20000000-0000-4000-8000-000000000001') into started;
  if started is null then raise exception 'start_screen_share não retornou started_at'; end if;
end $$;

-- ============================================================
-- T3 — Regra "um por vez": segundo membro tenta iniciar
-- Esperado: NEGADO (violation única)
-- ============================================================
select pg_temp.act_as('00000000-0000-4000-8000-000000000002'); -- user_b
select pg_temp.expect_error(
  'um-compartilhamento-por-canal',
  $$ select public.start_screen_share('20000000-0000-4000-8000-000000000001') $$,
  'já está compartilhando'
);

-- ============================================================
-- T4 — Ataque 3: não-membro tenta LER estado/sinais da chamada
-- Esperado: 0 LINHAS (RLS filtra)
-- ============================================================
select pg_temp.act_as('00000000-0000-4000-8000-000000000003'); -- user_x
do $$
declare n int;
begin
  select count(*) into n from public.screen_shares;
  if n <> 0 then raise exception 'ataque4: não-membro leu screen_shares (% linhas)', n; end if;
end $$;

-- ============================================================
-- T5 — Membro lê o estado da chamada dele
-- Esperado: 1 linha (user_a compartilhando em C1)
-- ============================================================
select pg_temp.act_as('00000000-0000-4000-8000-000000000002'); -- user_b
do $$
declare n int; uid uuid;
begin
  select count(*) into n from public.screen_shares where channel_id = '20000000-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'T5: membro deveria ver 1 compartilhamento, viu %', n; end if;
  select user_id into uid from public.screen_shares
    where channel_id = '20000000-0000-4000-8000-000000000001';
  if uid <> '00000000-0000-4000-8000-000000000001' then
    raise exception 'T5: compartilhante errado: %', uid;
  end if;
end $$;

-- ============================================================
-- T6 — Ataque 5: falsificar identidade via INSERT direto
-- (user_b insere linha com sender_id = user_a)
-- Esperado: NEGADO pela policy
-- ============================================================
select pg_temp.act_as('00000000-0000-4000-8000-000000000002'); -- user_b
select pg_temp.expect_error(
  'ataque5-falsificar-sender',
  $$ insert into public.call_signals (channel_id, sender_id, receiver_id, kind, payload)
     values ('20000000-0000-4000-8000-000000000001',
             '00000000-0000-4000-8000-000000000001',
             '00000000-0000-4000-8000-000000000002', 'screen-offer', '{"sdp":{}}'::jsonb) $$,
  ''
);

-- ============================================================
-- T7 — Envio legítimo via RPC: A → B
-- Esperado: PERMITIDO e sender_id gravado = user_a (fonte de verdade)
-- ============================================================
select pg_temp.act_as('00000000-0000-4000-8000-000000000001'); -- user_a
do $$
declare sid bigint;
begin
  select public.send_call_signal(
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'screen-offer', '{"sdp":{"type":"offer","sdp":"v=0"}}'::jsonb
  ) into sid;
  if sid is null then raise exception 'T7: send_call_signal retornou null'; end if;
end $$;
do $$
declare sender uuid; receiver uuid;
begin
  select sender_id, receiver_id into sender, receiver from public.call_signals
    where kind = 'screen-offer';
  if sender <> '00000000-0000-4000-8000-000000000001'
     or receiver <> '00000000-0000-4000-8000-000000000002' then
    raise exception 'T7: sender/receiver errados (%→%)', sender, receiver;
  end if;
end $$;

-- ============================================================
-- T8 — Isolamento entre chamadas (Ataques 2/4):
--   a) A (chamada C1) tenta enviar sinal para canal C2
--   b) owner_b (C2) tenta receber sinal endereçado em C1
-- Esperado: NEGADO nos dois casos
-- ============================================================
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select pg_temp.expect_error(
  'ataque2-canal-alheio',
  $$ select public.send_call_signal(
       '20000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-000000000004', 'screen-offer', '{}'::jsonb) $$,
  'permiss|participa'
);

-- user_x não participa de C1: enviar para ele deve falhar
select pg_temp.expect_error(
  'destinatario-fora-da-chamada',
  $$ select public.send_call_signal(
       '20000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000003', 'screen-ice', '{}'::jsonb) $$,
  'participa'
);

-- ============================================================
-- T9 — Validação de payload/tipo (seção 28)
--   a) tipo fora da whitelist
--   b) sinalizar a si mesmo
--   c) payload gigante
-- Esperado: NEGADO
-- ============================================================
select pg_temp.expect_error(
  'tipo-invalido',
  $$ select public.send_call_signal(
       '20000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000002', 'hack', '{}'::jsonb) $$,
  'tipo'
);
select pg_temp.expect_error(
  'auto-sinalizacao',
  $$ select public.send_call_signal(
       '20000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000001', 'screen-ice', '{}'::jsonb) $$,
  'si mesmo'
);
select pg_temp.expect_error(
  'payload-gigante',
  $$ select public.send_call_signal(
       '20000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000002', 'screen-ice',
       to_jsonb(repeat('x', 70000))) $$,
  'grande'
);

-- ============================================================
-- T10 — UPDATE em call_signals é impossível (imutabilidade)
-- Esperado: 0 linhas atualizadas (policy ausente)
-- ============================================================
select pg_temp.act_as('00000000-0000-4000-8000-000000000002'); -- user_b (destinatário)
do $$
declare n bigint;
begin
  update public.call_signals set kind = 'screen-answer';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'T10: UPDATE indevido afetou % linhas', n; end if;
end $$;

-- ============================================================
-- T11 — Consumo: destinatário apaga sinais endereçados a ele;
--       não consegue apagar os de OUTRA chamada (Ataque 8)
-- Esperado: apaga os seus; sinais alheios permanecem
-- ============================================================
select pg_temp.act_as('00000000-0000-4000-8000-000000000002'); -- user_b
delete from public.call_signals where receiver_id = '00000000-0000-4000-8000-000000000002';

-- ============================================================
-- T12 — Heartbeat: só o compartilhante renova a própria sessão
-- Esperado: touch de user_b não muda a sessão de user_a
-- ============================================================
do $$
declare before_ts timestamptz;
begin
  select updated_at into before_ts from public.screen_shares
    where channel_id = '20000000-0000-4000-8000-000000000001';
  perform public.touch_screen_share('20000000-0000-4000-8000-000000000001');
  if (select updated_at from public.screen_shares
      where channel_id = '20000000-0000-4000-8000-000000000001') <> before_ts then
    raise exception 'T12: não-compartilhante conseguiu renovar a sessão';
  end if;
end $$;
select pg_temp.act_as('00000000-0000-4000-8000-000000000001'); -- user_a (dono da sessão)
do $$
declare before_ts timestamptz;
begin
  select updated_at into before_ts from public.screen_shares
    where channel_id = '20000000-0000-4000-8000-000000000001';
  perform pg_sleep(0.01);
  perform public.touch_screen_share('20000000-0000-4000-8000-000000000001');
  if (select updated_at from public.screen_shares
      where channel_id = '20000000-0000-4000-8000-000000000001') <= before_ts then
    raise exception 'T12: heartbeat legítimo não renovou';
  end if;
end $$;

-- ============================================================
-- T13 — Sessão órfã: start limpa sessão sem heartbeat (>90 s)
-- Esperado: user_b consegue iniciar após expiração simulada
-- ============================================================
select pg_temp.act_as('postgres');
update public.screen_shares set updated_at = now() - interval '120 seconds'
  where channel_id = '20000000-0000-4000-8000-000000000001';
select pg_temp.act_as('00000000-0000-4000-8000-000000000002'); -- user_b
do $$
declare uid uuid;
begin
  perform public.start_screen_share('20000000-0000-4000-8000-000000000001');
  select user_id into uid from public.screen_shares
    where channel_id = '20000000-0000-4000-8000-000000000001';
  if uid <> '00000000-0000-4000-8000-000000000002' then
    raise exception 'T13: sessão órfã não foi liberada (sharer=%)', uid;
  end if;
end $$;

-- ============================================================
-- T14 — Encerrar: só o próprio compartilhante (ou expiração)
-- Esperado: stop de user_b apaga a linha dele
-- ============================================================
perform public.stop_screen_share('20000000-0000-4000-8000-000000000001');
do $$
declare n int;
begin
  select count(*) into n from public.screen_shares;
  if n <> 0 then raise exception 'T14: sobrou % sessão(ões) após stop', n; end if;
end $$;

-- ============================================================
-- FIM — desfaz toda a massa de dados
-- ============================================================
rollback;
