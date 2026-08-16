# 📌 Estado do Projeto

Situação atual do **Discord Clone** (atualizado em 16/08/2026).

---

## Funcionalidades implementadas

- 🔐 Login e criação de conta (e-mail + senha) via Supabase Auth
- 🖥️ Servidores com canais de **texto** e de **voz**
- ✉️ Mensagens diretas 1:1 (busca de amigos por username)
- ⚡ Mensagens em tempo real (Supabase Realtime)
- 🟢 Presença online (quem está conectado)
- 🔗 Entrar em servidor por código de convite
- 🖼️ Foto de perfil (upload via Supabase Storage)
- 😀 Emojis personalizados por servidor (`:nome:` nas mensagens)
- 🔊 Voz por canal: WebRTC em malha (P2P) com STUN + TURN público
  - Mudo 🎤, surdo 🎧, sair 📞, indicador de quem está falando
  - 🎙️ **Seletor de microfone**: escolher o dispositivo de áudio, trocar ao vivo durante a chamada e testar (barra de nível) antes de entrar
  - 🔊 **Volume individual por participante**: lista de integrantes com slider de volume para cada um (guardado entre chamadas)
  - 📶 **Sinal de rede por participante**: barras de sinal (1–4, estilo Discord) medidas via WebRTC `getStats` (RTT + perda de pacotes)
- 🗑️ Excluir mensagens, canais e servidores (dono)
- 📦 `.exe` portátil para distribuir (sem instalação)

## Verificações já realizadas (tudo passou)

| Verificação | Resultado |
|---|---|
| Typecheck (main + renderer) | ✅ Sem erros |
| Variáveis não usadas | ✅ Limpo |
| Build de produção (electron-vite) | ✅ OK |
| Dev mode (`npm run dev`) | ✅ Renderiza, sem crash, sem erros de console |
| Chaves do Supabase no `.env` | ✅ URL real `[REF_REMOVIDO].supabase.co` + chave publishable |
| Conexão com o Supabase (auth) | ✅ `supabase-js` conecta (teste de login retornou erro esperado de credencial) |
| Banco de dados | ✅ Tabela `profiles` existe (schema rodado) |
| `.exe` gerado | ✅ `release/Discord Clone 0.1.1.exe` (87 MB) com chaves + TURN embutidos |

## Configuração atual

- **Projeto Supabase:** `[REF_REMOVIDO]` (chaves no `.env` — não
  compartilhar o arquivo)
- **Alvo do build:** `portable` (o alvo NSIS falha nesta máquina por bloqueio
  do App Control — ver `RESOLUCAO-DE-PROBLEMAS.md` seção 5)
- **Electron:** 43.4.0 · **React:** 19 · **Vite:** 7 · **supabase-js:** 2.112

## Pendências / melhorias futuras

- [ ] **Assinar o `.exe`** com certificado de código (elimina o bloqueio do
      Smart App Control em qualquer máquina)
- [ ] **TURN próprio** para voz em produção (o atual é público/gratuito)
- [ ] Ícone personalizado do app (hoje usa o padrão do Electron)
- [ ] Atualizações automáticas (auto-update) para os amigos
- [ ] Se quiser que sua máquina seja o servidor: ver `SELF-HOSTED.md`
- [ ] `COMO-FUNCIONA.md` aguarda atualização da nota sobre TURN (arquivo estava
      aberto no editor durante a revisão)

## Fluxo recomendado (agora)

1. Testar o app: `npm run dev` (ou abrir o `.exe` com Smart App Control off)
2. Testar com o amigo: seguir `GUIA-RAPIDO.md` → "Plano de teste com o amigo"
3. Qualquer erro: ver `RESOLUCAO-DE-PROBLEMAS.md`
