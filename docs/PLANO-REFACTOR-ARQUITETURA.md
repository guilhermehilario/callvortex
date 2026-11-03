# PLANO-REFACTOR-ARQUITETURA

> **Versão:** 1.0 · **Data:** 2026-11-03 · **Branch de análise:** `fix/fixing-pnpm-electron`
> **Escopo desta rodada:** *apenas análise e planejamento*. Nenhum código-fonte foi alterado.
> Status: o refactoring abaixo é um plano para as próximas implementações, a ser executado em fases via `develop` (ver `CONTRIBUTING.md`).

---

## 1. Diagnóstico inicial

### 1.1 Visão geral do projeto

- Aplicação **Electron + React 19 + TypeScript** (chat/voz estilo Discord) com **Supabase** (Postgres + Realtime + Storage).
- Processos: `src/main` (Electron), `src/preload`, `src/renderer/src` (UI em React).
- Dados: schema completo em `supabase/schema.sql` (1134 linhas) + migrações pontuais em `supabase/migrations/`.
- Scripts SQL soltos em `supabase/` (`migration-*.sql`, `oracle-relay-setup.sh`) convivendo com o eclipe `sql` do schema.
- **Gerenciador de pacotes:** `pnpm` é o padrão oficial — docs, CI e husky já padronizados (Pré-fase 0 ✅); a migração completa ainda depende de validar a instalação no branch em andamento (ver §2.4).

### 1.2 Arquivos de código com mais de 280 linhas

Inventário completo (`wc -l`). Migrações Supabase **não são divididas** (arquivos imutáveis por natureza), mas ficam listadas para registro.

| # | Arquivo | Linhas | Natureza |
|---|---------|-------:|----------|
| 1 | `src/renderer/src/lib/voice.ts` | 1686 | God class (WebRTC + DSP + presença + tela) |
| 2 | `src/renderer/src/lib/useApp.tsx` | 1135 | God component (auth, roles, emojis, unread, invites, ping…) |
| 3 | `supabase/schema.sql` | 1134 | Schema monolítico com histórico de patches |
| 4 | `src/renderer/src/styles/voice.css` | 856 | CSS misturando 3 domínios visuais |
| 5 | `src/renderer/src/components/Modals.tsx` | 789 | 9-10 modais em um único arquivo |
| 6 | `src/renderer/src/lib/api.ts` | 742 | 8 domínios de API em módulo único |
| 7 | `src/renderer/src/lib/screenShare/manager.ts` | 575 | Orquestrador legítimo (aceitável, com fatias extraíveis) |
| 8 | `src/renderer/src/components/ChannelSidebar.tsx` | 521 | 3+ componentes no mesmo arquivo |
| 9 | `scripts/generate-stickers.mjs` | 468 | Dados (SVG) embutidos em código |
| 10 | `src/renderer/src/lib/useVoice.ts` | 466 | Hook com UI-state + persistência + reconexão |
| 11 | `src/renderer/src/components/ChatArea.tsx` | 453 | Chat + painel de emoji/sticker duplicado |
| 12 | `scripts/test-e2e-api.mjs` | 404 | Runner e2e monolítico |
| 13 | `supabase/tests/screen_share_rls_test.sql` | 386 | Migração/teste SQL — não dividir |
| 14 | `src/renderer/src/styles/screenshare.css` | 379 | CSS com 5 blocos temáticos |
| 15 | `src/renderer/src/components/MemberList.tsx` | 367 | UI ok; popover de papéis extraível |
| 16 | `src/renderer/src/styles/chat.css` | 335 | Limite aceitável (é dividida no plano) |
| 17 | `src/renderer/src/styles/modals.css` | 311 | Limite aceitável |
| 18 | `src/renderer/src/components/VoiceTroubleshooter.tsx` | 309 | UI + lógica de diagnóstico misturadas |
| 19 | `supabase/migrations/20260823120000_screen_share.sql` | 306 | Migração — imutável, não dividir |
| 20 | `supabase/migrations/20261028000000_roles.sql` | 304 | Migração — imutável, não dividir |
| 21 | `src/renderer/src/styles/sidebar.css` | 292 | Limite aceitável; extraível |

### 1.3 Plano de refatoração por arquivo

#### `lib/voice.ts` (1686) — prioridade ALTA

**Diagnóstico:** classe única `VoiceManager` com ao menos 7 responsabilidades: (1) captura/chain de DSP do microfone (`NOISE_WORKLET_SOURCE` de ~170 linhas, `buildNoiseReductionChain`, `sendGain`), (2) ciclo de vida de peers WebRTC + watchdogs/retries (`RetryScheduler`, `iceRestartAttempts`, `pcRetryAttempts`), (3) presença/roster (`broadcastPresenceInfo`, `rebuildPresenceInfo`, `syncPresenceRoster`), (4) publicação de tela (`publishScreenTrack`/`prepareScreenAnswer`/`tuneScreenSender` + mixagem de áudio do desktop), (5) stats/saúde de rede (`logPairStats`, `realtimeHealth`, `outageSince`), (6) dispositivos de áudio, (7) configuração (`ICE_SERVERS` com **fallback hardcoded para IPs 192.168.x.x e credenciais padrão**, ver §2.5).

**Proposta de divisão (`src/renderer/src/lib/voice/`):**

```
lib/voice/
├── config.ts         → ICE_SERVERS/TURN, limites/retries, constantes numéricas nomeadas
├── devices.ts        → getMicrophones/getOutputDevices/audioConstraints
├── noiseSuppressor.ts→ NOISE_WORKLET_SOURCE, getNoiseSuppressorModuleUrl, buildNoiseReductionChain
├── presence.ts       → roster/rebuild/broadcast de presença
├── peerWatchdog.ts   → retries, ice restarts, timeouts de ping (lógica pura, testável)
├── screenPublish.ts  → publicação/remoção de track de tela + mixagem de áudio desktop
└── index.ts (voice.ts) → VoiceManager como orquestrador (alvo ≈ 400–500 linhas)
```

**Estratégia:** *strangler* — extrair um módulo por PR, mantendo `voice.ts` reexportando os símbolos para não quebrar `useVoice.ts`/componentes até a última fase.

#### `lib/useApp.tsx` (1135) — prioridade ALTA

**Diagnóstico:** `AppProvider` acumula auth + deep-links + credenciais, navegação de telas, CRUD de servidores/canais, gestão de rostos/unread, emojis/stickers, convidados de voz, papéis (o bloco maior), ping de internet e wiring do realtime — ~140 campos expostos no contexto. Há `useEffect` de unread duplicado (reset por `screen` + `markChannelRead` sobrepõem-se).

**Proposta:** manter o contexto, mas extrair hooks de domínio no mesmo diretório:

```
lib/hooks/
├── useAuth.ts        → sessão, recovery, credenciais, deep-link
├── useNavigation.ts  → screens, seleção de servidor/canal/DM, auto-rejoin pós-reload
├── useServers.ts     → CRUD servidores/canais/convites de ingresso
├── useRoles.ts       → fetch/reset/aplicar papéis (bloco maior do arquivo)
├── useUnread.ts      → unread/notifications (elimina o useEffect duplicado)
├── useEmojiStickers.ts
├── useVoiceInvites.ts
└── useInternetPing.ts
```

`useApp.tsx` passa a apenas compor os hooks e montar o objeto de contexto; `app-types.ts` divide a interface em interfaces parciais por domínio (`AuthSlice`, `RolesSlice`, `UnreadSlice`…).

#### `lib/api.ts` (742) — prioridade ALTA

**Diagnóstico:** um módulo com auth, servidores, canais, mensagens, DMs, membros/papéis, storage (avatar/emoji/sticker) e sessões de voz; funções de erro (`err`/`friendlyError`) e regex de stickers acopladas junto.

**Proposta (`src/renderer/src/lib/api/`):** `auth.ts`, `servers.ts`, `channels.ts`, `messages.ts`, `dm.ts`, `roles.ts`, `storage.ts`, `errors.ts` + `index.ts` como *barrel* que mantém o mesmo namespace `api.*` — **nenhum import de componente precisa mudar** nessa fase.

#### `components/Modals.tsx` (789) — prioridade MÉDIA

**Diagnóstico:** 9-10 modais num único arquivo; validação de upload de arquivo (emoji/sticker/avatar) repetida 3× com magic numbers (`512 * 1024`, `2 * 1024 * 1024`, `MAX_*`).

**Proposta:** `components/modals/index.tsx` (switch) + um arquivo por modal; hook `useFileUploadInput` para a validação repetida; constantes `MAX_UPLOAD_*` em `lib/constants.ts`.

#### `components/ChannelSidebar.tsx` (521) — prioridade MÉDIA

**Diagnóstico:** contém Sidebar completo + `VoiceConnectedPanel` + seletor de dispositivos + listas. `formatActivity` duplicada de util de formatação.

**Proposta:** dividir em `Sidebar.tsx`, `VoiceConnectedPanel.tsx`, `UserPanel.tsx`, `VoiceChannelList.tsx`, `DmList.tsx` dentro de `components/sidebar/`; `formatActivity` → `lib/format.ts`.

#### `components/ChatArea.tsx` (453) — prioridade MÉDIA

**Diagnóstico:** lista de mensagens + input + painel emoji/sticker + subscription realtime. O bloco que compõe mensagens realtime existe duplicado para canal e DM (~80 linhas quase idênticas).

**Proposta:** hook `useChatMessages(channelKind)` + subcomponentes `MessageList`, `MessageInput`, `EmojiPanel`; helper único `normalizeIncomingMessage` cobrindo canal e DM; helpers de formatação (`renderContent`, `dayLabel`, `formatTime`) → `lib/messageFormat.tsx`.

#### `lib/useVoice.ts` (466) — prioridade MÉDIA

**Diagnóstico:** mistura estado de dispositivos, persistência de sessão, join/rejoin/leave e wiring do manager; caminhos `join`/`rejoin` duplicam lógica.

**Proposta:** extrair `useAudioDevices.ts` (mic/output prefs) e unificar join/rejoin em função interna única; alvo ≈ 250 linhas.

#### `lib/screenShare/manager.ts` (575) — prioridade BAIXA (já coeso)

Aceito acima de 280 por ser orquestrador de um domínio só. Extrações opcionais: heartbeat → `screenShare/heartbeat.ts`; mensagens de erro/suporte → constantes em `screenShare/support.ts`. Alvo ≈ 400 linhas.

#### `components/MemberList.tsx` (367) — prioridade BAIXA

Extraí `MemberRolesPopover` para arquivo próprio; agrupamento de membros → `lib/memberGroups.ts`. Opcional.

#### `components/VoiceTroubleshooter.tsx` (309) — prioridade BAIXA

Mover os checks de diagnóstico para `lib/diagnostics/voiceChecks.ts` (funções puras, testáveis); o componente fica só com a UI.

#### `scripts/generate-stickers.mjs` (468) — prioridade BAIXA

**Diagnóstico dados-como-código:** definições SVG embutidas em JS. Proposta: mover os grupos de sticker para `scripts/sticker-data/*.json` e manter o script como gerador fino.

#### `scripts/test-e2e-api.mjs` (404) — prioridade BAIXA

Runner e2e monolítico: dividir por domínio em `scripts/e2e/*.mjs` com um index que os executa. Só depois de validar os planos de maior prioridade.

#### CSS (`voice.css` 856, `screenshare.css` 379, demais ~300px)

- `voice.css`: seções marcadas por `/* === */` — dividir em `voice.css` (tela/sessão) + `voice-troubleshooter.css` (bloco `vts-*` a partir de ≈L708) + tiles de participante → `member-list.css`/`screenshare.css`.
- `screenshare.css`: 5 blocos (`check-*`, picker, palco, quick/fullscreen) → dividir picker e fullscreen.
- `chat.css`/`modals.css`/`sidebar.css`: no limite; dividir painel de sticker/seção de modal apenas quando as extrações de TS acontecerem.
- O gate de CI atual (`check:styles`) valida a integridade da extração semântica de CSS.

#### `supabase/schema.sql` (1134) — plano de dados (não é refactoring de código)

Schema "linha do tempo": bootstrap completo + camadas de patch para projetos já implantados. O histórico já existe espaçado em `migrations/`.

**Proposta (longo prazo, decisão apartada):** extrair a base atual para `supabase/schema/` (ex.: `01-core.sql`, `02-voice.sql`, `03-screen-share.sql`, `04-roles.sql`) apenas para instalações novas, mantendo `schema.sql` como documentação. Migrações CLI passam a ser a única fonte de evolução. **Não alterar nesta rodada.**

#### Branch `fix/fixing-pnpm-electron` (pré-refactor)

Antes de qualquer extração, concluir a migração pnpm e rebasar em `develop` (§2.4). Refactor em cima de um estado de gerenciador de dependências transicional aumentar o risco.

---

## 2. Código morto e inconsistências identificados

> **Importante:** nesta rodada nada disso foi removido (exceto o doc duplicado `CONTEXTO.md`, ver §2.6). Cada item abaixo é uma tarefa para os PRs de limpeza em `develop`.

### 2.1 Artefato de build rastreado no git

- `tsconfig.web.tsbuildinfo` está **commitado** (artefato incremental do compilador). Remover do índice (`git rm --cached`) + adicionar `*.tsbuildinfo` ao `.gitignore`.

### 2.2 Imports/variáveis mortas (para os PRs de clean code)

- `src/renderer/src/lib/useApp.tsx:22` — `MemberRole` importado e não usado.
- `src/renderer/src/components/Modals.tsx:5` — idem (`import { ... type MemberRole ... }`).
- (`tsc`/reference-check nestes arquivos confirmou que só aparecem na linha de import.)

### 2.3 Scripts/utilitários sem referência (candidatos — confirmar antes de remover)

Nenhum script abaixo é referenciado em `package.json`, docs ou workflow de CI (`release.yml`):

- `scripts/generate-icon.js`
- `scripts/generate-logo.js`
- `scripts/generate_pack_stickers.py` e `scripts/import_pack_stickers.py`
- `scripts/patch-electron-dev.mjs`
- `scripts/test-connectivity.mjs`
- `scripts/oracle-relay-setup.sh`
- `scripts/backup-db/*.py`, `scripts/backup-storage/*.py`

**Ação recomendada:** remover em um PR de limpeza, após aprovação do autor — podem ser utilitários de uso pontual.

### 2.4 Deriva de gerenciador de pacote (yarn → pnpm) — RESOLVIDO na Pré-fase 0

- **Feito:** todos os `.md` (README + `docs/`) usam comandos `pnpm`; `release.yml` instala/roda com pnpm; `.husky/pre-commit` roda `pnpm check:styles`.
- **Pendência operacional:** validar `pnpm install` e build no branch `fix/fixing-pnpm-electron` e portar para `develop` antes das fases de refactor.

### 2.5 Configurações sensíveis/hardcoded

- `voice.ts` `TURN_URLS`/`ICE_SERVERS`: fallback com IPs de rede local e `username: 'cvturn'`, `credential: 'cvpass2026'` em código. **Ação:** mover 100% para `.env` (o `.env.example` já lista os nomes) e manter no código apenas constantes nomeadas; registrar `cvpass2026` como credencial comprometida (rotação no TURN).
- Repetição de números mágicos de upload (`512 * 1024` etc.) em Modals — virar constantes na extração.

### 2.6 Documentação

- **Removido nesta rodada:** `CONTEXTO.md` (v0.2.2) — conteúdo duplicado e desatualizado em relação a `CONTEXTO_PROJETO_PARA_IA.md` (v0.2.5).
- `README.md` aponta para `docs/*.md` que não existem no repo (a pasta `docs` está listada como padrão de ignore do git), quebrando todos os links.
- **Resolvido:** o padrão `docs` do `.gitignore` foi removido e toda a documentação de apoio vive em `docs/` (`README.md` e `CONTRIBUTING.md` permanecem na raiz, por convenção).
- `CONTEXTO_PROJETO_PARA_IA.md` menciona arquivos de migração SQL soltos em raiz (`migration-*.sql`) que hoje vivem em `supabase/`; ao escriturar mais tarde, ajustar.

---

## 3. Proposta de nova estrutura de diretórios

Alvo: **feature-first dentro do renderer, camadas explícitas, zero mudança nos processos Electron main/preload.** A migração é *gradual*: cada pasta nova nasce com um barrel compatível com o import antigo, para trocar de lado só nas fases posteriores.

```
callvortex/
├── src/
│   ├── main/                     # (inalterado) main Electron: janela, IPC, single-instance
│   ├── preload/                  # (inalterado) bridge via contextIsolation
│   └── renderer/src/
│       ├── app/                  # montagem da aplicação
│       │   ├── App.tsx
│       │   ├── useApp.tsx        # contexto: compõe os hooks por domínio
│       │   └── app-types.ts
│       ├── lib/                  # ═ Camada de DOMÍNIO/Negócio ═
│       │   ├── voice/            # voice.ts (God class) refatorado
│       │   │   ├── index.ts      # VoiceManager orquestrador
│       │   │   ├── config.ts
│       │   │   ├── devices.ts
│       │   │   ├── noiseSuppressor.ts
│       │   │   ├── presence.ts
│       │   │   ├── peerWatchdog.ts
│       │   │   └── screenPublish.ts
│       │   ├── useVoice.ts
│       │   ├── hooks/            # extrações de useApp (auth, roles, unread…)
│       │   ├── roles.ts
│       │   ├── settings.ts
│       │   ├── format.ts
│       │   ├── messageFormat.tsx
│       │   ├── sounds.ts
│       │   ├── internet.ts
│       │   ├── invites.ts
│       │   ├── diagnostics/      # checks puros do VoiceTroubleshooter
│       │   ├── constants.ts      # MAX_UPLOAD_*, limites, números mágicos
│       │   └── types/            # types.ts, app-types.ts (slices/parciais)
│       ├── infra/                # ═ Camada de INFRA (acesso a dados/serviços) ═
│       │   ├── api/              # api.ts refatorado: auth, servers, channels,
│       │   │                     # messages, dm, roles, storage, errors, index(barrel)
│       │   ├── supabase.ts
│       │   ├── realtime.ts
│       │   └── connection.ts
│       ├── features/             # ═ Camada de UI por FEATURE ═
│       │   ├── auth/             # AuthScreen, ResetPasswordScreen
│       │   ├── sidebar/          # ChannelSidebar → Sidebar/VoiceConnectedPanel/UserPanel/DmList
│       │   ├── chat/             # ChatArea → MessageList/MessageInput/EmojiPanel
│       │   ├── voice/            # VoiceChannelScreen, ParticipantTiles, VoiceInvitePopups,
│       │   │                     # VoiceTroubleshooter, Mic/OutputPickers
│       │   ├── screen-share/     # Picker, Stage, ScreenShareButton (screenShare hoje)
│       │   ├── members/          # MemberList, MemberRow, MemberRolesPopover
│       │   ├── servers/          # ServerRail (rail/destaques)
│       │   └── modals/           # index + um arquivo por modal
│       ├── components/           # primitivas compartilhadas (Icons, Logo, ProfilePhoto)
│       ├── styles/               # CSS por feature (staged: voice.css → voice-troubleshooter.css…)
│       └── assets/
├── supabase/
│   ├── schema.sql                # hoje; futuro schema/ (01-core.sql…) p/ instâncias novas
│   ├── migrations/               # fonte única de evolução a médio prazo
│   └── tests/
├── scripts/                      # generators (sticker-data via JSON), e2e/ por domínio
├── docs/                         # (se aprovado retirar do .gitignore) docs do projeto
└── [docs na raiz: README, CONFIGURACAO, PLANO-REFACTOR-ARQUITETURA, CONTRIBUTING…]
```

**Justificativa:**

1. **features/** substitui a lista plana atual de `components/` — cada dono de funcionalidade encontra tudo (TS + CSS + helpers) num só lugar; o custo de onboarding por feature cai (time pequeno + contribuintes novos).
2. **infra/** separa o que fala com Supabase/storage do que calcula; isto permite substituir/migrar transporte (ex.: Realtime → relay) com impacto contido.
3. **lib/voice/** resolve a maior dívida técnica (1686 linhas) sem tocar electron main/preload, que já está ok.
4. **hooks/** transforma o contexto em composição de hooks menores — cada hook testável isolado, e `useApp.tsx` de ~1135 → ~300 linhas.
5. Migração **barrel-first**: cada pasta nova expõe os mesmos nomes do caminho antigo; imports de components só quebram quando efetivamente movidos, um por PR.

---

## 4. Plano de execução passo a passo (sem quebrar o projeto)

**Regras gerais (valem para toda fase):**

- Um PR = um objetivo; nada de refactor misturado. Commits Conventional (ver `CONTRIBUTING.md`).
- Gates por PR: `pnpm typecheck` + build (`pnpm build`) + `vite build` de renderer + manual smoke (login → voz → tela) + lint `check:styles` (husky).
- Refactor **só** mover código; correção de comportamento entra em PR separado em cima.
- Base de trabalho sempre `develop` (nunca direto em `main`/`homologacao`).

- **Pré-fase 0 — Estabilizar o chão (✅ docs/CI/husky feitos):** padronização pnpm aplicada em README/docs, `release.yml` e husky; pasta `docs/` liberada no `.gitignore` e docs movidos. **Falta:** concluir a migração pnpm na branch atual → PR `develop`; `git rm --cached tsconfig.web.tsbuildinfo` + gitignore (*sem tocar em código-folha*).

**Fase 1 — Barrel e módulos pure-leaf (baixo risco):** extrair `api/` (%) errors + constantes; extrair `format.ts`/`messageFormat.tsx`; remover imports mortos (§2.2); PR pequenos `refactor:`.

**Fase 2 — voice.ts strangler (5 PRs, nesta ordem):** config → devices+noiseSuppressor → peerWatchdog → presence → screenPublish. Cada PR deixa `voice.ts` menor e reexporta símbolos; ao fim, `index.ts` ≈ 400-500 linhas.

**Fase 3 — Split de useApp:** criar hooks na ordem: `useAuth` → `useUnread` (corrigindo duplicação) → `useRoles` → `useEmojiStickers` → o restante. Contexto passa a compor; `app-types.ts` semântico por slice.

**Fase 4 — Split de componentes:** ChannelSidebar → ChatArea → modals → members; sempre 1 subcomponente por PR, fáceis de revisar.

**Fase 5 — CSS:** divisões de `voice.css`/`screenshare.css` em arquivos por domínio; o lint `check:styles` garante a integridade da divisão.

**Fase 6 — Qualidade/limpeza:** dead code de §2.3 (um PR só para exclusões, com justificativa por arquivo); substituição de números mágicos; sanitizar `ICE_SERVERS` (env-only).

**Fase 7 — Dados/CI (opcional, decisão coletiva):** estrutura de `supabase/schema/` para novas bases; runner e2e modularizado; atualização de `MODEL.md`/`CONTEXTO_PROJETO_PARA_IA.md` referências.

**Critério de "acabado" ao final:** nenhum arquivo de código acima de ~500 linhas, exceto os orquestradores declarados (`lib/voice/index.ts` e `screenShare/manager.ts`); typecheck, build e smoke-test verdes em `develop` a cada PR.

---

## 5. Pendências de decisão (não definidas por esta análise)

1. `.gitignore`/pasta `docs` — manter docs na raiz (feito) ou liberar `docs/` no repositório.
2. Padrão do package manager final (pnpm assumido como alvo na Pré-fase 0; requer confirmar).
3. Remoção dos scripts listados em §2.3 (requer aprovação de quem escreveu).
4. Rotação/desativação da credencial TURN hardcoded (segurança, ação fora do repo).
5. `supabase/schema/` e fluxo de migrações — planejado na Fase 7, sob consulta à equipe backend.
