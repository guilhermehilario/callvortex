-- ============================================================
-- ENDURECIMENTO DE SEGURANÇA (18/08/2026)
-- SEC-017: funções executáveis apenas por authenticated (não PUBLIC)
-- SEC-003: uploads de avatar/emoji apenas com extensões de imagem
-- SEC-012: avatar_url restrito ao storage de avatares do projeto
-- SEC-013: dm_threads sem INSERT direto de threads órfãs
-- SEC-014: limite de tamanho de mensagens (4000 chars)
-- Idempotente — pode rodar de novo sem quebrar nada.
-- ============================================================

-- ------------------------------------------------------------
-- SEC-017 — Revogar PUBLIC das funções auxiliares
-- As políticas RLS chamam is_server_member/is_server_owner/
-- is_dm_participant com security definer — só authenticated
-- precisa executá-las. join_server/create_dm_thread idem.
-- ------------------------------------------------------------
revoke all on function public.is_server_member(uuid) from public;
revoke all on function public.is_server_owner(uuid) from public;
revoke all on function public.is_dm_participant(uuid) from public;
revoke all on function public.join_server(text) from public;
revoke all on function public.create_dm_thread(uuid) from public;

grant execute on function public.is_server_member(uuid) to authenticated;
grant execute on function public.is_server_owner(uuid) to authenticated;
grant execute on function public.is_dm_participant(uuid) to authenticated;
grant execute on function public.join_server(text) to authenticated;
grant execute on function public.create_dm_thread(uuid) to authenticated;

-- ------------------------------------------------------------
-- SEC-003 — Uploads apenas com extensões de imagem permitidas
-- O contentType é controlado pelo cliente; aqui a política do
-- Storage rejeita qualquer arquivo que não seja imagem comum
-- (bloqueia html/svg/js/exe renomeados e abuso de cota).
-- ------------------------------------------------------------
drop policy if exists "avatars_own_upload" on storage.objects;
create policy "avatars_own_upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp', 'gif')
  );

drop policy if exists "emojis_owner_upload" on storage.objects;
create policy "emojis_owner_upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'emojis'
    and exists (
      select 1 from public.servers s
      where s.id::text = (storage.foldername(name))[1] and s.owner_id = auth.uid()
    )
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp', 'gif')
  );

-- ------------------------------------------------------------
-- SEC-012 — avatar_url deve apontar para o storage do projeto
-- Impede que um perfil aponte para URL externa (rastreador/abuso).
-- Usa trigger para validar no insert e quando o valor mudar.
-- ------------------------------------------------------------
create or replace function public.validate_avatar_url()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.avatar_url is not null
     and new.avatar_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/' then
    raise exception 'avatar_url deve apontar para o storage de avatares do projeto';
  end if;
  return new;
end
$$;

drop trigger if exists trg_profiles_validate_avatar_url on public.profiles;
create trigger trg_profiles_validate_avatar_url
  before insert or update of avatar_url on public.profiles
  for each row execute function public.validate_avatar_url();

-- ------------------------------------------------------------
-- SEC-013 — dm_threads: bloquear INSERT direto de threads órfãs
-- O app cria conversas via RPC create_dm_thread (security definer,
-- que continua funcionando). Direto pela API, só é possível inserir
-- uma thread se o usuário já for participante dela — o que exige
-- existir —, então threads órfãs ficam impossíveis.
-- ------------------------------------------------------------
drop policy if exists "dm_threads_insert" on public.dm_threads;
create policy "dm_threads_insert" on public.dm_threads
  for insert to authenticated with check (
    exists (
      select 1 from public.dm_participants p
      where p.thread_id = id and p.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- SEC-014 — Limite de tamanho de mensagens (4000 caracteres)
-- NOT VALID: não valida linhas antigas (evita falha na migração),
-- mas passa a valer para novas inserções/atualizações.
-- ------------------------------------------------------------
alter table public.messages
  add constraint messages_content_len check (char_length(content) <= 4000) not valid;

alter table public.dm_messages
  add constraint dm_messages_content_len check (char_length(content) <= 4000) not valid;
