# CONTRIBUTING — Guia de Branches & Fluxo de Trabalho

> Padrão de contribuição para o time CallVortex. Vale para qualquer contribuição: feature, correção, refactor ou doc.

## 1. Estrutura de branches (Gitflow simplificado)

| Branch | Papel | Recebe mudanças de |
|--------|-------|--------------------|
| `main` | **Produção.** Código 100% estável, testado, publicável (tag de release). | Apenas PR de `homologacao` |
| `homologacao` | **Staging/QA.** Validação pré-produção; ambiente de homologação apontado aqui. | Apenas PR de `develop` |
| `develop` | **Integração do dia a dia.** Base para todas as `feature/*`, `fix/*` e `refactor/*`. | PR das branches de trabalho |

**Regra de ouro:** ninguém commita diretamente em `main`, `homologacao` ou `develop`. Toda mudança entra por Pull Request na cadeia `feature → develop → homologacao → main`.

```
main        ────●───────────────●─────▶   (só merges de homologacao, tags de release)
                 ▲               ▲
homologacao  ──●────●◄── merge ───┘      (só merges de develop, validado em QA)
               ▲    │
develop     ───●──●─────●──────▶          (PRs de feature/fix/refactor)
                │  │     │
feature/x ──────┘  │     │
fix/y ─────────────┘     │
refactor/z ──────────────┘
```

### Nomenclatura

- `feature/<assunto-curto>` — nova funcionalidade (ex.: `feature/tela-compartilhamento-fullscreen`)
- `fix/<assunto-curto>` — correção de bug (ex.: `fix/voz-reconnect-loop`)
- `refactor/<assunto-curto>` — rearranjo sem mudança de comportamento (ex.: `refactor/split-voice-manager`)
- `hotfix/<assunto>` — **exceção:** correção urgente de produção. Sai de `main`, corrige, entra em PR para `main` **e** é portada para `develop` (ou merge de `main` → `develop`) para não divergir.
- `docs/<assunto>` — apenas documentação.

Branches a partir de `develop` (exceto `hotfix`, que parte de `main`).

## 2. Fluxo passo a passo

```bash
git checkout develop && git pull origin develop
git checkout -b feature/minha-funcionalidade

# ... trabalho em Commits pequenos e atômicos ...
git push -u origin feature/minha-funcionalidade
```

1. Abra o PR com destino a **`develop`** (não para `main`).
2. Título do PR segue Conventional Commits (§4): `feat: ...`, `fix: ...`.
3. Descrição: o que muda, por que, como testar (passos de smoke), e quaisquer screenshots/gif quando for UI.
4. Checklist obrigatório antes de pedir review:
   - `pnpm typecheck` sem erros
   - build local (`pnpm build`) ou `pnpm dev` exercita o fluxo alterado
   - `check:styles` passando (roda no pre-commit)
   - smoke manual: login → voz → compartilhar tela, quando aplicável
5. 1+ review de outro mantedor; CI verde; então **squash ou merge** em `develop` (manter histórico linear).
6. Quando um conjunto de features está pronto para QA: PR de **`develop` → `homologacao`**; validar em ambiente de homologação.
7. Release: PR de **`homologacao` → `main`** + tag (`vX.Y.Z`). A publicação usa o workflow de release existente (`.github/workflows/release.yml`).
8. Toda branch de trabalho é apagada após o merge.

**Conflitos com `develop` andando:** rebasar a branch de trabalho sobre `develop` (evite merge-backs) antes de reabrir o PR.

## 3. Regras de proteção de branch (Branch Protection Rules — GitHub)

Configurar em *Settings → Branches → Add rule*:

**`main`:**
- `Require a pull request before merging` ✅
- Required approvals: **1** (2 em releases maiores)
- `Require review from Code Owners` ✅ (manter um `CODEOWNERS` simples)
- Dismiss stale approvals on new commits ✅
- `Require status checks`: CI de build + release dry-run ✅
- `Require conversation resolution before merging` ✅
- `Restrict pushes that create matching branches` — sem force push 🚫, sem delete 🚫
- `Require linear history` ✅ (sem merge commits encadeados)

**`homologacao`:** idem `main`, com 1 approval e checks de build. `Restrict pushes` para admins/tim de QA.

**`develop`:**
- Require PR ✅ com 1 approval;CI de typecheck/build ✅; force push 🚫.
- (Fluxo mais permissivo por ser integração do dia a dia; ainda assim nunca push direto.)

**Hotfix divergente:** após merge de um `hotfix/*` em `main`, porte a mesma correção para `develop` (merge de `main` → `develop` ou PR cherry-picked) para evitar divergência das bases.

## 4. Conventional Commits

Formato: `<tipo>(escopo opcional): descrição imperativa curta` — sem ponto final.

| Tipo | Uso | Exemplo |
|------|-----|---------|
| `feat` | Nova funcionalidade (público visível) | `feat(voice): mute automático ao entrar em outro canal` |
| `fix` | Correção de bug | `fix(screenshare): parar heartbeat ao encerrar sessão` |
| `refactor` | Mudança estrutural sem alterar comportamento | `refactor(api): dividir api.ts por domínio` |
| `perf` | Ganho de performance | `perf(chat): virtualizar lista de mensagens` |
| `docs` | Documentação | `docs: adicionar PLANO-REFACTOR-ARQUITETURA` |
| `style` | Formatação, sem mudança de código/semântica | `style: padronizar aspas simples` |
| `test` | Adicionar/corrigir testes | `test(e2e): suíte de auth` |
| `chore` | Build, deps, CI, scripts | `chore(deps): migrar yarn → pnpm` |
| `ci` | Pipelines | `ci(release): trocar yarn por pnpm` |

Escopos sugeridos: `voice`, `screenshare`, `chat`, `sidebar`, `members`, `srv`(servidores), `api`, `auth`, `ipc`(main/preload), `ui`, `db`(supabase).

**Escopo de breaking change:** `!` no tipo (`feat!:`) ou rodapé `BREAKING CHANGE: <descrição>`; exige menção explícita no PR.

> O repo não valida automaticamente o formato de commit hoje — a verificação é do reviewer (e pode um dia virar hook `commit-msg`; não é requerido na fase atual).

## 5. Cuidados especiais neste repo

- **Refactors grandes** (fases do `docs/PLANO-REFACTOR-ARQUITETURA.md`) sempre em `refactor/*` saindo de `develop`, um objetivo por PR, gates de smoke por fase.
- **Schema Supabase:** qualquer mudança em `supabase/` vem com arquivo datado em `supabase/migrations/` (nunca editar migração antiga) e trava de compatibilidade com `schema.sql`.
- **Segurança:** nunca commitar `.env`, credenciais TURN/Supabase; qualquer scheduler IP/senha hardcoded é considerado bug de segurança, não estilo.
- **Build artifacts:** não commitar `*.tsbuildinfo`, `out/`, `dist/` etc.
