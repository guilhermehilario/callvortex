-- Canais privados do Realtime para a voz: só membros do servidor podem
-- assinar o tópico "voice:<channel_id>". Fecha a falha T6–T9 do relatório
-- docs/RELATORIO-ISOLAMENTO-VOZ.md (intruso anônimo entrava no tópico,
-- via presença e recebia ofertas/ICE dos participantes).
--
-- ORDEM DE ATIVAÇÃO (importante):
--   1. Aplique esta migração.
--   2. No painel do Supabase: Realtime → Settings → marque "Allow private channels".
--   3. Só então defina VITE_REALTIME_PRIVATE=1 nos builds do app
--      (o cliente continua funcionando com o flag desligado enquanto isso).
--
-- Portabilidade: versões antigas do Realtime chamam a coluna de "topic";
-- as atuais (e o hospedado) usam "channel_name". O bloco abaixo cria a
-- política com a coluna que existir.

do $$
declare
  col text;
begin
  select case
           when exists (select 1 from information_schema.columns
                         where table_schema = 'realtime' and table_name = 'messages'
                           and column_name = 'channel_name') then 'channel_name'
           when exists (select 1 from information_schema.columns
                         where table_schema = 'realtime' and table_name = 'messages'
                           and column_name = 'topic') then 'topic'
           else null
         end
    into col;

  if col is null then
    raise notice 'realtime.messages não existe — política de canal privado ignorada';
    return;
  end if;

  execute format($p$
    drop policy if exists "voice_topic_members_only" on realtime.messages;
    create policy "voice_topic_members_only"
      on realtime.messages
      for select
      to authenticated
      using (
        %I like 'voice:%%'
        and public.is_server_member(
          (select c.server_id
             from public.channels c
            where c.id = substring(%I from 7)::uuid)
        )
      )
  $p$, col, col);

  raise notice 'política voice_topic_members_only criada usando a coluna %', col;
end
$$;

-- Observações:
-- - Um uuid inválido no tópico nega por exceção na conversão (fail closed).
-- - Presença e broadcast passam pela mesma autorização de inscrição.
