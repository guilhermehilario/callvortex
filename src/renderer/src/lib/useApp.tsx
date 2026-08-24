import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { getSupabase } from './supabase'
import * as api from './api'
import { useVoice } from './useVoice'
import { useScreenShare } from './useScreenShare'
import { useRealtimeSubscriptions } from './realtime'
import { measurePing, qualityFromPing } from './internet'
import { VOICE_REJOIN_MS, readVoiceSession } from './settings'
import type { AppContextValue, AuthState, Notice, SavedCredentials } from './app-types'
import type { Channel, DmThreadWithOther, ModalType, Profile, Screen, Server, ServerEmoji, VoicePeerInfo } from './types'

export type { Notice, SavedCredentials } from './app-types'

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp deve ser usado dentro de <AppProvider>')
  return ctx
}

export function AppProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [savedCredentials, setSavedCredentials] = useState<SavedCredentials | null>(null)
  const [dataReady, setDataReady] = useState(false)
  const [servers, setServers] = useState<Server[]>([])
  const [dms, setDms] = useState<DmThreadWithOther[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [serverEmojis, setServerEmojis] = useState<ServerEmoji[]>([])
  const [screen, setScreen] = useState<Screen | null>(null)
  const [modal, setModal] = useState<ModalType>(null)
  const [renamingChannel, setRenamingChannel] = useState<Channel | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // presença em cada canal de voz (fora da sala) + atividade das salas
  const [voicePresence, setVoicePresence] = useState<Record<string, VoicePeerInfo[]>>({})
  const [voiceSessions, setVoiceSessions] = useState<Record<string, string>>({})
  // ping da conexão com o servidor do app (sinal de internet)
  const [internetPing, setInternetPing] = useState<number | null>(null)

  const notify = useCallback((kind: Notice['kind'], text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice({ kind, text })
    noticeTimer.current = setTimeout(() => setNotice(null), 5000)
  }, [])

  // ------------------------------------------------------------
  // Voz (WebRTC + dispositivos + controles) — hook próprio
  // ------------------------------------------------------------
  const activeServerId = screen?.type === 'server' ? screen.serverId : null
  const voice = useVoice({ profile, activeServerId, notify })

  // ------------------------------------------------------------
  // Compartilhamento de tela (reutiliza a malha WebRTC da voz)
  // ------------------------------------------------------------
  const screenShare = useScreenShare({
    voiceManager: voice.voiceManager,
    profileId: profile?.id ?? null,
    voiceChannelId: voice.voiceChannelId,
    notify
  })

  // ------------------------------------------------------------
  // Realtime (presença, DMs, servidores, canais, voz, perfis)
  // ------------------------------------------------------------
  useRealtimeSubscriptions({
    signedIn: authState === 'signedIn',
    profile,
    activeServerId,
    channels,
    voiceManager: voice.voiceManager,
    onMyProfileUpdate: voice.updateProfile,
    onVoiceChannelDeleted: voice.onJoinedChannelDeleted,
    setOnlineUsers,
    setDms,
    setServers,
    setScreen,
    setChannels,
    setProfile,
    setVoicePresence,
    setVoiceSessions
  })

  // ------------------------------------------------------------
  // Credenciais lembradas ("Lembrar de mim")
  // ------------------------------------------------------------
  useEffect(() => {
    void window.api
      .loadCredentials()
      .then((c) => setSavedCredentials(c))
      .catch(() => setSavedCredentials(null))
  }, [])

  const storeCredentials = useCallback(async (creds: SavedCredentials) => {
    setSavedCredentials(creds)
    await window.api.saveCredentials(creds)
  }, [])

  const forgetCredentials = useCallback(async () => {
    setSavedCredentials(null)
    await window.api.clearCredentials()
  }, [])

  // ------------------------------------------------------------
  // Sessão
  // ------------------------------------------------------------
  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getSession().then(({ data }) => {
      setAuthState(data.session ? 'signedIn' : 'signedOut')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') setAuthState('signedIn')
      if (event === 'SIGNED_OUT') {
        voice.reset()
        setAuthState('signedOut')
        setProfile(null)
        setServers([])
        setDms([])
        setChannels([])
        setOnlineUsers(new Set())
        setScreen(null)
        setDataReady(false)
      }
    })
    return () => sub.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------------------------------------------------------------
  // Carregamento inicial ao entrar
  // ------------------------------------------------------------
  useEffect(() => {
    if (authState !== 'signedIn') return
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        setDataReady(false)
        const supabase = getSupabase()
        const {
          data: { user }
        } = await supabase.auth.getUser()
        if (!user || cancelled) return
        const p = await api.fetchProfile(user.id)
        if (cancelled) return
        setProfile(p)
        const [s, d] = await Promise.all([api.fetchMyServers(), api.fetchDmThreads()])
        if (cancelled) return
        setServers(s)
        setDms(d)
        setDataReady(true)
      } catch (e) {
        notify('error', e instanceof Error ? e.message : 'Erro ao carregar dados')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [authState, notify])

  // ------------------------------------------------------------
  // Emojis personalizados do servidor ativo
  // ------------------------------------------------------------
  useEffect(() => {
    if (authState !== 'signedIn') return
    if (screen?.type !== 'server') {
      setServerEmojis([])
      return
    }
    let cancelled = false
    api
      .fetchServerEmojis(screen.serverId)
      .then((e) => {
        if (!cancelled) setServerEmojis(e)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [authState, screen?.type, screen?.type === 'server' ? screen.serverId : null]) // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------
  // Ações
  // ------------------------------------------------------------
  const login = useCallback(async (email: string, password: string) => {
    await api.signIn(email, password)
  }, [])

  const register = useCallback(async (email: string, password: string, username: string) => {
    const p = await api.signUp(email, password, username)
    setProfile(p)
    setAuthState('signedIn')
  }, [])

  const logout = useCallback(async () => {
    // Sair explicitamente apaga as credenciais lembradas ("Lembrar de mim")
    // para não voltar a entrar automaticamente na tela de login.
    try {
      await forgetCredentials()
    } catch {
      // falha ao apagar as credenciais salvas — encerra a sessão mesmo assim
    }
    const supabase = getSupabase()
    await supabase.auth.signOut()
  }, [forgetCredentials])

  const selectServer = useCallback(async (serverId: string) => {
    const c = await api.fetchChannels(serverId)
    setChannels(c)
    setScreen({ type: 'server', serverId, channelId: c[0]?.id ?? '' })
  }, [])

  const selectChannel = useCallback((channelId: string) => {
    setScreen((prev) => (prev?.type === 'server' ? { ...prev, channelId } : prev))
  }, [])

  const selectDm = useCallback((threadId: string | null) => {
    setScreen({ type: 'dm', threadId })
  }, [])

  // ------------------------------------------------------------
  // Navegação inicial automática
  // Se o usuário estava num canal de voz e saiu há menos de 20 minutos,
  // volta automaticamente para a sala (se a sessão ainda estiver ativa).
  // ------------------------------------------------------------
  useEffect(() => {
    if (authState !== 'signedIn' || !dataReady || screen || !profile) return
    if (servers.length === 0) {
      setScreen({ type: 'dm', threadId: null })
      return
    }
    const saved = readVoiceSession()
    const recent = saved && Date.now() - saved.at < VOICE_REJOIN_MS
    const server = recent && saved ? servers.find((s) => s.id === saved.serverId) : undefined
    if (server && saved) {
      void (async () => {
        try {
          const chs = await api.fetchChannels(server.id)
          const ch = chs.find((c) => c.id === saved.channelId && c.type === 'voice')
          if (!ch) throw new Error('canal de voz não existe mais')
          setChannels(chs)
          setScreen({ type: 'server', serverId: server.id, channelId: ch.id })
          await voice.rejoin(ch.id, profile, saved.serverId)
        } catch {
          // não conseguiu voltar (canal excluído, sem permissão de microfone…) —
          // segue para o servidor normalmente
          void selectServer(servers[0].id)
        }
      })()
    } else {
      void selectServer(servers[0].id)
    }
  }, [authState, dataReady, screen, servers, profile, voice.rejoin, selectServer]) // eslint-disable-line react-hooks/exhaustive-deps

  const openModal = useCallback((m: Exclude<ModalType, null>) => setModal(m), [])
  const closeModal = useCallback(() => {
    setModal(null)
    setRenamingChannel(null)
  }, [])
  const openRenameChannel = useCallback((channel: Channel) => {
    setRenamingChannel(channel)
    setModal('rename-channel')
  }, [])

  const handleCreateServer = useCallback(
    async (name: string): Promise<Server | null> => {
      try {
        const s = await api.createServer(name)
        const list = await api.fetchMyServers()
        setServers(list)
        await selectServer(s.id)
        if (s.invite_code) {
          notify('success', `Servidor criado! Código de convite: ${s.invite_code}`)
        }
        return s
      } catch (e) {
        notify('error', e instanceof Error ? e.message : 'Erro ao criar servidor')
        return null
      }
    },
    [notify, selectServer]
  )

  const handleJoinServer = useCallback(
    async (code: string): Promise<Server | null> => {
      try {
        const s = await api.joinServerByCode(code)
        const list = await api.fetchMyServers()
        setServers(list)
        await selectServer(s.id)
        notify('success', `Você entrou em "${s.name}"!`)
        return s
      } catch (e) {
        notify('error', e instanceof Error ? e.message : 'Não foi possível entrar no servidor')
        return null
      }
    },
    [notify, selectServer]
  )

  const handleCreateChannel = useCallback(
    async (name: string, type: 'text' | 'voice' = 'text') => {
      if (screen?.type !== 'server') return
      try {
        await api.createChannel(screen.serverId, name, type)
        const c = await api.fetchChannels(screen.serverId)
        setChannels(c)
        setScreen({ ...screen, channelId: c[c.length - 1]?.id ?? '' })
        notify('success', `${type === 'voice' ? '🔊' : '#'}${name.trim().replace(/\s+/g, '-').toLowerCase()} criado!`)
      } catch (e) {
        notify('error', e instanceof Error ? e.message : 'Erro ao criar canal')
      }
    },
    [screen, notify]
  )

  const handleDeleteChannel = useCallback(
    async (channelId: string) => {
      if (screen?.type !== 'server') return
      try {
        await api.deleteChannel(channelId)
        const c = await api.fetchChannels(screen.serverId)
        setChannels(c)
        setScreen((prev) => (prev?.type === 'server' && prev.channelId === channelId ? { ...prev, channelId: c[0]?.id ?? '' } : prev))
        notify('success', 'Canal excluído.')
      } catch (e) {
        notify('error', e instanceof Error ? e.message : 'Erro ao excluir canal')
      }
    },
    [screen, notify]
  )

  const handleRenameChannel = useCallback(
    async (channelId: string, name: string) => {
      if (screen?.type !== 'server') return
      try {
        await api.renameChannel(channelId, name)
        const c = await api.fetchChannels(screen.serverId)
        setChannels(c)
        notify('success', 'Canal renomeado!')
      } catch (e) {
        notify('error', e instanceof Error ? e.message : 'Erro ao renomear canal')
      }
    },
    [screen, notify]
  )

  const handleDeleteServer = useCallback(async () => {
    if (screen?.type !== 'server') return
    try {
      await api.deleteServer(screen.serverId)
      const list = await api.fetchMyServers()
      setServers(list)
      setScreen(null)
      if (list.length > 0) await selectServer(list[0].id)
      notify('success', 'Servidor excluído.')
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Erro ao excluir servidor')
    }
  }, [screen, notify, selectServer])

  const sendChannelMessage = useCallback(
    async (channelId: string, content: string) => {
      try {
        await api.sendChannelMessage(channelId, content)
      } catch (e) {
        notify('error', e instanceof Error ? e.message : 'Erro ao enviar mensagem')
      }
    },
    [notify]
  )

  const sendDmMessage = useCallback(
    async (threadId: string, content: string) => {
      try {
        await api.sendDmMessage(threadId, content)
      } catch (e) {
        notify('error', e instanceof Error ? e.message : 'Erro ao enviar mensagem')
      }
    },
    [notify]
  )

  const addEmoji = useCallback(
    async (name: string, file: File): Promise<boolean> => {
      if (screen?.type !== 'server') return false
      try {
        await api.addServerEmoji(screen.serverId, name, file)
        const list = await api.fetchServerEmojis(screen.serverId)
        setServerEmojis(list)
        notify('success', `Emoji :${name.toLowerCase()}: adicionado!`)
        return true
      } catch (e) {
        notify('error', e instanceof Error ? e.message : 'Erro ao adicionar emoji')
        return false
      }
    },
    [screen, notify]
  )

  const removeEmoji = useCallback(
    async (emojiId: string) => {
      if (screen?.type !== 'server') return
      try {
        await api.removeServerEmoji(emojiId)
        setServerEmojis((prev) => prev.filter((e) => e.id !== emojiId))
        notify('success', 'Emoji excluído.')
      } catch (e) {
        notify('error', e instanceof Error ? e.message : 'Erro ao excluir emoji')
      }
    },
    [screen, notify]
  )

  const updateAvatarUrl = useCallback((url: string) => {
    setProfile((prev) => (prev ? { ...prev, avatar_url: url } : prev))
  }, [])

  // ------------------------------------------------------------
  // Sinal de internet: mede o ping até o servidor do app a cada 5s
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    const tick = async (): Promise<void> => {
      const p = await measurePing()
      if (cancelled) return
      setInternetPing((prev) => {
        if (p === null) return null
        if (prev === null) return p
        return Math.round(prev * 0.6 + p * 0.4) // média suave
      })
    }
    void tick()
    const iv = setInterval(() => void tick(), 5000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [])

  const internetQuality = qualityFromPing(internetPing)

  const value = useMemo<AppContextValue>(
    () => ({
      ...voice,
      ...screenShare,
      authState,
      profile,
      servers,
      dms,
      channels,
      onlineUsers,
      screen,
      modal,
      notice,
      login,
      register,
      logout,
      savedCredentials,
      storeCredentials,
      forgetCredentials,
      selectServer,
      selectChannel,
      selectDm,
      openModal,
      closeModal,
      renamingChannel,
      openRenameChannel,
      handleCreateServer,
      handleJoinServer,
      handleCreateChannel,
      handleDeleteChannel,
      handleRenameChannel,
      handleDeleteServer,
      sendChannelMessage,
      sendDmMessage,
      serverEmojis,
      addEmoji,
      removeEmoji,
      updateAvatarUrl,
      voicePresence,
      voiceSessions,
      internetPing,
      internetQuality,
      notify
    }),
    [
      voice,
      screenShare,
      authState,
      profile,
      servers,
      dms,
      channels,
      onlineUsers,
      screen,
      modal,
      notice,
      login,
      register,
      logout,
      savedCredentials,
      storeCredentials,
      forgetCredentials,
      selectServer,
      selectChannel,
      selectDm,
      openModal,
      closeModal,
      renamingChannel,
      openRenameChannel,
      handleCreateServer,
      handleJoinServer,
      handleCreateChannel,
      handleDeleteChannel,
      handleRenameChannel,
      handleDeleteServer,
      sendChannelMessage,
      sendDmMessage,
      serverEmojis,
      addEmoji,
      removeEmoji,
      updateAvatarUrl,
      voicePresence,
      voiceSessions,
      internetPing,
      internetQuality,
      notify
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
