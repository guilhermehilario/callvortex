# 🐧 Rodar no Ubuntu / Debian (Linux)

O app é um **Electron** e roda normalmente no Linux. Duas formas de usar:

| Forma | Para quem | Precisa de Node.js? |
|---|---|---|
| **A — Rodar direto** (dev) | Você mesmo testar no Linux | Sim (o script instala) |
| **B — Gerar pacotes** (`.AppImage` / `.deb`) | Distribuir para outros usuários Linux, como o `.exe` | Sim (só na máquina que gera) |

> ⚠️ **Importante:** os pacotes Linux **só podem ser gerados numa máquina Linux**
> (AppImage e `.deb` não podem ser compilados no Windows). Por isso o passo B
> é feito no próprio Ubuntu/Debian — uma única vez, na máquina que for
> distribuir.

---

## O que precisa antes (qualquer forma)

1. **As chaves do Supabase** — o Linux usa o **mesmo projeto** do seu Windows
   (contas, mensagens e sala são compartilhadas). Copie as chaves de
   `Project Settings → API` do painel (veja `CONFIGURACAO.md`).
2. **Internet** para o `npm install` na primeira vez.
3. **O projeto na máquina Linux** — copie a pasta `discord-clone` inteira
   (ou um `.zip` dela), incluindo o `rodar-linux.sh`.

---

## Forma A — Rodar direto (mais simples)

No terminal, dentro da pasta do projeto:

```bash
chmod +x rodar-linux.sh
./rodar-linux.sh
```

O script:
1. Verifica o sistema (Ubuntu/Debian).
2. Instala **Node.js 20** se não tiver (pede sua senha do `sudo`).
3. Roda `npm install`.
4. Cria o `.env` a partir do `.env.example` se não existir (preencha as chaves).
5. Abre o app (modo dev).

> Para sair: `Ctrl+C`.

---

## Forma B — Gerar pacotes para distribuir (.AppImage / .deb)

Na máquina **Linux** (qualquer uma — a sua ou a de outro amigo):

```bash
chmod +x rodar-linux.sh
./rodar-linux.sh dist
```

O script instala as dependências, roda o build e gera em `release/`:

| Arquivo | O que é | Como instalar/rodar |
|---|---|---|
| `Discord Clone-0.1.2.AppImage` | **Portátil** (não instala nada) | `chmod +x arquivo.AppImage && ./arquivo.AppImage` — ou 2 cliques no gerenciador de arquivos |
| `discord-clone_0.1.2_amd64.deb` | Instalável (Ubuntu/Debian) | `sudo apt install ./discord-clone_0.1.2_amd64.deb` — aparece no menu de apps |

**Importante para o passo B:**
- O `.env` deve estar **preenchido com as chaves reais** antes de gerar — elas
  ficam gravadas dentro do pacote (igual ao `.exe`).
- Os pacotes são **sem assinatura digital** — no Linux isso **não é problema**
  (não existe Smart App Control); pode aparecer um aviso genérico do
  sistema, é só abrir mesmo assim.

---

## Configurando uma conta

- Se a criação de conta falhar com `email rate limit exceeded`, siga o
  `docs/DESATIVAR-CONFIRMACAO-EMAIL.md` (desligar "Confirm email" no painel).
- Todos os usuários (Windows e Linux) usam o **mesmo servidor e as mesmas
  salas** — um amigo no Linux e outro no Windows conversam entre si sem
  nenhuma configuração extra.

---

## Notas técnicas (Linux)

- **Lembrar login:** o app usa a criptografia do sistema (`safeStorage`). No
  Linux ela depende de um **keyring** (GNOME Keyring / KWallet). Se não houver
  keyring ativo, o "Lembrar de mim" fica desativado — sem afetar o resto.
- **Voz:** WebRTC com STUN + TURN públicos já embutidos — funciona em redes
  domésticas e com NAT restrito.
- **Microfone:** a primeira vez que entrar num canal de voz, o sistema pede
  permissão de acesso ao microfone — aceite. A seleção de dispositivo
  (seletor 🎤) funciona igual ao Windows.
