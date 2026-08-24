import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { VoiceManager, getMicrophones, getOutputDevices } from './voice'
import { playDeafenSound, playJoinSound, playLeaveSound, playMuteSound } from './sounds'
import type { Notice } from './app-types'
import type { Profile, VoicePeerInfo } from './types'
import {
  MIC_STORAGE_KEY,
  MIC_VOLUME_KEY,
  NOISE_SUPPRESSION_KEY,
  OUTPUT_DEVICE_KEY,
  OUTPUT_VOLUME_KEY,
  PEER_VOLUMES_KEY,
  clearVoiceSession,
  readClampedNumber,
  readJson,
  readRaw,
  readVoiceSession,
  writeJson,
  writeRaw,
  writeVoiceSession
} from './settings'

interface UseVoiceDeps {
  profile: Profile | null
  /** id do servidor ativo (null fora de um servidor) — usado para registrar a sessão de voz */
  activeServerId: string | null
  notify: (kind: Notice['kind'], text: string) => void
}

export interface VoiceApi {
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
  micVolume: number
  setMicVolume: (volume: number) => void
  outputDevices: MediaDeviceInfo[]
  selectedOutputId: string | null
  outputVolume: number
  loadOutputDevices: () => Promise<void>
  selectOutputDevice: (deviceId: string) => Promise<void>
  setOutputVolume: (volume: number) => void
  noiseSuppression: boolean
  setNoiseSuppression: (enabled: boolean) => Promise<void>
  joinVoice: (channelId: string) => Promise<void>
  leaveVoice: () => Promise<void>
  /** volta automática para a sala (rejoin) — aplica as configurações atuais */
  rejoin: (channelId: string, me: Profile, serverId?: string | null) => Promise<void>
  /** limpa o estado de voz sem som nem sessão (ex.: saiu da conta) */
  reset: () => void
  /** canal em que eu estava foi excluído — sai da sala silenciosamente */
  onJoinedChannelDeleted: () => void
  /** nome/foto do meu perfil mudou ao vivo — propaga para a sala */
  updateProfile: (p: Profile) => void
  toggleVoiceMute: () => void
  toggleVoiceDeafen: () => void
  loadMicrophones: () => Promise<void>
  selectMicrophone: (deviceId: string) => Promise<void>
  voiceManager: VoiceManager | null
}

/**
 * Estado e ações de voz (WebRTC + dispositivos + controles).
 * Centraliza o VoiceManager e tudo que ele alimenta no contexto.
 */
export function useVoice({ profile, activeServerId, notify }: UseVoiceDeps): VoiceApi {
  const voiceManagerRef = useRef<VoiceManager | null>(null)
  if (!voiceManagerRef.current) voiceManagerRef.current = new VoiceManager()

  // Diagnóstico em dev: inspeção ao vivo da malha de voz via CDP
  if (import.meta.env.DEV) {
    ;(window as unknown as { __voice?: VoiceManager }).__voice = voiceManagerRef.current
  }

  const profileRef = useRef<Profile | null>(profile)
  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  const prevVoiceRosterRef = useRef<ReadonlySet<string>>(new Set())

  const [voiceChannelId, setVoiceChannelId] = useState<string | null>(null)
  const [voiceRoster, setVoiceRoster] = useState<VoicePeerInfo[]>([])
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [voiceDeafened, setVoiceDeafened] = useState(false)
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set())
  const [voiceInputLevel, setVoiceInputLevel] = useState(0)
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [selectedMicId, setSelectedMicId] = useState<string | null>(() => readRaw(MIC_STORAGE_KEY))
  const [noiseSuppression, setNoiseSuppressionState] = useState<boolean>(() => {
    const v = readRaw(NOISE_SUPPRESSION_KEY)
    return v === null ? true : v === '1'
  })
  const [micVolume, setMicVolumeState] = useState<number>(() => readClampedNumber(MIC_VOLUME_KEY, 1, 0, 1))
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(() => readRaw(OUTPUT_DEVICE_KEY))
  const [outputVolume, setOutputVolumeState] = useState<number>(() => readClampedNumber(OUTPUT_VOLUME_KEY, 1, 0, 1))
  const [peerSignals, setPeerSignals] = useState<Record<string, number>>({})
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>(() => readJson<Record<string, number>>(PEER_VOLUMES_KEY) ?? {})

  // ------------------------------------------------------------
  // Callbacks do VoiceManager → estado do contexto
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

  // ------------------------------------------------------------
  // Dispositivos de saída disponíveis
  // ------------------------------------------------------------
  const loadOutputDevices = useCallback(async () => {
    const devices = await getOutputDevices()
    setOutputDevices(devices)
  }, [])

  useEffect(() => {
    void loadOutputDevices()
    if (!navigator.mediaDevices?.addEventListener) return
    const onChange = (): void => void loadOutputDevices()
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange)
  }, [loadOutputDevices])

  // ------------------------------------------------------------
  // Ações de voz
  // ------------------------------------------------------------
  const selectMicrophone = useCallback(
    async (deviceId: string) => {
      setSelectedMicId(deviceId)
      writeRaw(MIC_STORAGE_KEY, deviceId)
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
      const me = profileRef.current
      if (!me) return
      if (voiceManagerRef.current?.joinedChannelId === channelId) return
      const serverId = activeServerId
      try {
        await voiceManagerRef.current!.join(channelId, me, selectedMicId, activeServerId)
        voiceManagerRef.current!.setMicVolume(micVolume)
        if (selectedOutputId) void voiceManagerRef.current!.setOutputDevice(selectedOutputId)
        voiceManagerRef.current!.setOutputVolume(outputVolume)
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
    [activeServerId, selectedMicId, micVolume, selectedOutputId, outputVolume, notify]
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

  const rejoin = useCallback(
    async (channelId: string, me: Profile, serverId?: string | null) => {
      await voiceManagerRef.current!.join(channelId, me, selectedMicId, serverId)
      voiceManagerRef.current!.setMicVolume(micVolume)
      if (selectedOutputId) void voiceManagerRef.current!.setOutputDevice(selectedOutputId)
      voiceManagerRef.current!.setOutputVolume(outputVolume)
      setVoiceChannelId(channelId)
      setVoiceMuted(false)
      setVoiceDeafened(false)
      playJoinSound()
      notify('success', 'Você voltou ao canal de voz!')
    },
    [selectedMicId, micVolume, selectedOutputId, outputVolume, notify]
  )

  const reset = useCallback(() => {
    void voiceManagerRef.current?.leave()
    setVoiceChannelId(null)
    setVoiceRoster([])
    setSpeakingUsers(new Set())
    setVoiceInputLevel(0)
    setPeerSignals({})
  }, [])

  const onJoinedChannelDeleted = useCallback(() => {
    void voiceManagerRef.current?.leave()
    setVoiceChannelId(null)
    setVoiceRoster([])
    setSpeakingUsers(new Set())
  }, [])

  const updateProfile = useCallback((p: Profile) => {
    if (profileRef.current?.id === p.id) {
      void voiceManagerRef.current?.updateProfile({ ...profileRef.current, ...p })
    }
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

  const setNoiseSuppression = useCallback(async (enabled: boolean) => {
    setNoiseSuppressionState(enabled)
    writeRaw(NOISE_SUPPRESSION_KEY, enabled ? '1' : '0')
    await voiceManagerRef.current?.setNoiseSuppression(enabled)
  }, [])

  const setMicVolume = useCallback((volume: number) => {
    const v = Math.min(1, Math.max(0, volume))
    setMicVolumeState(v)
    writeRaw(MIC_VOLUME_KEY, String(v))
    voiceManagerRef.current?.setMicVolume(v)
  }, [])

  const selectOutputDevice = useCallback(async (deviceId: string) => {
    setSelectedOutputId(deviceId)
    writeRaw(OUTPUT_DEVICE_KEY, deviceId)
    await voiceManagerRef.current?.setOutputDevice(deviceId)
  }, [])

  const setOutputVolume = useCallback((volume: number) => {
    const v = Math.min(1, Math.max(0, volume))
    setOutputVolumeState(v)
    writeRaw(OUTPUT_VOLUME_KEY, String(v))
    voiceManagerRef.current?.setOutputVolume(v)
  }, [])

  const setPeerVolume = useCallback((userId: string, volume: number) => {
    setPeerVolumes((prev) => {
      const next = { ...prev, [userId]: volume }
      writeJson(PEER_VOLUMES_KEY, next)
      return next
    })
    voiceManagerRef.current?.setPeerVolume(userId, volume)
  }, [])

  return useMemo<VoiceApi>(
    () => ({
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
      micVolume,
      setMicVolume,
      outputDevices,
      selectedOutputId,
      outputVolume,
      loadOutputDevices,
      selectOutputDevice,
      setOutputVolume,
      noiseSuppression,
      setNoiseSuppression,
      joinVoice,
      leaveVoice,
      rejoin,
      reset,
      onJoinedChannelDeleted,
      updateProfile,
      toggleVoiceMute,
      toggleVoiceDeafen,
      loadMicrophones,
      selectMicrophone,
      voiceManager: voiceManagerRef.current
    }),
    [
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
      micVolume,
      setMicVolume,
      outputDevices,
      selectedOutputId,
      outputVolume,
      loadOutputDevices,
      selectOutputDevice,
      setOutputVolume,
      noiseSuppression,
      setNoiseSuppression,
      joinVoice,
      leaveVoice,
      rejoin,
      reset,
      onJoinedChannelDeleted,
      updateProfile,
      toggleVoiceMute,
      toggleVoiceDeafen,
      loadMicrophones,
      selectMicrophone
    ]
  )
}
