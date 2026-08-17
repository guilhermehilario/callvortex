import { useEffect, useState } from 'react'
import { fetchMembers } from '../lib/api'
import { getSupabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { useApp } from '../lib/useApp'
import Avatar from './Avatar'

export default function MemberList({ serverId }: { serverId: string }): React.JSX.Element | null {
  const { onlineUsers } = useApp()
  const [members, setMembers] = useState<Profile[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setMembers([])
    setError(false)
    fetchMembers(serverId)
      .then((m) => {
        if (!cancelled) setMembers(m)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [serverId])

  // nome/foto de usuário mudou: atualiza a lista de membros ao vivo
  useEffect(() => {
    const supabase = getSupabase()
    const ch = supabase.channel(`members-live-${serverId}`)
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
      const p = payload.new as Profile
      setMembers((prev) => prev.map((m) => (m.id === p.id ? { ...m, ...p } : m)))
    })
    void ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [serverId])

  const online = members.filter((m) => onlineUsers.has(m.id))
  const offline = members.filter((m) => !onlineUsers.has(m.id))

  return (
    <aside className="member-list">
      <div className="member-list-header">
        Membros — {members.length} ({online.length} online)
      </div>
      <div className="member-list-scroll">
        {error && <div className="sidebar-empty">Não foi possível carregar membros.</div>}
        {online.map((m) => (
          <div key={m.id} className="member-item">
            <Avatar name={m.username} color={m.avatar_color} size={32} online url={m.avatar_url} />
            <span className="member-name">{m.username}</span>
          </div>
        ))}
        {offline.map((m) => (
          <div key={m.id} className="member-item">
            <Avatar name={m.username} color={m.avatar_color} size={32} online={false} url={m.avatar_url} />
            <span className="member-name muted">{m.username}</span>
          </div>
        ))}
        {members.length === 0 && !error && <div className="sidebar-empty">Carregando membros…</div>}
      </div>
    </aside>
  )
}
