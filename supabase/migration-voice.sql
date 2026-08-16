-- ============================================================
-- MIGRAÇÃO: CANAIS DE VOZ
-- Rode no SQL Editor. Funciona mesmo se já rodou o schema.sql.
-- ============================================================

alter table public.channels add column if not exists type text not null default 'text';

alter table public.channels drop constraint if exists channels_type_check;
alter table public.channels add constraint channels_type_check check (type in ('text', 'voice'));
