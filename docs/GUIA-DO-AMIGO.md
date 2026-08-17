# 🙋 Guia do Amigo — como entrar na sala

Você recebeu o arquivo **`CallVortex 0.1.2.exe`** do seu amigo.
Siga estes 3 passos e você estará dentro da sala.

---

## Passo 1 — Abrir o app

1. Clique duas vezes no arquivo **`CallVortex 0.1.2.exe`** que você recebeu
   (não precisa instalar nada — ele roda direto).
2. Se o Windows reclamar com "Windows protegeu seu computador" (SmartScreen),
   clique em **Mais informações → Executar assim mesmo**. Isso acontece porque
   o app não tem assinatura digital paga — o arquivo é seguro.
3. Se aparecer "Uma política de Controle de Aplicativo bloqueou este arquivo",
   seu Windows tem o **Smart App Control** ligado. Para abrir o app:
   **Windows Security → App & browser control → Smart App Control settings → Off**
   (o aviso da Microsoft: desligar é permanente nesta instalação do Windows).

## Passo 2 — Criar sua conta

1. Na tela de login, clique em **Criar conta**.
2. Preencha:
   - **Nome de usuário** (ex: `joaozinho`) — é assim que seu amigo vai te achar.
   - **E-mail** (qualquer um que você acesse) e **senha** (mínimo 6 caracteres).
3. Clique em **Criar conta** e pronto — você já está logado.

> 💡 **Importante:** diga seu **nome de usuário** para o seu amigo. É com ele
> que você será encontrado.

## Passo 3 — Entrar na sala do seu amigo

Pergunte ao seu amigo o **código de convite** (6 letras/números, ex: `ABC123`) e:

1. Na barra esquerda (onde ficam os botões redondos), clique no botão de
   **bússola/compasso** (entrar em servidor) — ou no **＋** → **Entrar em servidor**.
2. Digite o código e clique em **Entrar**.
3. Pronto! O servidor do seu amigo aparece na barra esquerda.

### Conversar por voz
1. Clique no servidor do seu amigo.
2. No canal de voz (ícone 🔊, ex: "Sala"), **clique no nome do canal** para entrar.
3. Autorize o microfone se o sistema pedir.
4. Use os botões da barra verde no canto inferior:
   - 🎤 = silenciar seu microfone
   - 🎧 = ficar "surdo" (não ouvir ninguém)
   - 📞 = sair do canal

### Conversar por texto
Clique num canal de texto (ex: `#geral`) e escreva no campo embaixo.
Use `:` para emojis do servidor (ex: `:risada:`), se o servidor tiver.

---

## Perguntas frequentes

**"Não consigo criar conta, dá erro Failed to fetch"**
O app não está conseguindo falar com o servidor. Confirme que você está com
internet e que o instalador é o **mais recente** que seu amigo gerou (peça para
ele rodar `npm run dist` de novo depois de configurar as chaves).

**"Entrei no canal de voz mas não ouço meu amigo"**
- Os dois precisam estar no **mesmo canal de voz**.
- Confira o **🎧** (se ativado, você não ouve nada) e o volume do sistema.
- Se mesmo assim não conectar, pode ser a rede (NAT restrito) — fale com seu
  amigo sobre o servidor TURN (melhoria futura do app).

**"Como te mando mensagem direta?"**
Seu amigo te acha pelo **username**: em **Mensagens diretas → ＋** → digita seu
nome de usuário → abre a conversa.

---

Pronto! 🎉 Você está dentro da sala.
