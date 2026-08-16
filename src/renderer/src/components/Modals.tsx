import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/useApp'
import { getOrCreateDmThread, searchUsers } from '../lib/api'
import type { Profile } from '../lib/types'
import Avatar from './Avatar'

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="modal-card" ref={ref}>
        <h2 className="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function CreateServerModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { handleCreateServer } = useApp()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (busy || name.trim().length < 2) return
    setBusy(true)
    const s = await handleCreateServer(name)
    setBusy(false)
    if (s) onClose()
  }

  return (
    <ModalShell title="Criar servidor" onClose={onClose}>
      <form onSubmit={submit} className="modal-form">
        <p className="modal-hint">Dê um nome para o servidor. Você poderá convidar amigos com um código.</p>
        <input className="modal-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Turma do Zap" maxLength={32} autoFocus />
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={busy || name.trim().length < 2}>
            Criar
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function JoinServerModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { handleJoinServer } = useApp()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (busy || code.trim().length < 4) return
    setBusy(true)
    setError(null)
    const s = await handleJoinServer(code)
    setBusy(false)
    if (s) onClose()
    else setError('Código inválido. Peça o código de convite para o dono do servidor.')
  }

  return (
    <ModalShell title="Entrar em um servidor" onClose={onClose}>
      <form onSubmit={submit} className="modal-form">
        <p className="modal-hint">Peça o código de convite para um amigo e cole aqui embaixo.</p>
        <input
          className="modal-input code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          placeholder="ABCDEF"
          maxLength={8}
          autoFocus
        />
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={busy || code.trim().length < 4}>
            Entrar
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function CreateChannelModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { handleCreateChannel } = useApp()
  const [name, setName] = useState('')
  const [type, setType] = useState<'text' | 'voice'>('text')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (busy || name.trim().length < 1) return
    setBusy(true)
    await handleCreateChannel(name, type)
    setBusy(false)
    onClose()
  }

  return (
    <ModalShell title="Criar canal" onClose={onClose}>
      <form onSubmit={submit} className="modal-form">
        <p className="modal-hint">Os canais separam as conversas por assunto dentro do servidor.</p>
        <div className="channel-type-picker">
          <button type="button" className={`channel-type-option ${type === 'text' ? 'active' : ''}`} onClick={() => setType('text')}>
            <span className="channel-type-icon">📝</span>
            <span className="channel-type-label">Texto</span>
          </button>
          <button type="button" className={`channel-type-option ${type === 'voice' ? 'active' : ''}`} onClick={() => setType('voice')}>
            <span className="channel-type-icon">🔊</span>
            <span className="channel-type-label">Voz</span>
          </button>
        </div>
        <div className="modal-input-prefix">
          <span>{type === 'voice' ? '🔊' : '#'}</span>
          <input className="modal-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'voice' ? 'sala-da-galera' : 'novo-canal'} maxLength={32} autoFocus />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={busy || name.trim().length < 1}>
            Criar
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function StartDmModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { selectDm, notify } = useApp()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      void searchUsers(query).then(setResults).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const open = async (p: Profile): Promise<void> => {
    setBusy(true)
    try {
      const threadId = await getOrCreateDmThread(p.id)
      selectDm(threadId)
      onClose()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Erro ao abrir conversa')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Nova conversa" onClose={onClose}>
      <div className="modal-form">
        <p className="modal-hint">Procure um amigo pelo nome de usuário.</p>
        <input
          className="modal-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar usuário…"
          autoFocus
        />
        <div className="dm-results">
          {query.trim().length >= 2 && results.length === 0 && <div className="modal-hint">Ninguém encontrado.</div>}
          {results.map((p) => (
            <button key={p.id} className="dm-result" disabled={busy} onClick={() => void open(p)}>
              <Avatar name={p.username} color={p.avatar_color} size={32} url={p.avatar_url} />
              <span>{p.username}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function ManageEmojisModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { serverEmojis, addEmoji, removeEmoji } = useApp()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const pickFile = (): void => {
    const emojiName = name.trim() || undefined
    if (emojiName !== undefined && !/^[\w+-]+$/.test(emojiName)) {
      setError('Nome inválido: use apenas letras, números, _ ou - (ex: risada).')
      return
    }
    setError(null)
    fileRef.current?.click()
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('O arquivo precisa ser uma imagem.')
      return
    }
    if (file.size > 512 * 1024) {
      setError('Imagem muito grande (máximo 512 KB).')
      return
    }
    const emojiName =
      name.trim() || file.name.split('.')[0].toLowerCase().replace(/[^\w+-]/g, '') || 'emoji'
    if (!/^[\w+-]+$/.test(emojiName)) {
      setError('Nome inválido: use apenas letras, números, _ ou - (ex: risada).')
      return
    }
    setBusy(true)
    const ok = await addEmoji(emojiName, file)
    setBusy(false)
    if (ok) {
      setName('')
      setError(null)
    }
  }

  return (
    <ModalShell title="Emojis do servidor" onClose={onClose}>
      <div className="modal-form">
        <p className="modal-hint">
          Envie uma imagem (até 512 KB). Ela vira o emoji <code>:nome:</code>, que todos os membros podem usar nas mensagens.
        </p>
        <div className="emoji-add-row">
          <input
            className="modal-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nome (ex: risada)"
            maxLength={24}
          />
          <button className="btn-primary" onClick={pickFile} disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e)} />
        {error && <div className="modal-error">{error}</div>}
        <div className="emoji-list">
          {serverEmojis.length === 0 && <div className="modal-hint">Nenhum emoji ainda. Adicione o primeiro acima!</div>}
          {serverEmojis.map((e) => (
            <div key={e.id} className="emoji-list-item">
              <img className="emoji-list-img" src={e.url} alt={`:${e.name}:`} />
              <span className="emoji-list-name">:{e.name}:</span>
              <button className="emoji-list-delete" title="Excluir emoji" onClick={() => void removeEmoji(e.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

export default function Modals(): React.JSX.Element | null {
  const { modal, closeModal } = useApp()
  if (!modal) return null
  switch (modal) {
    case 'create-server':
      return <CreateServerModal onClose={closeModal} />
    case 'join-server':
      return <JoinServerModal onClose={closeModal} />
    case 'create-channel':
      return <CreateChannelModal onClose={closeModal} />
    case 'start-dm':
      return <StartDmModal onClose={closeModal} />
    case 'manage-emojis':
      return <ManageEmojisModal onClose={closeModal} />
    default:
      return null
  }
}
