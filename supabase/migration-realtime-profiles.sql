-- ============================================================
-- MIGRAÇÃO: REALTIME PARA PERFIS, CANAIS E SERVIDORES
-- Rode este arquivo no SQL Editor do Supabase (funciona mesmo se
-- você já rodou o schema.sql antes — é idempotente).
--
-- Habilita atualizações em tempo real de:
--   - profiles  → nome/foto de usuário ao vivo (mensagens, membros, DMs)
--   - channels  → renomear canal ao vivo para todos
--   - servers   → exclusão de servidor ao vivo
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'channels', 'servers', 'messages', 'dm_messages', 'dm_threads']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
