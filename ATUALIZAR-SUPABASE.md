# ⬆️ Atualizar o Supabase sem perder dados

Guia para aplicar as mudanças novas do projeto no seu Supabase **sem apagar
nada** do que já existe (canais, mensagens, perfis, servidores, DMs, emojis).

---

## 1. O que é seguro rodar

Para um projeto que **já tem dados**, rode apenas o arquivo de migração:

```
supabase/migration-realtime-profiles.sql
```

Esse arquivo **não altera nenhuma tabela nem nenhum registro**. Ele só
adiciona tabelas na **publicação de Realtime** (`supabase_realtime`) — a lista
de tabelas que o banco "avisa" quando algo muda. Por isso:

- ✅ Nenhum `DELETE`, `UPDATE` ou `DROP` em dados existentes
- ✅ Nenhuma coluna/tabela alterada ou removida
- ✅ Seus canais, mensagens, perfis, servidores, DMs e emojis ficam intactos
- ✅ É **idempotente** — pode rodar quantas vezes quiser, nunca dá erro nem duplica nada

O que essa migração habilita:

| Tabela | Efeito no app |
|---|---|
| `profiles` | Nome/foto de usuário atualizando ao vivo (mensagens, membros, DMs) |
| `channels` | Renomear canal propagando em tempo real para todos |
| `servers` | Exclusão de servidor em tempo real |

---

## 2. Passo a passo

1. Abra o painel do Supabase → clique no seu projeto → **SQL Editor** → **New query**.
2. Copie o conteúdo inteiro do arquivo **`supabase/migration-realtime-profiles.sql`**.
3. Cole no editor e clique em **Run**.
4. Deve aparecer *"Success. No rows returned"* (normal — o script não devolve dados).

### Conferir que funcionou

No painel, vá em **Database → Publications → supabase_realtime** e verifique
se `profiles`, `channels` e `servers` estão na lista de tabelas.

Ou teste direto no app: renomeie um canal (deve aparecer para todos) e troque
o nome de usuário (deve atualizar ao vivo para os outros).

## 2. Compartilhamento de tela (novo)

Para habilitar o **compartilhamento de tela** em um projeto que já tem dados,
rode apenas:

```
supabase/migrations/20260823120000_screen_share.sql
```

Esse arquivo é **idempotente** e seguro para projetos com dados:

- ✅ Cria as tabelas `screen_shares` (estado de quem compartilha) e `call_signals` (sinalização WebRTC efêmera) com **RLS ativado**
- ✅ Cria as funções `is_call_participant`, `start_screen_share`, `touch_screen_share`, `stop_screen_share` e `send_call_signal`
- ✅ Adiciona as duas tabelas na publicação Realtime (com proteção contra duplicação)
- ❌ Não apaga nem altera dados existentes (canais, mensagens, perfis, servidores, DMs, emojis, voz)

Passo a passo: igual à seção anterior — copie o conteúdo do arquivo no
SQL Editor e clique em **Run**.

### Conferir que funcionou

No painel: **Database → Publications → supabase_realtime** deve listar
também `screen_shares` e `call_signals`. No app: entre num canal de voz e
clique em "Compartilhar tela" — os outros participantes devem ver o
indicador 🖥️ e receber a imagem.

### ✅ Já aplicado (23/08/2026)

Este projeto **já tem** o compartilhamento de tela aplicado no Supabase
via CLI (`yarn supabase db push`). Foram 4 migrações, na ordem:

1. `20260823120000_screen_share.sql` — tabelas, funções, RLS e publicação
2. `20260823131000_screen_share_fixes.sql` — grants de tabela + heartbeat com `clock_timestamp()`
3. `20260823132000_screen_share_tighten_acls.sql` — remove os privilégios extras que o ambiente hospedado dá por padrão (`anon` perde acesso; `authenticated` fica só com o necessário)
4. `20260823140000_screen_share_room_lifecycle.sql` — compartilhamento não sobrevive à sala: quem voltar a uma sala vazia nunca pega erro de "alguém já está compartilhando" fantasma
5. `20260824000000_realtime_private_voice.sql` — **segurança da voz**: política RLS em `realtime.messages` restringe o tópico `voice:<channel_id>` a membros do servidor (portável entre versões do Realtime: detecta `channel_name`/`topic`)

**Ordem de ativação da 5ª (canais privados):**
   1. Aplique a migração (`yarn supabase db push` ou SQL Editor).
   2. No painel: **Realtime → Settings → "Allow private channels" = ON**.
   3. Só então defina `VITE_REALTIME_PRIVATE=1` no `.env` e gere build novo.
      Enquanto o flag estiver desligado, o app funciona como hoje — mas com
      o filtro client-side de membros já ativo (ver
      `docs/RELATORIO-ISOLAMENTO-VOZ.md`).

A migração 4 muda três funções (todas idempotentes):

| Função | Novo comportamento |
|---|---|
| `ensure_voice_session` | Primeira pessoa a entrar numa sala vazia/órfã apaga qualquer compartilhamento remanescente do canal |
| `start_screen_share` | Considera órfão também o compartilhamento cuja sala não tem sessão de voz viva (além da regra dos 90 s) |
| `touch_screen_share` | Se a sala acabou (todos saíram/app fechou), o heartbeat **apaga** a linha em vez de renovar — espectadores são limpos em tempo real |

Se você estiver configurando **outro projeto** (ex.: recriar na outra
máquina), rode as quatro na ordem acima — todas idempotentes — ou use
`yarn supabase db push` com o projeto vinculado.

---

## 3. ⚠️ O que NÃO fazer

**Não rode o `schema.sql` inteiro de novo** no projeto que já tem dados.

Ele até usa `if not exists` nas tabelas, mas as linhas
`alter publication supabase_realtime add table public.messages;` **não são
idempotentes**: como `messages` já está na publicação, o script para no meio
com o erro *"table ... is already member of publication"*.

As mudanças no `supabase/schema.sql` valem apenas para quem for criar um
**projeto novo do zero** (nesse caso, rode o `schema.sql` inteiro uma única
vez e depois as migrações).

---

## 4. Depois de atualizar

- **Desenvolvimento** (`yarn dev`): reinicie o app e pronto.
- **Instalador `.exe`**: rode `yarn dist` para gerar um executável novo
  com as correções (as chaves ficam gravadas dentro do executável no momento
  do build).

---

## 5. Resumo

```
Projeto NOVO (do zero)
  └─ rode supabase/schema.sql (uma vez)
      └─ depois as migrações (avatars-emojis, voice, realtime-profiles,
         screen_share + fixes + tighten_acls)

Projeto EXISTENTE (com dados)
  └─ rode só supabase/migration-realtime-profiles.sql (idempotente, seguro)
      └─ + as 4 migrações de compartilhamento de tela
         (20260823120000 → … → 20260823140000 → 20260824000000)
      └─ NÃO rode o schema.sql inteiro de novo

Este projeto ([REF_REMOVIDO]): ✅ tudo aplicado via CLI em 23/08/2026.
```
