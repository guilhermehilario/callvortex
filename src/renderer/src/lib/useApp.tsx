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
import { VoiceManager, getMicrophones } from './voice'
import { playDeafenSound, playJoinSound, playLeaveSound, playMuteSound } from './sounds'
import type { Channel, DmThreadWithOther, ModalType, Profile, Screen, Server, ServerEmoji, VoicePeerInfo } from './types'

type AuthState = 'loading' | 'signedOut' | 'signedIn'

export interface Notice {
  kind: 'error' | 'success'
  text: string
}

export interface SavedCredentials {
  email: string
  password: string
  username: string
}

interface AppContextValue {
  authState: AuthState
  profile: Profile | null
  servers: Server[]
  dms: DmThreadWithOther[]
  channels: Channel[]
  onlineUsers: Set<string>
  screen: Screen | null
  modal: ModalType
  notice: Notice | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, username: string) => Promise<void>
  logout: () => Promise<void>
  savedCredentials: SavedCredentials | null
  storeCredentials: (creds: SavedCredentials) => Promise<void>
  forgetCredentials: () => Promise<void>
  selectServer: (serverId: string) => Promise<void>
  selectChannel: (channelId: string) => void
  selectDm: (threadId: string | null) => void
  openModal: (modal: Exclude<ModalType, null>) => void
  closeModal: () => void
  handleCreateServer: (name: string) => Promise<Server | null>
  handleJoinServer: (code: string) => Promise<Server | null>
  handleCreateChannel: (name: string, type: 'text' | 'voice') => Promise<void>
  handleDeleteChannel: (channelId: string) => Promise<void>
  handleDeleteServer: () => Promise<void>
  sendChannelMessage: (channelId: string, content: string) => Promise<void>
  sendDmMessage: (threadId: string, content: string) => Promise<void>
  serverEmojis: ServerEmoji[]
  addEmoji: (name: string, file: File) => Promise<boolean>
  removeEmoji: (emojiId: string) => Promise<void>
  updateAvatarUrl: (url: string) => void
  voiceChannelId: string | null
  voiceRoster: VoicePeerInfo[]
  voiceMuted: boolean
  voiceDeafened: boolean
  speakingUsers: Set<string>
  voiceInputLevel: number
  microphones: MediaDeviceInfo[]
  selectedMicId: string | null
  peerVolumes: Record<string, number>
  setPeerVolume: (userId: string, volume: number) => void
  peerSignals: Record<string, number>
  joinVoice: (channelId: string) => Promise<void>
  leaveVoice: () => Promise<void>
  toggleVoiceMute: () => void
  toggleVoiceDeafen: () => void
  loadMicrophones: () => Promise<void>
  selectMicrophone: (deviceId: string) => Promise<void>
  notify: (kind: Notice['kind'], text: string) => void
}

const MIC_STORAGE_KEY = 'selected-mic-id'
const VOICE_SESSION_KEY = 'voice-session'
const VOICE_REJOIN_MS = 20 * 60 * 1000 // 20 minutos

interface VoiceSession {
  channelId: string
  serverId: string
  at: number
}

function readVoiceSession(): VoiceSession | null {
  try {
    const raw = localStorage.getItem(VOICE_SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as VoiceSession
    return s && typeof s.channelId === 'string' && typeof s.serverId === 'string' ? s : null
  } catch {
    return null
  }
}

function writeVoiceSession(s: VoiceSession): void {
  try {
    localStorage.setItem(VOICE_SESSION_KEY, JSON.stringify(s))
  } catch {
    // armazenamento indisponível — segue sem voltar automaticamente
  }
}

function clearVoiceSession(): void {
  try {
    localStorage.removeItem(VOICE_SESSION_KEY)
  } catch {
    // ignore
  }
}

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
  const [voiceChannelId, setVoiceChannelId] = useState<string | null>(null)
  const [voiceRoster, setVoiceRoster] = useState<VoicePeerInfo[]>([])
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [voiceDeafened, setVoiceDeafened] = useState(false)
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set())
  const [voiceInputLevel, setVoiceInputLevel] = useState(0)
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [selectedMicId, setSelectedMicId] = useState<string | null>(() => localStorage.getItem(MIC_STORAGE_KEY))
  const [peerSignals, setPeerSignals] = useState<Record<string, number>>({})
  const profileRef = useRef<Profile | null>(null)
  const prevVoiceRosterRef = useRef<ReadonlySet<string>>(new Set())
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('peer-volumes')
      return raw ? (JSON.parse(raw) as Record<string, number>) : {}
    } catch {
      return {}
    }
  })
  const [screen, setScreen] = useState<Screen | null>(null)
  const [modal, setModal] = useState<ModalType>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const voiceManagerRef = useRef<VoiceManager | null>(null)
  if (!voiceManagerRef.current) voiceManagerRef.current = new VoiceManager()

  const notify = useCallback((kind: Notice['kind'], text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice({ kind, text })
    noticeTimer.current = setTimeout(() => setNotice(null), 5000)
  }, [])

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

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
        void voiceManagerRef.current?.leave()
        setAuthState('signedOut')
        setProfile(null)
        setServers([])
        setDms([])
        setChannels([])
        setOnlineUsers(new Set())
        setVoiceChannelId(null)
        setVoiceRoster([])
        setSpeakingUsers(new Set())
        setVoiceInputLevel(0)
        setPeerSignals({})
        setScreen(null)
        setDataReady(false)
      }
    })
    return () => sub.subscription.unsubscribe()
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
  // Presença (quem está online)
  // ------------------------------------------------------------
  useEffect(() => {
    if (authState !== 'signedIn' || !profile) return
    const supabase = getSupabase()
    const ch = supabase.channel('online-users', { config: { presence: { key: profile.id } } })
    ch.on('presence', { event: 'sync' }, () => {
      setOnlineUsers(new Set(Object.keys(ch.presenceState())))
    })
      .on('presence', { event: 'join' }, ({ key }) => {
        setOnlineUsers((prev) => {
          const next = new Set(prev)
          next.add(key)
          return next
        })
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setOnlineUsers((prev) => {
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
  }, [authState, profile])

  // ------------------------------------------------------------
  // Realtime: conversas diretas (novo último recado / nova conversa)
  // ------------------------------------------------------------
  useEffect(() => {
    if (authState !== 'signedIn') return
    const supabase = getSupabase()
    const ch = supabase.channel('dms-live')
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_threads' }, () => {
      void api.fetchDmThreads().then(setDms).catch(() => undefined)
    })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_threads' }, () => {
        void api.fetchDmThreads().then(setDms).catch(() => undefined)
      })
    void ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [authState])

  // ------------------------------------------------------------
  // Realtime: servidores excluídos por outra pessoa
  // ------------------------------------------------------------
  useEffect(() => {
    if (authState !== 'signedIn') return
    const supabase = getSupabase()
    const ch = supabase.channel('servers-live')
    ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'servers' }, () => {
      void api.fetchMyServers().then((s) => {
        setServers(s)
        setScreen((prev) => {
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
  }, [authState])

  // ------------------------------------------------------------
  // Realtime: canais do servidor ativo (criados/excluídos)
  // ------------------------------------------------------------
  useEffect(() => {
    if (authState !== 'signedIn' || screen?.type !== 'server') return
    const serverId = screen.serverId
    const supabase = getSupabase()
    const ch = supabase.channel(`channels-${serverId}`)
    const refresh = async (): Promise<Channel[]> => {
      const c = await api.fetchChannels(serverId)
      setChannels(c)
      return c
    }
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channels', filter: `server_id=eq.${serverId}` }, () => {
      void refresh().catch(() => undefined)
    })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'channels', filter: `server_id=eq.${serverId}` }, (payload) => {
        const deletedId = (payload.old as { id?: string } | undefined)?.id
        if (deletedId && deletedId === voiceManagerRef.current?.joinedChannelId) {
          void voiceManagerRef.current?.leave()
          setVoiceChannelId(null)
          setVoiceRoster([])
          setSpeakingUsers(new Set())
        }
        void refresh().then((c) => {
          setScreen((prev) => {
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
  }, [authState, screen?.type, screen?.type === 'server' ? screen.serverId : null]) // eslint-disable-line react-hooks/exhaustive-deps

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
  // Sincroniza meu próprio perfil (foto/username) entre janelas
  // ------------------------------------------------------------
  useEffect(() => {
    if (authState !== 'signedIn' || !profile) return
    const supabase = getSupabase()
    const ch = supabase.channel('profile-live')
    ch.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` },
      (payload) => {
        const row = payload.new as Partial<Profile>
        if (row.username) setProfile((prev) => (prev ? { ...prev, ...row } : prev))
      }
    )
    void ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [authState, profile?.id])

  // ------------------------------------------------------------
  // Ações
  // ------------------------------------------------------------
  const login = useCallback(
    async (email: string, password: string) => {
      await api.signIn(email, password)
    },
    []
  )

  const register = useCallback(async (email: string, password: string, username: string) => {
    const p = await api.signUp(email, password, username)
    setProfile(p)
    setAuthState('signedIn')
  }, [])

  const logout = useCallback(async () => {
    const supabase = getSupabase()
    await supabase.auth.signOut()
  }, [])

  const selectServer = useCallback(async (serverId: string) => {
    const c = await api.fetchChannels(serverId)
    setChannels(c)
    setScreen({ type: 'server', serverId, channelId: c[0]?.id ?? '' })
  }, [])

  const selectChannel = useCallback(
    (channelId: string) => {
      setScreen((prev) => (prev?.type === 'server' ? { ...prev, channelId } : prev))
    },
    []
  )

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
          await voiceManagerRef.current!.join(ch.id, profile, selectedMicId)
          setVoiceChannelId(ch.id)
          setVoiceMuted(false)
          setVoiceDeafened(false)
          playJoinSound()
          notify('success', 'Você voltou ao canal de voz!')
        } catch {
          // não conseguiu voltar (canal excluído, sem permissão de microfone…) —
          // segue para o servidor normalmente
          void selectServer(servers[0].id)
        }
      })()
    } else {
      void selectServer(servers[0].id)
    }
  }, [authState, dataReady, screen, servers, profile, selectServer, notify])

  const openModal = useCallback((m: Exclude<ModalType, null>) => setModal(m), [])
  const closeModal = useCallback(() => setModal(null), [])

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
  // Voz (WebRTC)
  // ------------------------------------------------------------
  useEffect(() => {
    const m = voiceManagerRef.current
    if (!m) return
    m.onRoster = (users) => {
      setVoiceRoster(users)
      // efeitos sonoros: quem entrou/saiu da sala (exceto eu — o meu som
      // é tocado em joinVoice/leaveVoice)
      const meId = profileRef.current?.id
      const ids = new Set(users.map((u) => u.userId))
      const prev = prevVoiceRosterRef.current
      for (const u of users) {
        if (!prev.has(u.userId) && u.userId !== meId) playJoinSound()
      }
      for (const id of prev) {
        if (!ids.has(id) && id !== meId) playLeaveSound()
      }
      prevVoiceRosterRef.current = ids
    }
    m.onSpeaking = (userId, speaking) => {
      setSpeakingUsers((prev) => {
        const next = new Set(prev)
        if (speaking) next.add(userId)
        else next.delete(userId)
        return next
      })
    }
    m.onLocalLevel = (level) => setVoiceInputLevel(level)
    m.onPeerSignal = (userId, quality) => {
      setPeerSignals((prev) => (prev[userId] === quality ? prev : { ...prev, [userId]: quality }))
    }
    m.onError = (msg) => notify('error', msg)
    return () => {
      void m.leave()
      m.onRoster = null
      m.onSpeaking = null
      m.onLocalLevel = null
      m.onPeerSignal = null
      m.onError = null
    }
  }, [notify])

  // ------------------------------------------------------------
  // Microfones disponíveis (atualiza quando dispositivos mudam)
  // ------------------------------------------------------------
  const loadMicrophones = useCallback(async () => {
    const mics = await getMicrophones()
    setMicrophones(mics)
    setSelectedMicId((prev) => {
      if (prev && mics.some((m) => m.deviceId === prev)) return prev
      return mics[0]?.deviceId ?? null
    })
  }, [])

  useEffect(() => {
    void loadMicrophones()
    if (!navigator.mediaDevices?.addEventListener) return
    const onChange = (): void => void loadMicrophones()
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange)
  }, [loadMicrophones])

  const selectMicrophone = useCallback(
    async (deviceId: string) => {
      setSelectedMicId(deviceId)
      localStorage.setItem(MIC_STORAGE_KEY, deviceId)
      if (voiceManagerRef.current?.joinedChannelId) {
        try {
          await voiceManagerRef.current.setAudioDevice(deviceId)
          notify('success', 'Microfone alterado!')
        } catch (e) {
          notify('error', e instanceof Error ? e.message : 'Não foi possível trocar o microfone')
        }
      }
    },
    [notify]
  )

  const joinVoice = useCallback(
    async (channelId: string) => {
      if (!profile) return
      if (voiceManagerRef.current?.joinedChannelId === channelId) return
      const serverId = screen?.type === 'server' ? screen.serverId : null
      try {
        await voiceManagerRef.current!.join(channelId, profile, selectedMicId)
        setVoiceChannelId(channelId)
        setVoiceMuted(false)
        setVoiceDeafened(false)
        // guarda a sala para voltar automaticamente (se fechar o app)
        if (serverId) writeVoiceSession({ channelId, serverId, at: Date.now() })
        playJoinSound()
        notify('success', 'Você entrou no canal de voz!')
      } catch (e) {
        notify('error', e instanceof Error ? e.message : 'Erro ao entrar no canal de voz')
      }
    },
    [profile, selectedMicId, screen, notify]
  )

  const leaveVoice = useCallback(async () => {
    await voiceManagerRef.current?.leave()
    setVoiceChannelId(null)
    setVoiceRoster([])
    setSpeakingUsers(new Set())
    setVoiceInputLevel(0)
    setPeerSignals({})
    clearVoiceSession()
    prevVoiceRosterRef.current = new Set()
    playLeaveSound()
  }, [])

  // mantém o horário da sessão de voz fresco enquanto estiver no canal
  // (assim "saiu há menos de 20 min" vale a partir do fechamento do app)
  useEffect(() => {
    if (!voiceChannelId) return
    const iv = setInterval(() => {
      const s = readVoiceSession()
      if (s && s.channelId === voiceChannelId) writeVoiceSession({ ...s, at: Date.now() })
    }, 60 * 1000)
    return () => clearInterval(iv)
  }, [voiceChannelId])

  const toggleVoiceMute = useCallback(() => {
    setVoiceMuted((prev) => {
      const next = !prev
      voiceManagerRef.current?.setLocalMuted(next)
      return next
    })
    playMuteSound()
  }, [])

  const toggleVoiceDeafen = useCallback(() => {
    setVoiceDeafened((prev) => {
      const next = !prev
      voiceManagerRef.current?.setDeafened(next)
      return next
    })
    playDeafenSound()
  }, [])

  const setPeerVolume = useCallback((userId: string, volume: number) => {
    setPeerVolumes((prev) => {
      const next = { ...prev, [userId]: volume }
      try {
        localStorage.setItem('peer-volumes', JSON.stringify(next))
      } catch {
        // armazenamento indisponível — segue só em memória
      }
      return next
    })
    voiceManagerRef.current?.setPeerVolume(userId, volume)
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
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
      handleCreateServer,
      handleJoinServer,
      handleCreateChannel,
      handleDeleteChannel,
      handleDeleteServer,
      sendChannelMessage,
      sendDmMessage,
      serverEmojis,
      addEmoji,
      removeEmoji,
      updateAvatarUrl,
      voiceChannelId,
      voiceRoster,
      voiceMuted,
      voiceDeafened,
      speakingUsers,
      voiceInputLevel,
      microphones,
      selectedMicId,
      peerVolumes,
      setPeerVolume,
      peerSignals,
      joinVoice,
      leaveVoice,
      toggleVoiceMute,
      toggleVoiceDeafen,
      loadMicrophones,
      selectMicrophone,
      notify
    }),
    [
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
      handleCreateServer,
      handleJoinServer,
      handleCreateChannel,
      handleDeleteChannel,
      handleDeleteServer,
      sendChannelMessage,
      sendDmMessage,
      serverEmojis,
      addEmoji,
      removeEmoji,
      updateAvatarUrl,
      voiceChannelId,
      voiceRoster,
      voiceMuted,
      voiceDeafened,
      speakingUsers,
      voiceInputLevel,
      microphones,
      selectedMicId,
      peerVolumes,
      setPeerVolume,
      peerSignals,
      joinVoice,
      leaveVoice,
      toggleVoiceMute,
      toggleVoiceDeafen,
      loadMicrophones,
      selectMicrophone,
      notify
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
