-- ============================================================
-- CORREÇÃO: políticas RLS de canais (renomear/excluir)
-- O UPDATE de canal retornava 0 linhas ("nenhuma linha alterada")
-- porque a política channels_update não existia no banco remoto
-- (ou a função is_server_owner estava quebrada).
-- Idempotente: pode rodar quantas vezes precisar.
-- ============================================================

-- Funções auxiliares (segurança: security definer, para ler fora do RLS)
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

-- Políticas de canais
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
