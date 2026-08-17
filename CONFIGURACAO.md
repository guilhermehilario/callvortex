# ⚙️ Configuração do Supabase — CallVortex

Este guia explica **onde encontrar** os valores das variáveis do arquivo `.env`
(`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`) e como deixar o app pronto.

---

## 1. Onde encontrar os valores no Supabase

1. Acesse **https://supabase.com** e faça login.
2. Na tela inicial, **clique no seu projeto** para abrir o painel dele.
3. No **menu lateral esquerdo**, role até o fim e clique em **⚙️ Settings** (engrenagem).
4. No submenu que abrir, clique em **API Keys**.

Nessa tela estão as **duas coisas** que você precisa:

| O que copiar | Onde está na tela | Vai para |
|---|---|---|
| **Project URL** | No topo da página. Ex.: `https://abcdefghijklm.supabase.co` | `VITE_SUPABASE_URL` |
| **Publishable key** ou **anon key** | Aba **"Publishable and secret API keys"** → seção **Publishable key** (`sb_publishable_...`). Se não aparecer, abra a aba **"Legacy API Keys"** e copie a **anon key** (`eyJhbGciOi...`) | `VITE_SUPABASE_ANON_KEY` |

> ⚠️ Use sempre a **publishable** ou a **anon** key — **nunca** a *secret key*
> nem a *service_role key* (elas dão acesso total ao banco e não devem sair do painel).

**Atalho alternativo:** no painel do projeto, clique no botão **Connect**
(canto superior direito) — abre uma janela com o Project URL e as chaves
prontas para copiar.

---

## 2. Preenchendo o arquivo `.env`

Crie um arquivo chamado **`.env`** na raiz do projeto
(`C:\Users\seu-usuario\Documents\Projetos\discord-clone\.env`)
com o conteúdo abaixo, substituindo pelos valores copiados:

```
VITE_SUPABASE_URL=https://SEU-REFERENCIAL.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-copiada-aqui
```

- O `.env` **não vai para o git** (está no `.gitignore`).
- Em desenvolvimento (`npm run dev`), o app lê esse arquivo a cada execução.
- **Se você usa o instalador `.exe`** (da pasta `release/`), as chaves ficam
  gravadas dentro do executável no momento do build. Nesse caso, depois de
  corrigir o `.env`, rode `npm run dist` de novo para gerar um `.exe` novo.

> 🔎 Uma chave **anon/publishable real** tem ~200 caracteres ou mais (formato
> `eyJ...` ou `sb_publishable_...`). Se a sua chave tem 48 caracteres ou a URL
> contém `placeholder`, os valores ainda são de teste.

---

## 3. Criando as tabelas no banco (obrigatório)

Com o `.env` preenchido, rode os SQLs no painel do Supabase:

1. No painel do projeto, menu lateral: **SQL Editor → New query**.
2. Abra o arquivo **`supabase/schema.sql`** deste projeto, copie o conteúdo
   inteiro, cole no editor e clique em **Run**.
3. Se já tiver rodado o `schema.sql` antes (versão antiga), rode também, na
   ordem:
   - `supabase/migration-avatars-emojis.sql` (foto de perfil + emojis)
   - `supabase/migration-voice.sql` (canais de voz)

---

## 4. Rodando o app

```bash
npm install      # só na primeira vez
npm run dev      # abre o app em modo desenvolvimento
```

Para gerar o instalador para os amigos:

```bash
npm run dist     # gera o .exe na pasta release/
```

---

## Resumo visual

```
Supabase (navegador)                    Arquivo .env (pasta do projeto)
─────────────────────                    ─────────────────────────────
Settings → API Keys
  ├─ Project URL     ──────────────────► VITE_SUPABASE_URL
  └─ Publishable/anon key ─────────────► VITE_SUPABASE_ANON_KEY
```
