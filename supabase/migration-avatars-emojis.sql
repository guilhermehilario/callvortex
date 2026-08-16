-- ============================================================
-- MIGRAÇÃO: FOTOS DE PERFIL + EMOJIS PERSONALIZADOS
-- Rode este arquivo no SQL Editor do seu projeto Supabase.
-- Funciona mesmo se você já rodou o schema.sql antes.
-- ============================================================

-- Foto de perfil
alter table public.profiles add column if not exists avatar_url text;

-- Emojis personalizados por servidor
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

-- ------------------------------------------------------------
-- STORAGE (buckets públicos para fotos e emojis)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('emojis', 'emojis', true)
on conflict (id) do nothing;

-- avatars: cada usuário só mexe na própria pasta (avatars/{user_id}/...)
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

-- emojis: pasta do servidor (emojis/{server_id}/...), só o dono envia/apaga
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
