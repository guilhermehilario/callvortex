# 📧 Desativar a confirmação de e-mail no Supabase

**Motivo:** com "Confirm email" ligado, cada cadastro envia um e-mail de
confirmação — e o plano grátis do Supabase permite só **~2 e-mails por hora**.
Quando o limite estoura, qualquer tentativa de criar conta falha com
`email rate limit exceeded`. Desligar a confirmação faz o cadastro ser
**instantâneo** (sem e-mail) e resolve o problema para todos os amigos.

**Feito UMA vez, vale para sempre** — não precisa repetir nem regenerar o
`.exe`.

---

## Passo a passo (4 passos)

### Passo 1 — Entrar no painel do Supabase

Acesse **https://supabase.com** e faça login com a conta que criou o projeto.

Na tela inicial, **clique no seu projeto** (o nome que você escolheu ao
criar, ex.: "discord-clone").

### Passo 2 — Abrir as configurações de Autenticação

No **menu lateral esquerdo**, clique em **Authentication** (ícone de cadeado 🔒).

> Em alguns painéis o nome pode aparecer como **Authentication → Sign In /
> Providers** — é a mesma tela.

### Passo 3 — Achar a seção de Email e desligar o toggle

Dentro de *Authentication*, clique em **Providers** (abas no topo).

Role até a seção **Email** e **desligue o toggle** chamado
**"Confirm email"** (o interruptor fica cinza quando desligado).

> ⚠️ Atenção: mexa **somente** nesse toggle. Não desligue o *provider* Email
> em si (a opção de cima, que habilitaria/desabilitaria login por e-mail).

### Passo 4 — Salvar

Clique no botão **Save** (canto superior direito da página).

---

## Pronto ✅

Depois de salvar, qualquer pessoa pode criar conta **na hora**, sem e-mail de
verificação. O app já entra direto após o cadastro.

**Se der erro logo em seguida:** o limite do IP também pode estar ativo —
espere alguns minutos e tente de novo.

---

## Como conferir se funcionou (opcional)

Crie uma conta com um e-mail novo pelo app (ou peça para o amigo tentar).
Se criar sem erro, está funcionando.

---

## Perguntas frequentes

**Preciso gerar um `.exe` novo depois disso?**
Não. Essa configuração é no servidor (painel). O `.exe` que já foi enviado
vai funcionar normalmente.

**E se eu quiser voltar a pedir confirmação de e-mail?**
É só ligar o toggle de novo. Porém, enquanto estiver ligado, o limite de
~2 e-mails por hora volta a valer.

**Existe outra forma de enviar e-mails sem esse limite?**
Sim — configurar um SMTP próprio (ex.: Resend, com plano gratuito) nas
configurações de *Authentication → Email Templates* do Supabase. Não é
necessário para o seu caso de amigos.
