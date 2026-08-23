-- ============================================================
-- DELTA: correções do compartilhamento de tela descobertas
-- pela suíte de testes RLS (supabase/tests/screen_share_rls_test.sql)
--
-- 1) GRANTs de tabela explícitos — a RLS decide as LINHAS, mas o
--    privilégio de OPERAÇÃO precisa existir (sem depender dos
--    default privileges do ambiente hospedado).
-- 2) Heartbeat com clock_timestamp() — now() congela no início
--    da transação e mascara renovações legítimas.
-- Idempotente: pode rodar quantas vezes for preciso.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Privilégios de tabela
-- ------------------------------------------------------------
revoke all on table public.screen_shares from public;
grant select on table public.screen_shares to authenticated;

revoke all on table public.call_signals from public;
grant select, insert, delete on table public.call_signals to authenticated;
-- UPDATE não é concedido = sinais imutáveis (teste T10)

-- ------------------------------------------------------------
-- 2) Heartbeat com instante real
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
  set updated_at = clock_timestamp() -- now() congela na transação; heartbeat quer o instante real
  where channel_id = target_channel and user_id = auth.uid();
end
$$;

-- Mantém os grants de execução (recriar função reseta privilégios)
revoke all on function public.touch_screen_share(uuid) from public;
grant execute on function public.touch_screen_share(uuid) to authenticated;
