# Documentação Completa de Funcionalidades - CallVortex

**Versão:** 0.2.5  
**Nome:** CallVortex  
**Descrição:** Chat por texto e voz em tempo real para conversar com amigos  
**Tecnologias:** Electron + React + TypeScript + Supabase (Postgres, Realtime, Auth, Storage)  
**Arquitetura:** Desktop (Electron), WebRTC P2P para voz/tela, sinalização via Supabase Realtime

---

## Sumário

- [1. Autenticação e Conta](#1-autenticação-e-conta)
- [2. Servidores e Canais](#2-servidores-e-canais)
- [3. Mensagens de Texto](#3-mensagens-de-texto)
- [4. Mensagens Diretas (DMs)](#4-mensagens-diretas-dms)
- [5. Presença e Status Online](#5-presença-e-status-online)
- [6. Voz em Tempo Real (WebRTC)](#6-voz-em-tempo-real-webrtc)
- [7. Compartilhamento de Tela](#7-compartilhamento-de-tela)
- [8. Emojis Personalizados](#8-emojis-personalizados)
- [9. Figurinhas (Stickers) e GIFs](#9-figurinhas-stickers-e-gifs)
- [10. Convites Diretos para Voz](#10-convites-diretos-para-voz)
- [11. Notificações e Contadores Não Lidas](#11-notificações-e-contadores-não-lidas)
- [12. Perfil e Avatar](#12-perfil-e-avatar)
- [13. Configurações de Áudio](#13-configurações-de-áudio)
- [14. Gerenciamento de Mídia](#14-gerenciamento-de-mídia)
- [15. Arquitetura e Infraestrutura](#15-arquitetura-e-infraestrutura)
- [16. Segurança](#16-segurança)
- [17. Empacotamento e Distribuição](#17-empacotamento-e-distribuição)

---

## 1. Autenticação e Conta

### Funcionalidades
- **Cadastro de conta** (`AuthScreen.tsx`): Criação com e-mail, senha e nome de usuário
- **Login**: Autenticação via Supabase Auth com e-mail + senha
- **Recuperação de senha**: Envio de e-mail com link de redefinição
- **Deep-link para redefinição**: Suporte a `callvortex://reset` para redefinir senha via link no Electron
- **Modo recuperação** (`ResetPasswordScreen.tsx`): Tela específica quando app é aberto por link de recuperação válido
- **Salvar credenciais**: Opção para lembrar e-mail/senha/usuário localmente
- **Logout**: Encerramento de sessão

### Detalhes Técnicos
- Autenticação gerenciada pelo Supabase Auth
- Perfis armazenados na tabela `profiles` com `id`, `username`, `avatar_color`, `avatar_url`
- Geração de cor de avatar determinística baseada no nome de usuário
- Validação e tratamento de erros amigáveis
- Suporte a sessão temporária para recuperação de senha

---

## 2. Servidores e Canais

### Servidores
- **Criar servidor**: Criação com nome personalizado, cor de ícone gerada automaticamente
- **Entrar em servidor por convite**: Sistema de código de convite de 8 caracteres (gerado com CSPRNG)
- **Excluir servidor**: Apenas o dono pode excluir
- **Lista de servidores** (`ServerRail.tsx`): Barra lateral com ícones dos servidores
- **Navegação entre servidores**: Seleção de servidor altera canais visíveis

### Canais
- **Tipos de canal**: Texto (`text`) e Voz (`voice`)
- **Criar canal**: Criado pelo dono do servidor, com nome normalizado (lowercase, hífens ao invés de espaços)
- **Renomear canal**: Funcionalidade para renomear canais existentes
- **Excluir canal**: Remoção de canais
- **Lista de canais** (`ChannelSidebar.tsx`): Exibição organizada por tipo
- **Seleção de canal**: Navegação entre canais de texto e voz

### Banco de Dados
- Tabelas: `servers`, `channels`, `server_members`
- Sistema de membros para controle de acesso
- Convites via `invite_code` único

---

## 3. Mensagens de Texto

### Funcionalidades
- **Enviar mensagens** em canais de texto
- **Visualizar histórico**: Carregamento de até 200 mensagens por canal
- **Mensagens em tempo real**: Atualizações via Supabase Realtime
- **Excluir mensagens**: Remoção de mensagens próprias
- **Exibição com autor**: Mostra avatar, nome de usuário e horário
- **Suporte a conteúdo rico**: Texto, emojis personalizados, figurinhas

### Componentes
- `ChatArea.tsx`: Área principal de chat
- Renderização de mensagens com informações do autor
- Scroll automático para mensagens novas

---

## 4. Mensagens Diretas (DMs)

### Funcionalidades
- **Criar conversa direta**: Buscar usuários e iniciar DM
- **Lista de DMs**: Conversas com último mensagem e preview
- **Enviar mensagens diretas**: Chat 1:1 privado
- **Excluir mensagens DM**: Remoção de mensagens
- **Atualização em tempo real**: Novas mensagens via Realtime
- **Atualização do preview**: Última mensagem atualizada na lista

### Banco de Dados
- Tabelas: `dm_threads`, `dm_participants`, `dm_messages`
- Função RPC `create_dm_thread` para criar ou obter thread existente
- Atualização automática de `last_message`, `last_message_author`, `last_message_at`

---

## 5. Presença e Status Online

### Funcionalidades
- **Presença online**: Indica quais usuários estão conectados
- **Rastreamento global**: Presença via Supabase Realtime Presence
- **Indicadores visuais**: Mostra usuários online na lista de membros
- **Atualização em tempo real**: Entrada/saída de usuários

### Implementação
- `realtime.ts`: Gerenciamento de canais Realtime
- Rastreamento por servidor e globalmente
- Sincronização entre clientes

---

## 6. Voz em Tempo Real (WebRTC)

### Arquitetura
- **Malha P2P**: Cada participante conecta diretamente aos outros (mesh topology)
- **Sinalização via Supabase**: Tabela `call_signals` para ofertas/respostas/ICE candidates
- **STUN/TURN**: Servidores STUN públicos + TURN público (Open Relay) configuráveis

### Funcionalidades
- **Entrar/Sair de canal de voz**: Navegação entre canais de voz
- **Controle de áudio**: Mutar microfone e ensurdecer
- **Indicador de falando**: Detecção visual de quem está falando (VAD)
- **Lista de participantes**: Exibição de usuários na chamada
- **Presença em canal de voz**: Mostra quem está em cada canal de voz mesmo fora da sala
- **Sessões ativas**: Rastreamento de tempo de atividade por canal
- **Convites para voz**: Sistema de convites diretos
- **Múltiplos participantes**: Suporte a chamadas em grupo

### Controles Avançados
- **Seleção de microfone**: Escolher dispositivo de entrada
- **Volume por participante**: Controle individual de volume
- **Supressão de ruído**: Ativação/desativação
- **Redução ativa de ruído (ANC)**: Filtro passa-alta/baixa + compressor
- **Indicadores de sinal**: Barras de sinal para qualidade de conexão

### Componentes
- `VoiceChannelScreen.tsx`: Tela principal da chamada de voz
- `VoiceParticipantTiles.tsx`: Tiles dos participantes
- `VoiceInvitePopups.tsx`: Popups de convite
- `VoiceTroubleshooter.tsx`: Diagnóstico de problemas
- `useVoice.ts`: Hook principal de gerenciamento de voz
- `voice.ts`: Lógica WebRTC, PeerConnections, sinalização

### Banco de Dados
- Tabela `call_signals`: Sinalização WebRTC com RLS
- Tabela `voice_sessions`: Controle de sessões ativas por canal

---

## 7. Compartilhamento de Tela

### Funcionalidades
- **Compartilhar tela**: Tela inteira ou janela específica
- **Seletor de fontes**: Picker nativo do Electron para selecionar tela/janela
- **Áudio do sistema**: Opção para compartilhar áudio do sistema (quando disponível)
- **Visualização**: Exibição da tela compartilhada em tempo real
- **Indicador**: Mostra quem está compartilhando tela
- **Parar compartilhamento**: Encerramento a qualquer momento
- **Múltiplos compartilhamentos**: Suporte a visualização de diferentes compartilhamentos
- **Proteção via RLS**: Sinalização protegida para apenas participantes da chamada

### Implementação
- **P2P via mesma malha WebRTC**: Usa os mesmos PeerConnections da chamada de voz
- **Renegociação**: Adiciona tracks de vídeo aos PCs existentes
- **Gerenciamento separado**: Módulo dedicado em `lib/screenShare/`
  - `manager.ts`: Gerenciador principal
  - `capture.ts`: Captura de tela/janela
  - `signaling.ts`: Sinalização específica
  - `audio.ts`: Áudio do sistema
  - `types.ts`: Tipos

### Componentes
- `ScreenShareButton.tsx`: Botão para iniciar/parar
- `ScreenSharePicker.tsx`: Seletor de fonte
- `ScreenShareStage.tsx`: Visualização da tela compartilhada
- `useScreenShare.ts`: Hook para gerenciar estado

### Segurança
- Sinalização via tabela `screen_share_signals` com RLS
- Apenas usuários na mesma chamada podem trocar sinais
- Vídeo trafega diretamente P2P (não passa pelo servidor)

---

## 8. Emojis Personalizados

### Funcionalidades
- **Adicionar emoji**: Upload de imagem para servidor (apenas dono)
- **Gerenciar emojis** (`Modals.tsx`): Modal para adicionar/remover
- **Usar em mensagens**: Suporte a `:nome_emoji:` nas mensagens
- **Lista por servidor**: Emojis disponíveis por servidor
- **Armazenamento**: Supabase Storage bucket `emojis`

### Limitações
- Gerenciamento restrito ao dono do servidor
- Formatos de imagem suportados pelo Storage

---

## 9. Figurinhas (Stickers) e GIFs

### Funcionalidades
- **Figurinhas pessoais**: Criadas pelo usuário para uso próprio
- **Figurinhas de servidor**: Compartilhadas no servidor (dono pode gerenciar)
- **Enviar figurinha**: Envio direto como mensagem
- **Adicionar figurinha**: Upload com validação
- **Remover figurinha**: Exclusão (apenas dono)
- **Categorias padrão**: Conjunto de figurinhas padrão incluídas
- **Suporte a GIFs**: Aceita formato GIF

### Validações
- Formatos aceitos: PNG, JPG, JPEG, WebP, GIF
- Nome válido: apenas letras, números, `_` ou `-` (máx. 32 caracteres)
- Detecção por MIME type (não por extensão do arquivo)
- Verificação de duplicados por nome

### Armazenamento
- Bucket `stickers` no Supabase Storage
- Organização: `stickers/user/{userId}/` ou `stickers/server/{serverId}/`
- Métadados na tabela `stickers`

### Implementação
- `defaultStickers.ts`: Figurinhas padrão
- Pasta `assets/stickers/`: Recursos estáticos
- Múltiplas categorias: reações, animais, comida, natureza, objetos, símbolos, brasil, natal, capivara, selvagens, planeta, felino, halloween, frutas, fantasia

---

## 10. Convites Diretos para Voz

### Funcionalidades
- **Enviar convite**: Convidar usuário para sala de voz atual
- **Receber convite**: Popup com opção Entrar/Recusar
- **Aceitar convite**: Navega automaticamente para servidor/canal e entra na chamada
- **Recusar convite**: Descarta o convite
- **Convites em tempo real**: Transmitidos via Supabase Realtime

### Implementação
- Canal Realtime por usuário para receber convites
- Estado `incomingInvites` no contexto global
- `VoiceInvitePopups.tsx` para exibição
- Tipos definidos em `types.ts`

---

## 11. Notificações e Contadores Não Lidas

### Funcionalidades
- **Não lidas por canal de texto**: Contador por canal
- **Não lidas por DM**: Contador por conversa
- **Badge no servidor**: Soma de não lidas por servidor
- **Badge total DMs**: Soma total de DMs não lidas
- **Marcar como lido**: Ao abrir canal ou DM, zera contador
- **Atualização em tempo real**: Contadores atualizados com novas mensagens

### Implementação
- Rastreamento global de todas as mensagens
- `allChannels` para mapeamento channel_id -> server_id
- Funções `markChannelRead` e `markDmRead`
- Cálculo automático de totais

---

## 12. Perfil e Avatar

### Funcionalidades
- **Foto de perfil**: Upload de imagem personalizado
- **Avatar colorido**: Cor gerada automaticamente como fallback
- **Exibição**: Avatar mostrado em mensagens, lista de membros, chamadas
- **Atualização**: Clique no avatar no canto inferior esquerdo para alterar
- **Componente Avatar** (`Avatar.tsx`): Renderização unificada

### Armazenamento
- Bucket `avatars` no Supabase Storage
- URL pública salva no perfil
- Organização por `userId/`

---

## 13. Configurações de Áudio

### Dispositivos
- **Microfones**: Listagem e seleção de dispositivos de entrada
- **Alto-falantes/saída**: Listagem e seleção de dispositivos de saída
- **Detecção dinâmica**: Atualização ao conectar/desconectar dispositivos

### Controles
- **Volume do microfone**: Ajuste de ganho
- **Volume por participante**: Controle individual
- **Volume de saída**: Controle geral
- **Mutar/Ensurdecer**: Controles globais
- **Supressão de ruído**: Ativação
- **Redução ativa de ruído**: Processamento de áudio customizado

### Implementação
- `MicPicker.tsx`, `OutputPicker.tsx`: Seletores de dispositivo
- Web Audio API para processamento
- Filtros passa-alta/baixa e compressor para ANC

---

## 14. Gerenciamento de Mídia

### Sons
- **Sons de notificação**: Sons para eventos (join/leave, etc.)
- `sounds.ts`: Sistema de reprodução de sons

### Qualidade de Conexão
- **Monitoramento de internet**: Ping e qualidade
- **Indicadores visuais**: Barras de sinal
- `internet.ts`: Medição de latência

### Configurações Locais
- **Salvamento local**: Preferências salvas no localStorage
- `settings.ts`: Gerenciamento de configurações

---

## 15. Arquitetura e Infraestrutura

### Estrutura de Pastas
```
src/
├── main/           # Processo principal Electron
├── preload/        # Ponte de segurança (contextBridge)
└── renderer/       # Interface React
    └── src/
        ├── assets/      # Imagens, stickers, ícones
        ├── components/  # Componentes React
        └── lib/         # Lógica core
            ├── api.ts           # Cliente Supabase API
            ├── supabase.ts      # Inicialização Supabase
            ├── useApp.tsx       # Contexto global
            ├── useVoice.ts      # Hook de voz
            ├── useScreenShare.ts # Hook de compartilhamento
            ├── voice.ts         # WebRTC core
            ├── realtime.ts      # Supabase Realtime
            ├── types.ts         # Tipos TypeScript
            └── screenShare/     # Módulos de compartilhamento
```

### Processos Electron
- **Main Process** (`src/main/index.ts`): Janela principal, IPC, deep links, captura de tela
- **Preload** (`src/preload/`): Exposição segura de APIs ao renderer
- **Renderer**: Aplicação React

### Estado Global
- **React Context** (`useApp.tsx`): Contexto único com todo o estado da aplicação
- **AppContextValue**: Interface completa com 140+ propriedades/métodos
- Gerenciamento centralizado de auth, servidores, canais, voz, DMs, etc.

### Build e Dev
- **electron-vite**: Build tool para Electron + Vite
- **TypeScript**: Tipagem em toda a aplicação
- **Hot reload**: Desenvolvimento com `pnpm dev`

---

## 16. Segurança

### Row Level Security (RLS)
- Todas as tabelas com políticas RLS no Supabase
- Usuários só acessam dados de servidores que são membros
- DMs apenas entre participantes
- Sinalização de voz/tela restrita a participantes da chamada
- Emojis/stickers com permissões por dono/servidor

### Segurança no Cliente
- **ContextBridge**: Comunicação segura entre processos
- **Validação**: Tratamento de erros sem expor detalhes internos
- **Sanitização**: Nomes normalizados (canais, emojis)
- **CSPRNG**: Geração de códigos de convite com `crypto.getRandomValues`
- **Sem exposição de secrets**: Apenas `anon key` pública

### Armazenamento
- Políticas de bucket no Supabase Storage
- Upload restrito por tipo MIME
- Validações server-side via RLS

---

## 17. Empacotamento e Distribuição

### Configuração
- **electron-builder**: Empacotamento para distribuição
- **App ID**: `br.com.callvortex`
- **Nome**: `CallVortex`
- **Protocolo customizado**: `callvortex://` para deep links

### Plataformas
- **Windows**: Portable (.exe), NSIS installer
- **Linux**: Suporte a .AppImage/.deb (documentado)
- **Auto-updater**: `electron-updater` configurado com GitHub Releases

### Scripts
- `pnpm dev`: Desenvolvimento
- `pnpm build`: Build
- `pnpm dist`: Gerar instalador
- `pnpm typecheck`: Verificação TypeScript
- `pnpm test:e2e`: Testes E2E

### Distribuição
- Banco compartilhado via Supabase (mesmo projeto)
- Usuários só precisam instalar o app
- Atualizações via GitHub Releases

---

## Documentação Adicional

O projeto possui extensa documentação na pasta `docs/`:
- `GUIA-RAPIDO.md`: Do zero até conversar
- `ESTADO-DO-PROJETO.md`: Estado atual implementado
- `COMO-FUNCIONA.md`: Arquitetura detalhada
- `GUIA-DO-CRIADOR.md` / `GUIA-DO-AMIGO.md`: Guias de uso
- `RESOLUCAO-DE-PROBLEMAS.md`: Troubleshooting
- `SELF-HOSTED.md`: Opções de auto-hospedagem
- `GUIA-LINUX.md`: Instruções para Linux

---

**Nota:** Este documento foi gerado com base na análise completa do código-fonte. Todas as funcionalidades listadas estão implementadas no projeto.
