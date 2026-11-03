# CONTEXTO DO PROJETO - CallVortex

Este arquivo foi gerado para fornecer contexto completo a um agente de IA para entender e trabalhar neste projeto.

## Informações Gerais

- **Nome:** CallVortex
- **Versão:** 0.2.5
- **Tipo:** Aplicação Desktop (Electron)
- **Descrição:** Chat por texto e voz em tempo real para conversar com amigos (clone estilo Discord)
- **Licença:** GPL-3.0
- **Repositório:** git@github.com:guilhermehilario/callvortex.git
- **Autor:** CallVortex

## Stack Tecnológica

### Core
- **Electron** ^43.4.0 - Framework desktop
- **React** ^19.2.8 - UI
- **TypeScript** ^7.0.2 - Tipagem
- **Vite** ^7.3.6 / **electron-vite** ^5.0.0 - Build tool

### Backend/Serviços
- **Supabase** ^2.112.3 (@supabase/supabase-js) - Backend as a Service
  - PostgreSQL - Banco de dados
  - Supabase Auth - Autenticação
  - Supabase Realtime - Tempo real (presença, mensagens, sinais)
  - Supabase Storage - Armazenamento de arquivos (avatares, emojis, stickers)

### Comunicação em Tempo Real
- **WebRTC** - Voz e vídeo P2P (mesh topology)
- **STUN/TURN** - Conectividade NAT (STUN públicos + Open Relay TURN configurável)

### Outros
- **electron-updater** ^6.8.9 - Auto-atualização
- **electron-builder** ^26.15.3 - Empacotamento

## Arquitetura

### Estrutura de Diretórios
```
src/
├── main/              # Processo principal Electron
│   └── index.ts       # Janela, IPC, deep links (callvortex://), screen capture
├── preload/           # Ponte segura entre main e renderer
│   ├── index.ts       # contextBridge
│   └── index.d.ts     # Tipos do preload
└── renderer/          # Processo renderer (React app)
    └── src/
        ├── App.tsx           # Componente raiz
        ├── main.tsx          # Entry point
        ├── assets/           # Recursos estáticos (stickers organizados por categoria)
        ├── components/       # Componentes React
        └── lib/              # Lógica core da aplicação
```

### Comunicação Entre Processos
- **Main ↔ Renderer**: Via IPC através do preload com contextBridge
- **Renderer ↔ Supabase**: Direto via cliente Supabase
- **P2P**: WebRTC para voz/tela (apenas sinalização passa pelo Supabase)

## Componentes Principais

### UI Core
- `App.tsx` - Orquestrador principal, gerencia layout
- `AuthScreen.tsx` - Login/cadastro
- `ResetPasswordScreen.tsx` - Redefinição de senha via deep-link
- `ServerRail.tsx` - Barra lateral de servidores
- `ChannelSidebar.tsx` - Lista de canais
- `ChatArea.tsx` - Área de chat de texto
- `MemberList.tsx` - Lista de membros online

### Voz
- `VoiceChannelScreen.tsx` - Tela de chamada de voz
- `VoiceParticipantTiles.tsx` - Tiles dos participantes
- `VoiceInvitePopups.tsx` - Popups de convite
- `VoiceTroubleshooter.tsx` - Diagnóstico
- `MicPicker.tsx` / `OutputPicker.tsx` - Seleção de dispositivos

### Compartilhamento de Tela
- `ScreenShareButton.tsx` - Botão iniciar/parar
- `ScreenSharePicker.tsx` - Seletor de fonte
- `ScreenShareStage.tsx` - Visualização
- `lib/screenShare/` - Módulos: manager, capture, signaling, audio, types

### Outros
- `Modals.tsx` - Modais (criar servidor/canal, gerenciar emojis/stickers)
- `Avatar.tsx` - Componente de avatar unificado
- `Icons.tsx` - Ícones SVG
- `Logo.tsx` - Logo do app

## Bibliotecas Core (src/renderer/src/lib/)

### Gerenciamento de Estado
- `useApp.tsx` - **Contexto global** - Único ponto de verdade. Exporta `AppContextValue` com ~140 propriedades/métodos
- `app-types.ts` - Tipos do contexto
- `types.ts` - Tipos de entidades (Profile, Server, Channel, Message, etc.)

### API e Dados
- `api.ts` - **Todas as chamadas Supabase** (auth, servidores, canais, mensagens, DMs, emojis, stickers, avatars)
- `supabase.ts` - Inicialização do cliente Supabase
- `invites.ts` - Lógica de convites
- `realtime.ts` - Gerenciamento de canais Realtime e presença

### Voz e Comunicação
- `voice.ts` - **Core WebRTC** - PeerConnections, sinalização, detecção de fala, gerenciamento de tracks
- `useVoice.ts` - Hook React para voz
- `useScreenShare.ts` - Hook para compartilhamento de tela
- `connection.ts` - Gerenciamento de conexão

### Utilitários
- `settings.ts` - Configurações locais (localStorage)
- `sounds.ts` - Sistema de sons
- `internet.ts` - Medição de ping/qualidade
- `defaultStickers.ts` - Stickers padrão
- `signalBars.tsx` - Componente de barras de sinal

## Modelo de Dados (Principais Entidades)

### Autenticação/Perfis
```typescript
Profile {
  id: string
  username: string
  avatar_color: string
  avatar_url?: string | null
  created_at?: string
}
```

### Servidores
```typescript
Server {
  id: string
  name: string
  owner_id: string
  icon_color: string
  invite_code: string | null
  created_at: string
}

Channel {
  id: string
  server_id: string
  name: string
  type: 'text' | 'voice'
  created_at: string
}
```

### Mensagens
```typescript
Message {
  id: number
  channel_id: string
  author_id: string
  content: string
  created_at: string
  author?: Profile
}

DmThread {
  id: string
  last_message: string | null
  last_message_author: string | null
  last_message_at: string | null
  created_at: string
}

DmMessage {
  id: number
  thread_id: string
  author_id: string
  content: string
  created_at: string
  author?: Profile
}
```

### Voz
```typescript
VoicePeerInfo {
  userId: string
  username: string
  avatar_color: string
  avatar_url?: string | null
  muted?: boolean
  deafened?: boolean
}

VoiceInvite {
  channelId: string
  serverId: string
  channelName: string
  serverName: string
  inviter: Profile
  invitedAt: number
}
```

### Conteúdo Personalizado
```typescript
ServerEmoji {
  id: string
  server_id: string
  name: string
  url: string
  created_at?: string
}

Sticker {
  id: string
  server_id: string | null  // null = pessoal
  owner_user_id: string | null
  name: string
  url: string
  created_at?: string
}
```

## Tabelas Supabase

### Principais
- `profiles` - Perfis de usuário
- `servers` - Servidores
- `server_members` - Membros dos servidores (join)
- `channels` - Canais (text/voice)
- `messages` - Mensagens de canal
- `dm_threads` - Threads de DM
- `dm_participants` - Participantes de DM
- `dm_messages` - Mensagens diretas
- `server_emojis` - Emojis personalizados
- `stickers` - Figurinhas pessoais/servidor

### Voz/Sinalização
- `call_signals` - Sinalização WebRTC (ofertas/respostas/ICE)
- `voice_sessions` - Sessões ativas em canais de voz
- `screen_share_signals` - Sinalização de compartilhamento de tela

### Storage Buckets
- `avatars` - Fotos de perfil
- `emojis` - Emojis de servidor
- `stickers` - Figurinhas

## Funcionalidades Chave

### Autenticação
- Login/cadastro com email+senha
- Recuperação de senha com deep-link (`callvortex://reset`)
- Modo recuperação de senha
- Salvamento de credenciais local

### Servidores e Canais
- Criar/entrar em servidor por código de convite (8 chars, CSPRNG)
- Criar/renomear/excluir canais (texto/voz)
- Excluir servidor (apenas dono)
- Navegação entre servidores/canais/DMs

### Chat
- Mensagens em tempo real via Supabase Realtime
- DMs 1:1 com lista e preview
- Excluir mensagens (próprias)
- Emojis personalizados via `:nome:`
- Figurinhas/GIFs
- Contadores de não lidas

### Voz WebRTC (P2P Mesh)
- Entrar/sair de canais de voz
- Mudo/ensurdecer
- Detecção de quem está falando
- Volume individual por participante
- Seleção de microfone/alto-falante
- Supressão de ruído + redução ativa de ruído (ANC)
- Presença em canais de voz
- Convites diretos para voz
- Sessões ativas com timer

### Compartilhamento de Tela
- Tela inteira ou janela
- Áudio do sistema (opcional)
- P2P na mesma malha WebRTC
- Renegociação automática
- Apenas participantes da chamada veem
- Sinalização protegida por RLS

### Personalização
- Avatar customizado
- Emojis por servidor
- Figurinhas pessoais/servidor
- Cores de avatar geradas automaticamente

## Fluxo de Desenvolvimento

### Scripts
```json
{
  "dev": "electron-vite dev",           // Desenvolvimento
  "build": "electron-vite build",       // Build
  "start": "electron-vite preview",     // Preview build
  "typecheck": "tsc --noEmit ...",      // Verificação de tipos
  "dist": "electron-vite build && electron-builder", // Empacotar
  "test:e2e": "node scripts/test-e2e-api.mjs"
}
```

### Configuração
- `.env` necessário com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
- Schema SQL em `supabase/schema.sql`
- Migrações em `supabase/` e `supabase/migrations/`

### Deep Links
- Protocolo `callvortex://` configurado
- Handler em `src/main/index.ts`
- Usado para recuperação de senha

## Padrões e Convenções

### Código
- TypeScript strict em grande parte
- Componentes funcionais React com hooks
- Context API para estado global
- Módulos ES6
- Sem comentários desnecessários (conforme instruções do projeto)

### Nomenclatura
- Componentes: PascalCase (ex: `VoiceChannelScreen.tsx`)
- Hooks: camelCase com prefixo `use` (ex: `useVoice.ts`)
- Utilitários: camelCase (ex: `api.ts`)
- Tipos: PascalCase/interfaces

### Segurança
- RLS em todas as tabelas
- ContextBridge para IPC
- Apenas anon key exposta
- Validações client-side e server-side
- Tratamento de erros sem vazar detalhes internos
- Códigos de convite com CSPRNG

## Arquivos Importantes

- `README.md` - Documentação principal
- `CONFIGURACAO.md` - Configuração do Supabase
- `ATUALIZAR-SUPABASE.md` - Como aplicar migrações
- `LICENSE` - GPL-3.0
- `package.json` - Configurações e dependências
- `electron.vite.config.ts` - Configuração do build
- `supabase/schema.sql` - Schema completo do banco
- `DOCUMENTACAO_COMPLETA_FUNCIONALIDADES.md` - Documentação detalhada

## Pontos de Atenção para o Agente

### Ao trabalhar com voz
- WebRTC mesh - cada peer conecta com todos
- Sinalização via `call_signals` tabela
- Importante entender `voice.ts` e `useVoice.ts`
- ICE servers em `voice.ts` (configurável)
- Renegociação necessária para screen share

### Ao trabalhar com compartilhamento de tela
- Usa mesmos PeerConnections da voz
- Precisa adicionar tracks de vídeo
- Sinalização separada em `screenShare/signaling.ts`
- Gerenciado por `ScreenShareManager`

### Ao trabalhar com Supabase
- Sempre respeitar RLS
- Usar funções RPC quando necessário (`join_server`, `create_dm_thread`)
- Realtime channels precisam ser gerenciados corretamente
- Storage com políticas específicas

### Ao trabalhar com UI
- Estado global via `useApp()` context
- Componentes seguem estilo Discord-like (tema escuro)
- Muitos componentes usam o contexto global
- Layout principal em `App.tsx`

### Performance
- Mensagens limitadas a 200 por carga
- Realtime subscriptions gerenciadas
- PeerConnections gerenciados por peer
- Presença otimizada

## Comandos Úteis

```bash
# Desenvolvimento
pnpm install
pnpm dev

# Verificação
pnpm typecheck

# Build/Distribuição
pnpm build
pnpm dist
```

## Notas

- Projeto funciona com Supabase gratuito
- Voz usa arquitetura P2P (tráfego direto entre clientes)
- Apenas sinalização passa pelo Supabase
- Código-fonte em português (nomes de variáveis/comentários em português)
- Tema escuro estilo Discord
- Suporte a deep links para recuperação de senha
- Auto-updater configurado para GitHub Releases
