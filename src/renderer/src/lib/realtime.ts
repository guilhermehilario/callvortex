import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase, getSupabaseObserver } from './supabase'
import * as api from './api'
import type { Channel, DmThreadWithOther, Profile, Screen, Server, VoicePeerInfo } from './types'
import type { VoiceManager } from './voice'

export interface RealtimeDeps {
  signedIn: boolean
  profile: Profile | null
  /** id do servidor ativo (null fora de um servidor) */
  activeServerId: string | null
  channels: Channel[]
  voiceManager: VoiceManager | null
  /** nome/foto do meu perfil mudou ao vivo — propaga para a sala de voz */
  onMyProfileUpdate: (p: Profile) => void
  /** o canal em que eu estava foi excluído */
  onVoiceChannelDeleted: () => void
  setOnlineUsers: Dispatch<SetStateAction<Set<string>>>
  setDms: Dispatch<SetStateAction<DmThreadWithOther[]>>
  setServers: Dispatch<SetStateAction<Server[]>>
  setScreen: Dispatch<SetStateAction<Screen | null>>
  setChannels: Dispatch<SetStateAction<Channel[]>>
  setProfile: Dispatch<SetStateAction<Profile | null>>
  setVoicePresence: Dispatch<SetStateAction<Record<string, VoicePeerInfo[]>>>
  setVoiceSessions: Dispatch<SetStateAction<Record<string, string>>>
}

/**
 * Todas as assinaturas Realtime do app, num único módulo coeso.
 * Cada efeito é independente e replica o comportamento original 1:1.
 */
export function useRealtimeSubscriptions(deps: RealtimeDeps): void {
  const { signedIn, profile, activeServerId, channels, voiceManager } = deps

  // ------------------------------------------------------------
  // Presença (quem está online)
  // ------------------------------------------------------------
  useEffect(() => {
    if (!signedIn || !profile) return
    const supabase = getSupabase()
    const ch = supabase.channel('online-users', { config: { presence: { key: profile.id } } })
    ch.on('presence', { event: 'sync' }, () => {
      deps.setOnlineUsers(new Set(Object.keys(ch.presenceState())))
    })
      .on('presence', { event: 'join' }, ({ key }) => {
        deps.setOnlineUsers((prev) => {
          const next = new Set(prev)
          next.add(key)
          return next
        })
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        deps.setOnlineUsers((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      })
    void ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ online: true })
    })
    return () => {
      void supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, profile?.id])

  // ------------------------------------------------------------
  // Realtime: conversas diretas (novo último recado / nova conversa)
  // ------------------------------------------------------------
  useEffect(() => {
    if (!signedIn) return
    const supabase = getSupabase()
    const ch = supabase.channel('dms-live')
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_threads' }, () => {
      void api.fetchDmThreads().then(deps.setDms).catch(() => undefined)
    })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_threads' }, () => {
        void api.fetchDmThreads().then(deps.setDms).catch(() => undefined)
      })
    void ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn])

  // ------------------------------------------------------------
  // Realtime: servidores excluídos por outra pessoa
  // ------------------------------------------------------------
  useEffect(() => {
    if (!signedIn) return
    const supabase = getSupabase()
    const ch = supabase.channel('servers-live')
    ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'servers' }, () => {
      void api.fetchMyServers().then((s) => {
        deps.setServers(s)
        deps.setScreen((prev) => {
          if (prev?.type === 'server' && !s.some((x) => x.id === prev.serverId)) {
            return null // efeito de navegação automática escolhe o próximo
          }
          return prev
        })
      })
    })
    void ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn])

  // ------------------------------------------------------------
  // Realtime: canais do servidor ativo (criados/renomeados/excluídos)
  // ------------------------------------------------------------
  useEffect(() => {
    if (!signedIn || !activeServerId) return
    const serverId = activeServerId
    const supabase = getSupabase()
    const ch = supabase.channel(`channels-${serverId}`)
    const refresh = async (): Promise<Channel[]> => {
      const c = await api.fetchChannels(serverId)
      deps.setChannels(c)
      return c
    }
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channels', filter: `server_id=eq.${serverId}` }, () => {
      void refresh().catch(() => undefined)
    })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'channels', filter: `server_id=eq.${serverId}` }, () => {
        // renomeação de canal propaga para todos os clientes ao vivo
        void refresh().catch(() => undefined)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'channels', filter: `server_id=eq.${serverId}` }, (payload) => {
        const deletedId = (payload.old as { id?: string } | undefined)?.id
        if (deletedId && deletedId === voiceManager?.joinedChannelId) {
          deps.onVoiceChannelDeleted()
        }
        void refresh().then((c) => {
          deps.setScreen((prev) => {
            if (prev?.type === 'server' && prev.channelId === deletedId) {
              return { ...prev, channelId: c[0]?.id ?? '' }
            }
            return prev
          })
        })
      })
    void ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, activeServerId, voiceManager])

  // ------------------------------------------------------------
  // Presença nos canais de voz + atividade das salas
  // Mostra quem está em cada canal de voz mesmo sem estar dentro,
  // e o tempo de atividade ao lado do nome do canal.
  // Usa um cliente Supabase separado (getSupabaseObserver): o Realtime
  // reutiliza a instância de canal por tópico, então observar os tópicos
  // voice:* com o mesmo cliente do VoiceManager faria o join() falhar
  // ao tentar registrar callbacks de presence depois do subscribe().
  // ------------------------------------------------------------
  useEffect(() => {
    if (!signedIn || !activeServerId) {
      deps.setVoicePresence({})
      deps.setVoiceSessions({})
      return
    }
    const supabase = getSupabaseObserver()
    const voiceChannels = channels.filter((c) => c.type === 'voice')
    const presenceSubs: RealtimeChannel[] = []
    let cancelled = false

    // 1) presença por canal (quem está em cada sala) — assinatura leve,
    //    sem entrar no canal de áudio (não chama track()). O observador não
    //    persiste sessão, então copia o token atual antes de assinar.
    void (async () => {
      const { data } = await getSupabase().auth.getSession()
      if (cancelled) return
      if (data.session) supabase.realtime.setAuth(data.session.access_token)

      for (const c of voiceChannels) {
        const ch = supabase.channel(`voice:${c.id}`, {
          config: { presence: { key: profile?.id ?? 'display' } }
        })
        const apply = (): void => {
          if (cancelled) return
          const state = ch.presenceState() as Record<string, { info?: VoicePeerInfo }[]>
          const map = new Map<string, VoicePeerInfo>()
          for (const arr of Object.values(state)) {
            for (const p of arr) {
              if (p.info && p.info.userId) map.set(p.info.userId, p.info)
            }
          }
          deps.setVoicePresence((prev) => {
            const prevIds = new Set((prev[c.id] ?? []).map((u) => u.userId))
            const ids = new Set(map.keys())
            if (prevIds.size === ids.size && [...prevIds].every((id) => ids.has(id))) return prev
            return { ...prev, [c.id]: [...map.values()] }
          })
        }
        ch.on('presence', { event: 'sync' }, apply)
          .on('presence', { event: 'join' }, apply)
          .on('presence', { event: 'leave' }, apply)
        void ch.subscribe()
        presenceSubs.push(ch)
      }
    })()

    // 2) sessões ativas (started_at de cada canal) — consulta leve a cada 30 s
    const refreshSessions = async (): Promise<void> => {
      const ids = voiceChannels.map((c) => c.id)
      const sessions = await api.fetchVoiceSessions(ids)
      if (!cancelled) deps.setVoiceSessions(sessions)
    }
    void refreshSessions().catch(() => undefined)
    const iv = setInterval(() => void refreshSessions().catch(() => undefined), 30_000)

    return () => {
      cancelled = true
      clearInterval(iv)
      for (const ch of presenceSubs) void supabase.removeChannel(ch)
      deps.setVoicePresence((prev) => {
        const next = { ...prev }
        for (const c of voiceChannels) delete next[c.id]
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, activeServerId, channels, profile?.id])

  // ------------------------------------------------------------
  // Realtime: perfis (nome/foto de usuário) ao vivo
  // Qualquer alteração de username/avatar propaga para:
  //   - meu próprio perfil (ex.: outra janela do app)
  //   - conversas diretas (nome/foto do outro participante)
  //   - minha presença no canal de voz (nome que os outros veem)
  // (autores de mensagens e lista de membros têm assinaturas
  //  próprias em ChatArea e MemberList)
  // ------------------------------------------------------------
  useEffect(() => {
    if (!signedIn) return
    const supabase = getSupabase()
    const ch = supabase.channel('profiles-live')
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
      const p = payload.new as Profile
      // meu próprio perfil (ex.: troquei o nome/avatar em outra janela)
      deps.setProfile((prev) => (prev && prev.id === p.id ? { ...prev, ...p } : prev))
      // conversas diretas: atualiza o perfil do outro participante
      deps.setDms((prev) => prev.map((t) => (t.other.id === p.id ? { ...t, other: { ...t.other, ...p } } : t)))
      // minha presença no canal de voz: os outros veem o novo nome/foto
      deps.onMyProfileUpdate(p)
    })
    void ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn])
}
