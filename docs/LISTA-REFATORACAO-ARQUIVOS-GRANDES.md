# LISTA DE REFACTOR — ARQUIVOS MUITO GRANDES (backlog executável)

> Complemento operacional de `docs/PLANO-REFACTOR-ARQUITETURA.md` (§1.2 inventário, §1.3 diagnóstico por arquivo, §4 fases).
> Este arquivo é a **lista de controle**: um item = um PR. Marque o status conforme executa.
> Inventário medido com `wc -l` em `src/` em 03/11/2026 (branch `fix/fixing-pnpm-electron`).

## Regras de execução

1. **Um item = um PR** de objetivo único (`refactor:`), base sempre em `develop`.
2. Gates por item: `pnpm typecheck` + `pnpm build` + smoke manual (login → voz → tela).
3. Apenas mover código; correções de comportamento entram em PR separado depois.
4. Fluxos de migração Supabase **não são divididos** (imutáveis).

## Scorecard geral

| Prioridade | Arquivo | Linhas | Alvo | Fase | Status |
|-----------|---------|-------:|------|------|--------|
| 🔴 ALTA | `src/renderer/src/lib/voice.ts` | 1686 | ~400–500 | 2 | ☐ pendente |
| 🔴 ALTA | `src/renderer/src/lib/useApp.tsx` | 1135 | ~300 | 3 | ☐ pendente |
| 🔴 ALTA | `src/renderer/src/lib/api.ts` | 742 | ~250 | 1 | ☐ pendente |
| 🟡 MÉDIA | `src/renderer/src/components/Modals.tsx` | 789 | alvo por modal | 4 | ☐ pendente |
| 🟡 MÉDIA | `src/renderer/src/components/ChannelSidebar.tsx` | 521 | alvo por bloco | 4 | ☐ pendente |
| 🟡 MÉDIA | `src/renderer/src/components/ChatArea.tsx` | 453 | ~280 | 4 | ☐ pendente |
| 🟡 MÉDIA | `src/renderer/src/lib/useVoice.ts` | 466 | ~250 | 3 | ☐ pendente |
| 🟢 BAIXA | `src/renderer/src/styles/voice.css` | 856 | dividir por domínio | 5 | ☐ pendente |
| 🟢 BAIXA | `src/renderer/src/styles/screenshare.css` | 379 | 5 arquivos | 5 | ☐ pendente |
| 🟢 BAIXA | `src/renderer/src/components/MemberList.tsx` | 367 | ~250 | 4 | ☐ pendente |
| 🟢 BAIXA | `src/renderer/src/components/VoiceTroubleshooter.tsx` | 309 | UI vs lógica | 4 | ☐ pendente |
| 🟢 BAIXA | `src/renderer/src/styles/chat.css` | 335 | extração leve | 5 | ☐ pendente |
| 🟢 BAIXA | `src/renderer/src/styles/modals.css` | 311 | aceitável / extraível | 5 | ☐ pendente |
| 🟢 BAIXA | `src/renderer/src/styles/sidebar.css` | 292 | aceitável / extraível | 5 | ☐ pendente |
| Aceito | `src/renderer/src/lib/screenShare/manager.ts` | 575 | ~400 (extrações opcionais) | 6 | ☐ pendente |
| Não dividir | `scripts/generate-stickers.mjs` | 468 | mover dados p/ asset/json | 6 | ☐ pendente |
| Não dividir | `scripts/test-e2e-api.mjs` | 404 | modularizar runner | 7 | ☐ pendente |
| Não dividir | `supabase/schema.sql` | 1134 | plano de dados (§ da fase 7) | 7 | ☐ pendente |
| Não dividir | `supabase/migrations/*` (2 > 300) | 306/304 | — | — | excluídos por natureza |
| Não dividir | `supabase/tests/screen_share_rls_test.sql` | 386 | — | — | excluídos por natureza |

---

## Pré-fase 0 — estabilizar o chão (antecessor de tudo)

- [ ] `pnpm install` validado na branch `fix/fixing-pnpm-electron` (lockfile verde)
- [ ] Portar padronização pnpm + docs/ para `develop`
- [ ] `git rm --cached tsconfig.web.tsbuildinfo` + entrada no `.gitignore`

## Fase 1 — módulos folha de `api.ts` (baixo risco)

- [ ] Criar `lib/api/errors.ts` + constantes compartilhadas; `api.ts` reexporta
- [ ] Split dos 8 domínios em `lib/api/*.ts` (auth, channels, messages, members, roles, invites, stickers, realtime helpers) — 1 domínio por PR
- [ ] Remover imports/variáveis mortas mapeados no §2.2 do plano (PR próprio de limpeza)

## Fase 2 — `voice.ts` strangler (1686 → ~400–500)

Ordem fixa dos PRs (cada um deixa `voice.ts` menor e reexporta símbolos):

- [ ] 2.1 Extrair `lib/voice/config.ts` (ICE_SERVERS env-only, constantes)
- [ ] 2.2 Extrair `lib/voice/devices.ts` + `lib/voice/noiseSuppressor.ts` (worklet DSP ~170 linhas)
- [ ] 2.3 Extrair `lib/voice/peerWatchdog.ts` (RetryScheduler, retries de ICE/pc)
- [ ] 2.4 Extrair `lib/voice/presence.ts` (roster, broadcast, sync de presença)
- [ ] 2.5 Extrair `lib/voice/screenPublish.ts` (publicação de tela + mixagem)
- [ ] 2.6 `voice.ts` vira `lib/voice/index.ts` orquestrador

## Fase 3 — split do `useApp.tsx` (1135 → ~300)

Ordem fixa dos hooks extraídos:

- [ ] 3.1 `hooks/useAuth.ts` (login/registro/sessão/reset)
- [ ] 3.2 `hooks/useUnread.ts` (corrigindo duplicação de lógica apontada no plano)
- [ ] 3.3 `hooks/useRoles.ts`
- [ ] 3.4 `hooks/useEmojiStickers.ts`
- [ ] 3.5 Hooks restantes (invites/ping) até o contexto só compor

## Fase 4 — split de componentes (1 subcomponente por PR)

- [ ] 4.1 `ChannelSidebar.tsx` (521, 3+ componentes no arquivo) → arquivos por bloco
- [ ] 4.2 `Modals.tsx` (789, 9–10 modais) → `components/modals/` com um arquivo por modal
- [ ] 4.3 `ChatArea.tsx` (453) → unificar bloco realtime duplicado canal/DM + `chatMessage.tsx`
- [ ] 4.4 `MemberList.tsx` (367) → extrair popover de papéis
- [ ] 4.5 `VoiceTroubleshooter.tsx` (309) → separar lógica de diagnóstico da UI
- [ ] 4.6 `useVoice.ts` (466) → `hooks/useAudioDevices.ts` + unificar join/rejoin

## Fase 5 — CSS (mantém integridade via `check:styles`)

- [ ] 5.1 `voice.css` (856) → dividir por domínio visual (tiles/participants, troubleshooter/assistente, painéis)
- [ ] 5.2 `screenshare.css` (379) → 5 blocos temáticos em arquivos separados
- [ ] 5.3 `chat.css` (335) + `modals.css` (311) + `sidebar.css` (292) → extrações leves (aceitáveis pós-fase)

## Fase 6 — limpeza declarada

- [ ] 6.1 `screenShare/manager.ts` → `heartbeat.ts` + `support.ts` (opcional, alvo ~400)
- [ ] 6.2 `generate-stickers.mjs` → mover SVG embutido para asset/json (PR de script)
- [ ] 6.3 Remoções de dead code do §2.3 (um PR só de exclusões, justificativa por arquivo)
- [ ] 6.4 `ICE_SERVERS`: remover fallback hardcoded de IPs (§2.5 do plano)

## Fase 7 — dados/CI (opcional, decisão coletiva)

- [ ] 7.1 Estrutura `supabase/schema/` para novas bases (migrações existentes ficam imutáveis)
- [ ] 7.2 Modularizar `test-e2e-api.mjs`
- [ ] 7.3 Atualizar `docs/` (contexto IA) após os movimentos de arquivos

---

## Checklist de "acabado"

- [ ] Nenhum arquivo de código acima de ~500 linhas, exceto orquestradores declarados (`lib/voice/index.ts`, `screenShare/manager.ts`)
- [ ] Typecheck + build + smoke verdes em `develop` em todos os PRs
- [ ] Plano e esta lista sincronizados (status final re-avaliado com `wc -l`)
