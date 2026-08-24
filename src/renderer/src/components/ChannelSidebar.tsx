import { useEffect, useRef, useState } from 'react'
import { uploadAvatar } from '../lib/api'
import type { Channel } from '../lib/types'
import { useApp } from '../lib/useApp'
import Avatar from './Avatar'
import { ActivitiesIcon, BroadcastIcon, ChevronDownIcon, GearIcon, HeadphonesIcon, HeadphonesOffIcon, MicIcon, MicOffIcon, MonitorIcon, PencilIcon, PhoneOffIcon, PowerIcon, RouterIcon, VideoIcon } from './Icons'
import MicPicker from './MicPicker'
import OutputPicker from './OutputPicker'
import ScreenShareButton from './ScreenShareButton'
import SignalBars from './SignalBars'

/** "30 s", "5 min 30 s", "1 h 12 min 30 s" — duração desde o início da atividade. */
function formatActivity(startedAtIso: string, nowMs: number): string | null {
  const ms = nowMs - new Date(startedAtIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h} h ${m} min ${s} s`
  if (m > 0) return `${m} min ${s} s`
  return `${s} s`
}

export default function ChannelSidebar(): React.JSX.Element {
  const {
    screen,
    channels,
    servers,
    dms,
    profile,
    onlineUsers,
    voiceChannelId,
    voiceRoster,
    voicePresence,
    voiceSessions,
    speakingUsers,
    peerSignals,
    screenShareState,
    selectChannel,
    selectDm,
    openModal,
    openRenameChannel,
    handleDeleteChannel,
    handleDeleteServer
  } = useApp()

  const [menuOpen, setMenuOpen] = useState(false)
  // re-renderiza a cada segundo para atualizar o relógio das salas ativas
  const [, setNow] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(iv)
  }, [])

  const handleVoiceClick = (c: Channel): void => {
    // Clicar no canal de voz apenas abre a tela dele. Entrar/sair é sempre
    // feito pelos botões ("Entrar no canal de voz" e 📞) — evita sair da
    // chamada sem querer ao navegar entre os canais.
    selectChannel(c.id)
  }

  if (screen?.type === 'server') {
    const server = servers.find((s) => s.id === screen.serverId)
    const isOwner = server?.owner_id === profile?.id
    if (!server) return <div className="sidebar" />
    const textChannels = channels.filter((c) => c.type === 'text')
    const voiceChannels = channels.filter((c) => c.type === 'voice')

    return (
      <div className="sidebar">
        <div className="sidebar-header">
          <button className="sidebar-server-name" onClick={() => setMenuOpen((v) => !v)} title="Opções do servidor">
            <span className="sidebar-server-name-text">{server.name}</span>
            <span className="sidebar-chevron">▾</span>
          </button>
          {menuOpen && (
            <div className="server-menu">
              <div className="server-menu-item" onClick={() => { setMenuOpen(false); openModal('create-channel') }}>
                <span className="server-menu-icon">✚</span> Criar canal
              </div>
              {server.invite_code && (
                <div
                  className="server-menu-item"
                  onClick={() => {
                    void navigator.clipboard.writeText(server.invite_code as string)
                    setMenuOpen(false)
                  }}
                >
                  <span className="server-menu-icon">🔗</span> Copiar convite: {server.invite_code}
                </div>
              )}
              {isOwner && (
                <div
                  className="server-menu-item"
                  onClick={() => {
                    setMenuOpen(false)
                    openModal('manage-emojis')
                  }}
                >
                  <span className="server-menu-icon">😀</span> Gerenciar emojis
                </div>
              )}
              {isOwner && (
                <div
                  className="server-menu-item danger"
                  onClick={() => {
                    setMenuOpen(false)
                    if (window.confirm(`Excluir o servidor "${server.name}"? Todos os canais e mensagens serão apagados.`)) {
                      void handleDeleteServer()
                    }
                  }}
                >
                  <span className="server-menu-icon">🗑</span> Excluir servidor
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sidebar-scroll">
          <div className="channel-section">
            <div className="channel-section-header">
              <span className="channel-section-caret">▾</span>
              <span>Canais de texto</span>
              {isOwner && (
                <button className="channel-add" title="Criar canal" onClick={() => openModal('create-channel')}>
                  ＋
                </button>
              )}
            </div>
            {textChannels.map((c) => {
              const active = screen.channelId === c.id
              return (
                <div key={c.id} className={`channel-item ${active ? 'active' : ''}`} onClick={() => selectChannel(c.id)}>
                  <span className="channel-hash">#</span>
                  <span className="channel-name">{c.name}</span>
                  {isOwner && (
                    <span className="channel-actions">
                      <button className="channel-edit" title="Renomear canal" onClick={(e) => { e.stopPropagation(); openRenameChannel(c) }}>
                        <PencilIcon size={12} />
                      </button>
                      {channels.length > 1 && (
                        <button
                          className="channel-delete"
                          title="Excluir canal"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (window.confirm(`Excluir o canal #${c.name}?`)) void handleDeleteChannel(c.id)
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  )}
                </div>
              )
            })}
            {textChannels.length === 0 && <div className="sidebar-empty">Nenhum canal de texto ainda.</div>}
          </div>

          {voiceChannels.length > 0 && (
            <div className="channel-section">
              <div className="channel-section-header">
                <span className="channel-section-caret">▾</span>
                <span>Canais de voz</span>
                {isOwner && (
                  <button className="channel-add" title="Criar canal de voz" onClick={() => openModal('create-channel')}>
                    ＋
                  </button>
                )}
              </div>
    {voiceChannels.map((c) => {
      const active = screen.channelId === c.id
      const joined = voiceChannelId === c.id
      // dentro da sala: roster do VoiceManager; fora: presença observada
      const presence = joined ? voiceRoster : (voicePresence[c.id] ?? [])
      const startedAt = voiceSessions[c.id]
      const activity =
        startedAt && presence.length > 0 ? formatActivity(startedAt, Date.now()) : null
      return (
        <div key={c.id} className="voice-channel-block">
          <div
            className={`channel-item voice-item ${active ? 'active' : ''} ${joined ? 'joined' : ''}`}
            onClick={() => handleVoiceClick(c)}
            title="Abrir canal de voz"
          >
            <span className="voice-icon">🔊</span>
            <span className="channel-name">{c.name}</span>
            {activity && (
              <span className="voice-activity" title={startedAt ? `Sala ativa desde ${new Date(startedAt).toLocaleString('pt-BR')}` : 'Sala ativa'}>· {activity}</span>
            )}
            {joined && <span className="voice-live" title="Você está neste canal">●</span>}
            {isOwner && (
              <span className="channel-actions">
                <button className="channel-edit" title="Renomear canal de voz" onClick={(e) => { e.stopPropagation(); openRenameChannel(c) }}>
                  <PencilIcon size={12} />
                </button>
                {channels.length > 1 && (
                  <button
                    className="channel-delete"
                    title="Excluir canal de voz"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (window.confirm(`Excluir o canal de voz ${c.name}?`)) void handleDeleteChannel(c.id)
                    }}
                  >
                    ✕
                  </button>
                )}
              </span>
            )}
          </div>
          {presence.length > 0 && (
            <div className="voice-channel-members">
              {presence.slice(0, 5).map((u) => (
                <div key={u.userId} className={`voice-channel-member ${joined && speakingUsers.has(u.userId) ? 'speaking' : ''}`} title={u.username}>
                  <span className="voice-channel-member-avatar">
                    <Avatar name={u.username} color={u.avatar_color} size={24} url={u.avatar_url} />
                    {joined && u.userId !== profile?.id && (
                      <span className="voice-channel-member-signal">
                        <SignalBars quality={peerSignals[u.userId] ?? 0} small />
                      </span>
                    )}
                  </span>
                  <span className="voice-channel-member-name">{u.username}</span>
                  <span className="voice-channel-member-flags">
                    {screenShareState.sharerId === u.userId && (
                      <span className="vflag vflag-sharing" title="Compartilhando a tela">
                        <MonitorIcon size={12} />
                      </span>
                    )}
                    {u.muted && (
                      <span className="vflag" title="Microfone silenciado">
                        <MicOffIcon size={12} />
                      </span>
                    )}
                    {u.deafened && (
                      <span className="vflag" title="Sem som (surdo)">
                        <HeadphonesOffIcon size={12} />
                      </span>
                    )}
                  </span>
                </div>
              ))}
              {presence.length > 5 && (
                <div className="voice-channel-more" title={`${presence.length} pessoas neste canal`}>+{presence.length - 5}</div>
              )}
            </div>
          )}
        </div>
      )
    })}
            </div>
          )}
        </div>

        <VoiceConnectedPanel />
        <UserPanel />
      </div>
    )
  }

  // -------- Modo mensagens diretas --------
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button className="sidebar-server-name" onClick={() => openModal('start-dm')} title="Nova conversa">
          <span className="sidebar-server-name-text">Mensagens diretas</span>
          <span className="sidebar-chevron">＋</span>
        </button>
      </div>

      <div className="sidebar-scroll">
        <div className="channel-section">
          <div className="channel-section-header">
            <span className="channel-section-caret">▾</span>
            <span>Conversas</span>
          </div>
          {dms.length === 0 && <div className="sidebar-empty">Nenhuma conversa ainda. Clique em ＋ acima para começar.</div>}
          {dms.map((t) => {
            const active = screen?.type === 'dm' && screen.threadId === t.id
            const online = onlineUsers.has(t.other.id)
            return (
              <div key={t.id} className={`channel-item dm-item ${active ? 'active' : ''}`} onClick={() => selectDm(t.id)}>
                <Avatar name={t.other.username} color={t.other.avatar_color} size={30} online={online} url={t.other.avatar_url} />
                <span className="dm-name">{t.other.username}</span>
                {t.last_message && (
                  <span className="dm-preview">
                    {t.last_message_author === profile?.id ? 'Você: ' : ''}
                    {t.last_message.length > 24 ? `${t.last_message.slice(0, 24)}…` : t.last_message}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <VoiceConnectedPanel />
      <UserPanel />
    </div>
  )
}

/**
 * Painel "em chamada" na base da sidebar (estilo Discord): mostra o indicador
 * de conexão de voz, a barra de ações rápidas, as configurações de microfone
 * e, na parte de baixo, os botões de voz (mudo, surdo e sair). Só aparece
 * enquanto você estiver conectado a um canal de voz.
 */
function VoiceConnectedPanel(): React.JSX.Element | null {
  const {
    profile,
    channels,
    voiceChannelId,
    voiceMuted,
    voiceDeafened,
    internetPing,
    internetQuality,
    leaveVoice,
    toggleVoiceMute,
    toggleVoiceDeafen
  } = useApp()
  const [micSettingsOpen, setMicSettingsOpen] = useState(false)
  const [headphoneSettingsOpen, setHeadphoneSettingsOpen] = useState(false)

  // abrir um card fecha o outro (comportamento acordeão)
  const toggleMicSettings = (): void => {
    setMicSettingsOpen((v) => {
      if (!v) setHeadphoneSettingsOpen(false)
      return !v
    })
  }
  const toggleHeadphoneSettings = (): void => {
    setHeadphoneSettingsOpen((v) => {
      if (!v) setMicSettingsOpen(false)
      return !v
    })
  }

  if (!voiceChannelId || !profile) return null
  const channel = channels.find((c) => c.id === voiceChannelId)
  const signalWord = internetQuality === 0 ? 'sem conexão' : internetQuality === 1 ? 'ruim' : internetQuality === 2 ? 'regular' : internetQuality === 3 ? 'bom' : 'excelente'
  const pingText = internetPing === null ? '—' : `${internetPing} ms`
  const signalQualityClass = internetQuality >= 3 ? 'good' : internetQuality === 2 ? 'ok' : 'bad'

  return (
    <div className="voice-connected-panel">
      <div className="voice-connection-status">
        <BroadcastIcon size={16} className="voice-connection-icon" />
        <div className="voice-connection-text">
          <span className="voice-connection-title">Voz conectada</span>
          <span className="voice-connection-sub">
            {channel?.name ?? 'Canal de voz'} · sinal {signalWord} · {pingText}
          </span>
        </div>
      </div>

      <div className="voice-quick-actions">
        <button className="voice-quick-action" title="Câmera / vídeo" disabled>
          <VideoIcon size={18} />
        </button>
        <ScreenShareButton variant="quick" size={18} />
        <button className="voice-quick-action" title="Atividades">
          <ActivitiesIcon size={18} />
        </button>
        <button className={`voice-quick-action signal ${signalQualityClass}`} title={`Internet: sinal ${signalWord} · ${pingText}`}>
          <RouterIcon size={18} />
        </button>
      </div>

      {micSettingsOpen && <MicPicker />}
      {headphoneSettingsOpen && <OutputPicker />}

      <div className="voice-connected-controls">
        <div className="voice-control-group">
          <button
            className={`voice-control ${voiceMuted ? 'active' : ''}`}
            title={voiceMuted ? 'Ativar microfone' : 'Silenciar microfone'}
            onClick={toggleVoiceMute}
          >
            {voiceMuted ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
          </button>
          <button
            className={`control-settings-toggle ${micSettingsOpen ? 'open' : ''}`}
            title={micSettingsOpen ? 'Ocultar configurações do microfone' : 'Abrir configurações do microfone'}
            onClick={toggleMicSettings}
          >
            <ChevronDownIcon size={12} />
          </button>
        </div>
        <div className="voice-control-group">
          <button
            className={`voice-control ${voiceDeafened ? 'active' : ''}`}
            title={voiceDeafened ? 'Ouvir de novo' : 'Ficar surdo'}
            onClick={toggleVoiceDeafen}
          >
            {voiceDeafened ? <HeadphonesOffIcon size={18} /> : <HeadphonesIcon size={18} />}
          </button>
          <button
            className={`control-settings-toggle ${headphoneSettingsOpen ? 'open' : ''}`}
            title={headphoneSettingsOpen ? 'Ocultar configurações do fone de ouvido' : 'Abrir configurações do fone de ouvido'}
            onClick={toggleHeadphoneSettings}
          >
            <ChevronDownIcon size={12} />
          </button>
        </div>
        <button className="voice-control leave" title="Sair do canal de voz" onClick={() => void leaveVoice()}>
          <PhoneOffIcon size={18} />
        </button>
      </div>
    </div>
  )
}

function UserPanel(): React.JSX.Element {
  const { profile, onlineUsers, logout, updateAvatarUrl, notify } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  if (!profile) return <div className="user-panel" />
  const online = onlineUsers.has(profile.id)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      notify('error', 'O arquivo precisa ser uma imagem.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      notify('error', 'Imagem muito grande (máximo 2 MB).')
      return
    }
    setUploading(true)
    try {
      const url = await uploadAvatar(file)
      updateAvatarUrl(url)
      notify('success', 'Foto de perfil atualizada!')
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Erro ao enviar a imagem')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="user-panel">
      <button
        className="user-avatar-btn"
        title="Alterar foto de perfil"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      >
        <Avatar name={profile.username} color={profile.avatar_color} size={32} online={online} url={profile.avatar_url} />
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e)} />
      <div className="user-info">
        <span className="user-name">{profile.username}</span>
        <span className="user-status">{uploading ? 'Enviando foto…' : online ? 'Online' : 'Offline'}</span>
      </div>
      <div className="user-actions">
        <button className="user-action" title="Configurações">
          <GearIcon size={18} />
        </button>
        <button className="user-action logout" title="Sair" onClick={() => void logout()}>
          <PowerIcon size={18} />
        </button>
      </div>
    </div>
  )
}
