# 🔧 Resolução de Problemas

Todos os erros já encontrados neste projeto e como resolver. Se aparecer algo
novo, adicione aqui.

---

## 1. "Failed to fetch" ao criar conta / entrar

**Causas possíveis (nesta ordem):**
1. O `.env` tem chaves erradas ou de teste (`placeholder`).
2. O `.exe` usado foi gerado com chaves antigas (as chaves ficam gravadas
   dentro do executável no momento do build).
3. Sem internet, ou o projeto Supabase foi excluído.

**Como verificar:**
```bash
# deve mostrar sua URL real (https://xxxx.supabase.co), NÃO "placeholder"
grep VITE_SUPABASE_URL .env
# chave real tem ~200+ chars (formato eyJ... ou sb_publishable_...)
grep -o 'VITE_SUPABASE_ANON_KEY=.\{0,15\}' .env
```

**Como resolver:**
1. Corrija o `.env` (ver `CONFIGURACAO.md`).
2. Rode `npm run dist` para gerar `.exe` novo.
3. Reenvie o `.exe` novo ao amigo.

---

## 2. Tela em branco ao abrir o app

**Causa:** processos órfãos de execuções anteriores do `npm run dev` (porta
5173 ocupada, janelas antigas quebradas). O código em si renderiza
corretamente.

**Resolver:**
```bash
# 1. encerra qualquer instância antiga do app
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*discord-clone*' -and $_.Name -match 'node|electron' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"

# 2. roda de novo
npm run dev
```

> Se ainda estiver em branco, o app agora loga o motivo no terminal
> (`[main] Renderer process gone -> motivo` / `[renderer:error] ...`).

---

## 3. Erro "Electron uninstall" ao rodar `npm run dev`

**Causa:** o binário do Electron não foi baixado (postinstall não rodou).

**Resolver:**
```bash
node node_modules/electron/install.js
# ou
npm rebuild electron
```

---

## 4. Windows bloqueia o `.exe` (Smart App Control)

**Sintoma:** "Uma política de Controle de Aplicativo bloqueou este arquivo" ou
o app simplesmente não abre.

**Causa:** Windows 11 com **Smart App Control** ativo bloqueia apps sem
assinatura digital (o nosso `.exe`). O `npm run dev` funciona porque o
executável do Electron é assinado oficialmente.

**Resolver (na máquina que bloqueia):**
**Windows Security → App & browser control → Smart App Control settings → Off**

> ⚠️ Desligar o Smart App Control é **permanente** naquela instalação do
> Windows (regra da Microsoft). Na maioria dos PCs ele vem desligado.

**Alternativa profissional (futuro):** assinar o `.exe` com um certificado de
código (OV, ~US$ 100-300/ano) para o Windows confiar no app.

---

## 5. `npm run dist` falha com "spawn UNKNOWN" (NSIS)

**Sintoma:** o build do instalador NSIS falha no passo que executa o instalador
para extrair o desinstalador (`spawn UNKNOWN`).

**Causa:** o Windows bloqueia/trunca o instalador recém-criado (antivírus /
App Control) — o arquivo sai com tamanho errado (ex.: 158 KB em vez de ~90 MB)
e não pode ser executado.

**Solução adotada:** o projeto agora gera apenas o alvo **portable**
(`release/CallVortex 0.1.2.exe`, 87 MB) — que não usa esse passo e funciona.
Se precisar do instalador NSIS, adicione a pasta do projeto às exclusões do
antivírus (exige admin) e rode com o alvo `nsis`.

---

## 6. Áudio da voz não conecta

**Causa:** NAT restrito impede a conexão direta WebRTC.

**Solução:** o app já usa STUN público + **TURN público (Open Relay)**. Se
mesmo assim não conectar:
- Ambos devem estar no **mesmo canal de voz**.
- Verifique o botão 🎧 (surdo) e o volume do sistema.
- Reinicie o app nos dois lados.
- Para garantia total em produção, configure um TURN próprio
  (Metered, Xirsys, Cloudflare Calls) em `src/renderer/src/lib/voice.ts`
  (lista `ICE_SERVERS`).

---

## 7. Mensagens não aparecem ao vivo

**Causa:** Realtime não habilitado no banco (publicação não criada).

**Resolver:** rode `supabase/schema.sql` no SQL Editor do Supabase (as linhas
`alter publication supabase_realtime add table ...` habilitam o realtime).

---

## 8. Porta 5173 em uso / duas instâncias do dev

**Sintoma:** "Port 5173 is in use, trying another one..." ou janelas
duplicadas.

**Resolver:** encerre as instâncias antigas (comando da seção 2) e rode
`npm run dev` de novo.

---

## 9. Chave do Supabase no formato novo (publishable)

O Supabase migrou as chaves: novas chaves são `sb_publishable_...` (pública,
para o app) e `sb_secret_...` (secreta, nunca expor). O app aceita tanto a
**publishable** quanto a **anon** (legacy). Use SEMPRE a publishable/anon —
nunca a secret/service_role.

---

## 10. Renomear canal não salva (ou mostra "Canal renomeado!" sem mudar)

**Causa:** o banco não tem a política RLS `channels_update` (ou o usuário não
é dono do servidor). Nesse caso o PostgREST atualiza **0 linhas sem retornar
erro** — o app não sabe que falhou.

**Resolver:**
1. Verifique se você é o **dono** do servidor (o botão de renomear só aparece
   para o dono).
2. Rode `supabase/schema.sql` no SQL Editor (cria a política `channels_update`).
3. Se o problema persistir, o app agora mostra um erro claro em vez de
   confirmar sem salvar.

---

## 11. Nome/foto de usuário não atualiza ao vivo (mensagens, membros, DMs)

**Causa:** a tabela `profiles` não estava habilitada no Realtime do Supabase
(a publicação só tinha `messages`, `dm_messages` e `dm_threads`).

**Resolver:** rode `supabase/migration-realtime-profiles.sql` no SQL Editor
(habilita `profiles`, `channels` e `servers` na publicação — idempotente).

---

## 12. Sair do app e voltar a entrar automaticamente (não mostra o login)

**Causa:** o "Lembrar de mim" guardava as credenciais e, ao clicar em **Sair**,
 a tela de login entrava sozinha de novo com as credenciais salvas.

**Resolver:** o logout agora **apaga as credenciais lembradas** — ao clicar em
Sair você cai na tela de login normalmente. Se quiser entrar automaticamente
na próxima abertura do app, marque "Lembrar de mim" de novo ao fazer login.

---

## 13. "email rate limit exceeded" ao criar conta

**Causa:** o serviço de e-mail gratuito do Supabase permite só **~2 e-mails
por hora** por projeto. Cada cadastro com "Confirm email" ligado envia um
e-mail de confirmação — tentativas repetidas estouram o limite (HTTP 429,
erro `over_email_send_rate_limit`).

**Solução recomendada — desativar a confirmação de e-mail** (ideal para app
de amigos, sem e-mail de verificação). Passo a passo completo em
`docs/DESATIVAR-CONFIRMACAO-EMAIL.md` — resumo:
1. Painel do Supabase → **Authentication** → **Providers** (ou *Sign In /
   Providers*) → seção **Email**.
2. Desligue o toggle **"Confirm email"** → **Save**.
3. Cadastro passa a criar a conta **na hora**, sem e-mail — o limite de
e-mails não é mais atingido.

**Alternativa:** aguardar ~1 hora (o limite zera sozinho) antes de tentar de
novo.

> 💡 O app já mostra uma mensagem explicativa quando esse erro ocorre.
> Se houver muitas contas para criar (ex.: vários amigos de uma vez),
> desativar "Confirm email" é o caminho.
