import { useRef, useState } from 'react'
import { uploadAvatar } from '../lib/api'
import type { Channel } from '../lib/types'
import { useApp } from '../lib/useApp'
import Avatar from './Avatar'

export default function ChannelSidebar(): React.JSX.Element {
  const {
    screen,
    channels,
    servers,
    dms,
    profile,
    onlineUsers,
    voiceChannelId,
    selectChannel,
    selectDm,
    openModal,
    handleDeleteChannel,
    handleDeleteServer
  } = useApp()

  const [menuOpen, setMenuOpen] = useState(false)

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
                  {isOwner && channels.length > 1 && (
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
                return (
                  <div
                    key={c.id}
                    className={`channel-item voice-item ${active ? 'active' : ''} ${joined ? 'joined' : ''}`}
                    onClick={() => handleVoiceClick(c)}
                    title="Abrir canal de voz"
                  >
                    <span className="voice-icon">🔊</span>
                    <span className="channel-name">{c.name}</span>
                    {joined && <span className="voice-live" title="Você está neste canal">●</span>}
                    {isOwner && channels.length > 1 && (
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
                  </div>
                )
              })}
            </div>
          )}
        </div>

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

      <UserPanel />
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
      <button className="user-logout" title="Sair" onClick={() => void logout()}>
        ⏻
      </button>
    </div>
  )
}
