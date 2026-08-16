# 👑 Guia do Criador — passo a passo

Você é o **criador da sala** (quem hospeda/controla o servidor). Este guia
mostra exatamente o que fazer, em ordem, para você e seu amigo usarem o app —
com você criando o servidor e o amigo entrando nele.

---

## Parte 1 — Preparação (uma única vez)

### 1.1 Deixe o `.env` com as chaves reais
Leia o **`CONFIGURACAO.md`** (na raiz do projeto) para saber onde achar o
*Project URL* e a *publishable/anon key* no painel do Supabase, e preencha o
arquivo `.env`:

```
VITE_SUPABASE_URL=https://SEU-REFERENCIAL.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-longa-aqui
```

### 1.2 Crie as tabelas no banco (uma única vez)
No painel do Supabase → **SQL Editor** → rode o conteúdo de
`supabase/schema.sql` (e as migrações, se já tiver rodado antes).

### 1.3 Teste localmente
```bash
npm run dev
```
- Crie sua conta (e-mail + senha + username).
- Crie um servidor de teste (botão **＋** na barra de servidores).
- Anote o **código de convite** que aparece na notificação (ex: `ABC123`).

> Se tudo abrir e funcionar, sua preparação está pronta. Feche o app.

---

## Parte 2 — Gerar o `.exe` para o amigo

```bash
npm run dist
```

O arquivo sai em **`release/Discord Clone 0.1.2.exe`** — é o modo **portátil**:
um único `.exe` que roda sem instalar nada. Basta mandar esse arquivo.

> ⚠️ **Importante:** o `.exe` grava as chaves do Supabase **dentro dele** no
> momento do build. Sempre que você mudar o `.env`, rode `npm run dist` de novo
> para gerar um `.exe` novo. (Os `.exe` que já existem na pasta `release/` são
> antigos e ainda estão sem as chaves corretas — não envie esses!)

**Envie o `.exe` para o amigo** por WhatsApp, Drive, e-mail, etc.

### Se o Windows bloquear o `.exe` (Smart App Control)

O Windows 11 pode bloquear apps sem assinatura digital com o **Smart App
Control**. Sintoma: ao abrir, aparece "Uma política de Controle de Aplicativo
bloqueou este arquivo" ou o app simplesmente não abre.

Se acontecer na **sua máquina**:
1. Abra o **Windows Security** → **App & browser control**.
2. Em **Smart App Control settings**, escolha **Off**.
   - ⚠️ Aviso da Microsoft: desligar o Smart App Control é **permanente** nesta
     instalação do Windows (não dá para religar sem reinstalar).
3. Tente abrir o `.exe` de novo.

> O `npm run dev` funciona mesmo com o Smart App Control ligado (o executável
> do Electron é assinado oficialmente) — o bloqueio só atinge o `.exe` que
> nós geramos. O seu amigo provavelmente nem vai ter esse problema (o Smart
> App Control vem desligado na maioria dos PCs).

---

## Parte 3 — Combinar o "encontro"

Combinem quem faz o quê:

1. Peça para o amigo seguir o **`GUIA-DO-AMIGO.md`** (ou você mesmo explica os
   3 passos: instalar → criar conta → pedir o código de convite).
2. Quando o amigo tiver conta criada, peça o **username** dele (para DM) ou
   mande para ele o **código de convite** do seu servidor.

---

## Parte 4 — Criar a sala e conversar

### 4.1 Criar o servidor (sala)
1. Abra o app → barra esquerda → botão **＋** → **Criar servidor**.
2. Dê um nome (ex: "Sala do Guilherme").
3. Copie o código de convite: clique no nome do servidor (topo da sidebar) →
   **Copiar convite** → envie para o amigo.
4. O amigo usa: **＋** → **Entrar em servidor (código)** → cola o código.

### 4.2 Criar o canal de voz (a "sala de chamada")
1. No menu do servidor → **Criar canal** → escolha **Voz** → nome (ex: "Sala").
2. Quando for conversar: **clique no canal de voz** para entrar (aparece o
   indicador verde ●).
3. Peça para o amigo clicar no mesmo canal de voz.

> O áudio é ponto a ponto (WebRTC). Na mesma rede Wi-Fi funciona direto; em
> redes diferentes pode precisar de TURN em casos de NAT restrito (ver
> `COMO-FUNCIONA.md`, seção 5).

### 4.3 (Opcional) Mensagem direta 1:1
- Botão **💬** (Mensagens diretas) → **＋** → busque o username do amigo →
  clique. Conversa privada criada.

---

## Checklist final

- [ ] `.env` com chaves reais (sem "placeholder")
- [ ] `supabase/schema.sql` rodado no SQL Editor
- [ ] `npm run dist` rodado **depois** do `.env` correto
- [ ] `.exe` novo (`release/Discord Clone 0.1.2.exe`) enviado ao amigo
- [ ] (Se bloqueado) Smart App Control desligado no Windows Security
- [ ] Amigo criou conta
- [ ] Amigo entrou no servidor pelo código de convite
- [ ] Canal de voz criado e ambos dentro → áudio funcionando (já inclui STUN + TURN público)
