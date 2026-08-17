import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'
import { deleteDmMessage, deleteMessage, fetchDmMessages, fetchMessages } from '../lib/api'
import type { Profile, ServerEmoji } from '../lib/types'
import { useApp } from '../lib/useApp'
import Avatar from './Avatar'
import VoiceChannelScreen from './VoiceChannelScreen'

type Msg = { id: number; author_id: string; content: string; created_at: string; author: Profile }

interface RenderItem {
  kind: 'day' | 'msg'
  label?: string
  msg?: Msg
  grouped?: boolean
}

const EMOJIS = [
  '😀', '😂', '🤣', '😊', '😍', '🤔', '😎', '🥳', '😅', '🥺',
  '😢', '😡', '😴', '🤯', '🫡', '👍', '👎', '🙏', '👋', '🤝',
  '🔥', '❤️', '💯', '🎉', '✅', '❌', '⚡', '☕', '🍕', '🍺',
  '🎮', '🐶', '🐱', '🚀', '🌟', '💀', '💜', '🍀', '🎵', '👀'
]

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function renderContent(content: string, emojis: ServerEmoji[]): React.ReactNode[] {
  const parts = content.split(/(:[\w+-]+:)/g)
  return parts.map((part, i) => {
    const m = part.match(/^:([\w+-]+):$/)
    if (m) {
      const emoji = emojis.find((e) => e.name === m[1])
      if (emoji) {
        return <img key={i} className="inline-emoji" src={emoji.url} alt={part} title={part} />
      }
    }
    return <span key={i}>{part}</span>
  })
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const start = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(now) - start(d)) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

export default function ChatArea(): React.JSX.Element {
  const { screen, channels, dms, profile, onlineUsers, sendChannelMessage, sendDmMessage, serverEmojis } = useApp()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const nearBottomRef = useRef(true)
  const profileCache = useRef<Map<string, Profile>>(new Map())

  const screenKey =
    screen?.type === 'server' ? `s:${screen.channelId}` : screen?.type === 'dm' ? `d:${screen.threadId ?? ''}` : 'none'

  // ------------------------------------------------------------
  // Carregar mensagens + assinar realtime
  // ------------------------------------------------------------
  useEffect(() => {
    setMessages([])
    setLoading(true)
    nearBottomRef.current = true
    const supabase = getSupabase()
    let ch: RealtimeChannel | null = null
    let cancelled = false

    const ensureAuthor = async (authorId: string): Promise<Profile> => {
      const cached = profileCache.current.get(authorId)
      if (cached) return cached
      const { data } = await supabase.from('profiles').select('id, username, avatar_color, avatar_url').eq('id', authorId).maybeSingle()
      const p = (data as Profile | null) ?? { id: authorId, username: 'desconhecido', avatar_color: '#5865f2' }
      profileCache.current.set(authorId, p)
      return p
    }

    const applyInsert = async (row: { id: number; author_id: string; content: string; created_at: string }): Promise<void> => {
      const author = await ensureAuthor(row.author_id)
      if (cancelled) return
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev
        return [...prev, { ...row, author }]
      })
    }

    // alguém trocou o nome/foto: atualiza o cache e as mensagens já na tela
    const applyProfileUpdate = (p: Profile): void => {
      const cached = profileCache.current.get(p.id)
      profileCache.current.set(p.id, { ...(cached ?? { id: p.id, username: 'desconhecido', avatar_color: '#5865f2' }), ...p })
      setMessages((prev) => prev.map((m) => (m.author_id === p.id ? { ...m, author: { ...m.author, ...p } } : m)))
    }

    if (screen?.type === 'server' && screen.channelId) {
      const channelId = screen.channelId
      void fetchMessages(channelId)
        .then((msgs) => {
          if (cancelled) return
          setMessages(msgs)
          setLoading(false)
        })
        .catch(() => {
          if (!cancelled) setLoading(false)
        })
      ch = supabase.channel(`channel-msgs-${channelId}`)
      ch.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          void applyInsert(payload.new as { id: number; author_id: string; content: string; created_at: string })
        }
      )
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
          const id = (payload.old as { id?: number })?.id
          if (id) setMessages((prev) => prev.filter((m) => m.id !== id))
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
          applyProfileUpdate(payload.new as Profile)
        })
      void ch.subscribe()
    } else if (screen?.type === 'dm' && screen.threadId) {
      const threadId = screen.threadId
      void fetchDmMessages(threadId)
        .then((msgs) => {
          if (cancelled) return
          setMessages(msgs)
          setLoading(false)
        })
        .catch(() => {
          if (!cancelled) setLoading(false)
        })
      ch = supabase.channel(`dm-msgs-${threadId}`)
      ch.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${threadId}` },
        (payload) => {
          void applyInsert(payload.new as { id: number; author_id: string; content: string; created_at: string })
        }
      )
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
          const id = (payload.old as { id?: number })?.id
          if (id) setMessages((prev) => prev.filter((m) => m.id !== id))
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
          applyProfileUpdate(payload.new as Profile)
        })
      void ch.subscribe()
    } else {
      setLoading(false)
    }

    return () => {
      cancelled = true
      if (ch) void supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey])

  // ------------------------------------------------------------
  // Auto-scroll
  // ------------------------------------------------------------
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const last = messages[messages.length - 1]
    if (nearBottomRef.current || (last && last.author_id === profile?.id)) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, profile?.id])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150
  }

  // ------------------------------------------------------------
  // Renderização das mensagens (agrupadas, com separadores de dia)
  // ------------------------------------------------------------
  const items: RenderItem[] = []
  let prev: Msg | null = null
  for (const m of messages) {
    const day = dayLabel(m.created_at)
    if (!prev || dayLabel(prev.created_at) !== day) items.push({ kind: 'day', label: day })
    const grouped =
      !!prev && prev.author_id === m.author_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000
    items.push({ kind: 'msg', msg: m, grouped })
    prev = m
  }

  // ------------------------------------------------------------
  // Cabeçalho
  // ------------------------------------------------------------
  let title = ''
  let subtitle: React.ReactNode = null
  let placeholder = 'Mensagem…'
  if (screen?.type === 'server') {
    const channel = channels.find((c) => c.id === screen.channelId)
    title = channel ? `# ${channel.name}` : ''
    subtitle = screen.channelId ? 'Canal de texto' : 'Nenhum canal ainda'
    placeholder = screen.channelId ? `Mensagem para #${channel?.name ?? ''}` : 'Mensagem…'
  } else if (screen?.type === 'dm') {
    const thread = dms.find((t) => t.id === screen.threadId)
    if (thread) {
      title = `@ ${thread.other.username}`
      subtitle = onlineUsers.has(thread.other.id) ? 'Online' : 'Offline'
      placeholder = `Mensagem para @${thread.other.username}`
    } else {
      title = 'Mensagens diretas'
      subtitle = 'Selecione uma conversa para começar'
    }
  }

  const submit = (): void => {
    const text = input.trim()
    if (!text) return
    if (screen?.type === 'server' && screen.channelId) {
      void sendChannelMessage(screen.channelId, text)
    } else if (screen?.type === 'dm' && screen.threadId) {
      void sendDmMessage(screen.threadId, text)
    } else {
      return
    }
    setInput('')
    setEmojiOpen(false)
    inputRef.current?.focus()
  }

  const removeMessage = (m: Msg): void => {
    if (screen?.type === 'server') void deleteMessage(m.id)
    else if (screen?.type === 'dm') void deleteDmMessage(m.id)
  }

  const chatEnabled = (screen?.type === 'server' && !!screen.channelId) || (screen?.type === 'dm' && !!screen.threadId)

  // Canal de voz: mostra a tela própria em vez do chat de texto
  const activeChannel = screen?.type === 'server' ? channels.find((c) => c.id === screen.channelId) : undefined
  if (activeChannel?.type === 'voice') {
    return <VoiceChannelScreen channel={activeChannel} />
  }

  return (
    <section className="chat">
      <header className="chat-header">
        <div className="chat-title">
          {title}
          {subtitle && <span className="chat-subtitle">{subtitle}</span>}
        </div>
      </header>

      <div className="chat-messages" ref={scrollRef} onScroll={onScroll}>
        {loading && <div className="chat-hint">Carregando mensagens…</div>}
        {!loading && items.length === 0 && chatEnabled && (
          <div className="chat-hint">Nenhuma mensagem ainda. Seja a primeira pessoa a escrever! 💬</div>
        )}
        {!loading && items.length === 0 && !chatEnabled && <div className="chat-hint">{subtitle}</div>}

        {items.map((item, i) => {
          if (item.kind === 'day') {
            return (
              <div className="day-separator" key={`day-${i}`}>
                <span>{item.label}</span>
              </div>
            )
          }
          const m = item.msg as Msg
          const isMine = m.author_id === profile?.id
          return (
            <div className={`message-row ${item.grouped ? 'grouped' : ''}`} key={`${m.id}-${i}`}>
              {!item.grouped && (
                <div className="message-avatar">
                  <Avatar name={m.author.username} color={m.author.avatar_color} size={40} url={m.author.avatar_url} />
                </div>
              )}
              <div className="message-body">
                {!item.grouped && (
                  <div className="message-meta">
                    <span className="message-author" style={{ color: m.author.avatar_color }}>
                      {m.author.username}
                    </span>
                    <span className="message-time">{formatTime(m.created_at)}</span>
                  </div>
                )}
                <div className="message-content">{renderContent(m.content, serverEmojis)}</div>
              </div>
              {isMine && (
                <button className="message-delete" title="Excluir mensagem" onClick={() => removeMessage(m)}>
                  🗑
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="chat-input-area">
        {emojiOpen && (
          <div className="emoji-panel">
            {screen?.type === 'server' && serverEmojis.length > 0 && (
              <>
                <div className="emoji-panel-section">Emojis do servidor</div>
                {serverEmojis.map((e) => (
                  <button
                    key={e.id}
                    className="emoji-btn"
                    title={`:${e.name}:`}
                    onClick={() => {
                      setInput((v) => v + `:${e.name}:`)
                      inputRef.current?.focus()
                    }}
                  >
                    <img className="emoji-img" src={e.url} alt={`:${e.name}:`} />
                  </button>
                ))}
                <div className="emoji-panel-section">Emojis padrão</div>
              </>
            )}
            {EMOJIS.map((e) => (
              <button
                key={e}
                className="emoji-btn"
                onClick={() => {
                  setInput((v) => v + e)
                  inputRef.current?.focus()
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="chat-input-box">
          <button className="chat-emoji-toggle" title="Emojis" onClick={() => setEmojiOpen((v) => !v)}>
            😀
          </button>
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            placeholder={placeholder}
            rows={1}
            disabled={!chatEnabled}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
        </div>
      </div>
    </section>
  )
}
