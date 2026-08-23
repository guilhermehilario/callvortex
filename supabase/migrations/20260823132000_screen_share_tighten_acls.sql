-- ============================================================
-- DELTA 2: aperta os privilégios de tela compartilhada
--
-- O ambiente hospedado do Supabase aplica "default privileges"
-- que dão GRANT ALL (incluindo UPDATE!) a anon/authenticated em
-- toda tabela nova. A RLS continua filtrando as LINHAS, mas o
-- desenho de segurança pedia operações mínimas por papel:
--   screen_shares -> authenticated só SELECT (escrita via RPC)
--   call_signals  -> authenticated SELECT/INSERT/DELETE (imutável)
--   anon          -> nada
-- service_role fica como está (convenção Supabase / admin).
-- Idempotente.
-- ============================================================

revoke all on table public.screen_shares from anon;
revoke all on table public.screen_shares from authenticated;
grant select on table public.screen_shares to authenticated;

revoke all on table public.call_signals from anon;
revoke all on table public.call_signals from authenticated;
grant select, insert, delete on table public.call_signals to authenticated;

-- Funções: remove o EXECUTE herdado dos defaults para anon
-- (a migração original já tinha feito revoke apenas de PUBLIC).
revoke all on function public.is_call_participant(uuid) from anon;
revoke all on function public.start_screen_share(uuid) from anon;
revoke all on function public.touch_screen_share(uuid) from anon;
revoke all on function public.stop_screen_share(uuid) from anon;
revoke all on function public.send_call_signal(uuid, uuid, text, jsonb) from anon;
