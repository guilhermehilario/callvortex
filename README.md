# 💬 CallVortex

Chat por texto e voz em tempo real com seus amigos. Desktop (Electron + React + TypeScript) com backend Supabase (Postgres + Realtime + Auth).

## Funcionalidades

- 🔐 Login e criação de conta (e-mail + senha)
- 🖥️ Servidores com canais de texto
- ✉️ Mensagens diretas 1:1
- ⚡ Mensagens em tempo real (Realtime do Supabase)
- 🟢 Presença online (quem está conectado)
- 🔗 Entrar em servidor por código de convite
- 🖼️ Foto de perfil (clique no seu avatar no canto inferior esquerdo)
- 😀 Emojis personalizados por servidor (dono gerencia; use `:nome:` nas mensagens)
- 🔊 Canais de voz com chamadas em tempo real (WebRTC) — mudo, surdo e indicador de quem está falando
- 🖥️ **Compartilhamento de tela** dentro da chamada (tela inteira ou janela), com prévia, indicador de quem está compartilhando e visualização P2P protegida por RLS
- 🗑️ Excluir mensagens, canais e servidores
- 📦 Gerar instalador .exe para distribuir aos amigos

> **Atenção**: se você já rodou o `supabase/schema.sql` antes, rode também as
> migrações no SQL Editor, nesta ordem: `migration-avatars-emojis.sql` (fotos +
> emojis), `migration-voice.sql` (canais de voz),
> `migration-realtime-profiles.sql` (nome/foto de usuário, renomear canal e
> exclusão de servidor em tempo real) e
> `migrations/20260823120000_screen_share.sql` (compartilhamento de tela).

### Sobre a voz (WebRTC)

- O áudio é **ponto a ponto** (malha): cada participante se conecta diretamente aos outros; o Supabase só faz a sinalização (quem entrou, oferta/resposta, ICE) via Realtime.
- O **compartilhamento de tela usa a mesma malha**: o vídeo viaja junto do áudio nos mesmos RTCPeerConnections. Quem está compartilhando e os sinais de renegociação trafegam pela tabela `call_signals` protegida por RLS — um usuário fora da chamada não lê nem envia sinalização.
- A conexão usa servidores STUN públicos + TURN público (Open Relay). Em redes com NAT restrito pode ser preciso um TURN próprio (ex.: Twilio, Metered, Xirsys) — a lista de servidores fica em `ICE_SERVERS` (`src/renderer/src/lib/voice.ts`).

## Como rodar

### 1. Criar o projeto Supabase (grátis)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. **Onde encontrar as chaves:** leia o guia **`CONFIGURACAO.md`** na raiz do projeto — ele mostra passo a passo onde ficam o *Project URL* e a *publishable/anon key* no painel atual do Supabase (Settings → API Keys).
3. Copie o arquivo `.env.example` para `.env` e preencha:

```
VITE_SUPABASE_URL=sua-project-url
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

4. No **SQL Editor** do painel, abra uma nova query, cole o conteúdo de `supabase/schema.sql` e rode. Esse script cria todas as tabelas, as regras de segurança (RLS) e habilita o Realtime. Se você **já** rodou o schema antes, rode também `supabase/migration-realtime-profiles.sql` (habilita nome/foto de usuário, renomear canal e exclusão de servidor em tempo real — necessário para as atualizações ao vivo funcionarem).

### 2. Instalar e rodar

```bash
yarn install
yarn dev
```

O app abre em uma janela desktop. Crie sua conta e convide os amigos!

## Empacotar para distribuir (Windows)

```bash
yarn dist
```

Gera um instalador e uma versão portátil na pasta `release/`. Seus amigos precisarão apenas instalar e criar conta — o banco é compartilhado via Supabase.

## 📚 Documentação

- **`docs/GUIA-RAPIDO.md`** — ⭐ do zero até conversar com o amigo (comece aqui)
- **`docs/ESTADO-DO-PROJETO.md`** — o que está implementado e verificado
- **`docs/RESOLUCAO-DE-PROBLEMAS.md`** — todos os erros já encontrados e como resolver
- **`docs/DESATIVAR-CONFIRMACAO-EMAIL.md`** — passo a passo (4 passos) para desligar a confirmação de e-mail e resolver o erro "email rate limit exceeded" ao criar conta
- **`CONFIGURACAO.md`** — onde achar as chaves do Supabase e preencher o `.env`
- **`ATUALIZAR-SUPABASE.md`** — ⬆️ como aplicar as mudanças novas no Supabase sem perder os dados já salvos
- **`docs/COMO-FUNCIONA.md`** — análise da arquitetura (nuvem vs P2P, papel do criador/host)
- **`docs/GUIA-DO-CRIADOR.md`** — passo a passo para você criar a sala e enviar o `.exe` ao amigo
- **`docs/GUIA-DO-AMIGO.md`** — o que o amigo precisa fazer (abrir o `.exe`, criar conta, entrar pelo código)
- **`docs/SELF-HOSTED.md`** — opção avançada: sua máquina como servidor de verdade (Docker/LAN/túnel)
- **`docs/GUIA-LINUX.md`** — 🐧 rodar ou gerar pacotes (`.AppImage`/`.deb`) no Ubuntu/Debian (use o `rodar-linux.sh`)

## Estrutura

```
src/
  main/        Processo principal do Electron
  preload/     Ponte de segurança (contextBridge)
  renderer/    Interface React (tema escuro estilo Discord)
    src/
      lib/     Cliente Supabase, API de dados, store global, tipos
      components/  Telas e componentes (login, servidores, chat, DMs…)
supabase/
  schema.sql   Script único: tabelas + RLS + realtime + funções
```

## Notas

- O app funciona com a conta gratuita do Supabase. Se o projeto crescer muito, dá para migrar para um plano pago ou subir o Supabase local com Docker.
- O `anon key` é público por design (as regras de segurança ficam no banco via RLS).
