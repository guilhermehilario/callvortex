import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase } from './supabase'
import type { Profile, VoicePeerInfo } from './types'

interface SignalMsg {
  type: 'offer' | 'answer' | 'ice'
  to: string
  from: string
  offer?: RTCSessionDescriptionInit
  answer?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.services.mozilla.com' },
  // TURN público (Open Relay): funciona como "ponte" quando a conexão direta
  // é bloqueada por NAT restrito — essencial para voz entre redes diferentes.
  // É gratuito para testes; para produção, recomenda-se um TURN próprio.
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
]

/**
 * Lista os microfones disponíveis no sistema (entradas de áudio).
 * Os nomes podem vir vazios até o usuário conceder permissão de microfone.
 */
export async function getMicrophones(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'audioinput')
  } catch {
    return []
  }
}

function audioConstraints(deviceId?: string | null): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {})
  }
}

/**
 * Voz por canal usando WebRTC em malha (mesh): cada participante se conecta
 * diretamente aos outros. A sinalização (offer/answer/ICE) e a lista de quem
 * está no canal usam o Realtime do Supabase. O áudio nunca passa pelo Supabase.
 *
 * Regra de conexão: para cada par (eu, outro), quem tem o id menor cria a
 * oferta — isso garante exatamente uma conexão por par, sem corridas.
 */
export class VoiceManager {
  private channelId: string | null = null
  private channel: RealtimeChannel | null = null
  private me: Profile | null = null
  private localStream: MediaStream | null = null
  private pcs = new Map<string, RTCPeerConnection>()
  private audioEls = new Map<string, HTMLAudioElement>()
  private pendingIce = new Map<string, RTCIceCandidateInit[]>()
  private speaking = new Set<string>()
  private localMuted = false
  private deafened = false
  private detectorCleanups = new Map<string, () => void>()
  // volume individual por participante (persiste entre reconexões e chamadas)
  private peerVolumes = new Map<string, number>()
  // qualidade do sinal (0-4) por participante, medida via getStats
  private peerSignals = new Map<string, number>()
  private statsInterval: number | null = null

  onRoster: ((users: VoicePeerInfo[]) => void) | null = null
  onSpeaking: ((userId: string, speaking: boolean) => void) | null = null
  onLocalLevel: ((level: number) => void) | null = null
  onPeerSignal: ((userId: string, quality: number) => void) | null = null
  onError: ((message: string) => void) | null = null

  get joinedChannelId(): string | null {
    return this.channelId
  }

  get isMuted(): boolean {
    return this.localMuted
  }

  get isDeafened(): boolean {
    return this.deafened
  }

  // ------------------------------------------------------------
  // Entrar / sair do canal
  // ------------------------------------------------------------
  async join(channelId: string, me: Profile, preferredDeviceId?: string | null): Promise<void> {
    if (this.channelId === channelId) return
    await this.leave()

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(preferredDeviceId),
        video: false
      })
    } catch {
      throw new Error(
        preferredDeviceId
          ? 'Não foi possível acessar o microfone selecionado. Verifique se ele está conectado e as permissões de áudio do sistema.'
          : 'Não foi possível acessar o microfone. Verifique as permissões de áudio do sistema.'
      )
    }

    this.me = me
    this.localStream = stream
    this.channelId = channelId

    const supabase = getSupabase()
    const ch = supabase.channel(`voice:${channelId}`, {
      config: { presence: { key: me.id }, broadcast: { self: false } }
    })
    this.channel = ch

    const rosterFromState = (): VoicePeerInfo[] => {
      const state = ch.presenceState() as Record<string, { info: VoicePeerInfo }[]>
      const map = new Map<string, VoicePeerInfo>()
      for (const arr of Object.values(state)) {
        for (const p of arr) map.set(p.info.userId, p.info)
      }
      return [...map.values()]
    }

    ch.on('presence', { event: 'sync' }, () => {
      this.onRoster?.(rosterFromState())
      // já existem participantes: quem tem id menor inicia a conexão
      for (const p of rosterFromState()) {
        if (me.id < p.userId) void this.connectTo(p.userId)
      }
    })
      .on('presence', { event: 'join' }, ({ key }) => {
        this.onRoster?.(rosterFromState())
        if (key !== me.id && me.id < key) void this.connectTo(key)
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        this.onRoster?.(rosterFromState())
        if (key !== me.id) this.closePeer(key)
      })
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        const msg = payload as SignalMsg
        if (!msg || msg.to !== me.id) return
        if (msg.type === 'offer' && msg.offer) {
          void this.handleOffer(msg.from, msg.offer)
        } else if (msg.type === 'answer' && msg.answer) {
          void this.handleAnswer(msg.from, msg.answer)
        } else if (msg.type === 'ice' && msg.candidate) {
          this.addIceCandidate(msg.from, msg.candidate)
        }
      })

    void ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ info: { userId: me.id, username: me.username, avatar_color: me.avatar_color, avatar_url: me.avatar_url ?? null } })
      }
    })

    // indicador de fala do próprio microfone
    this.attachSpeakingDetector('me', stream, (s) => this.setSpeaking(me.id, s))

    // mede a qualidade do sinal de cada participante
    this.startStatsPolling()
  }

  async leave(): Promise<void> {
    const channel = this.channel
    this.channel = null
    this.channelId = null
    if (channel) {
      void getSupabase().removeChannel(channel)
    }
    for (const peerId of [...this.pcs.keys()]) this.closePeer(peerId)
    for (const cleanup of this.detectorCleanups.values()) cleanup()
    this.detectorCleanups.clear()
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.localStream = null
    this.me = null
    this.localMuted = false
    this.deafened = false
    this.stopStatsPolling()
    this.peerSignals.clear()
    for (const userId of [...this.speaking]) this.setSpeaking(userId, false)
    this.onRoster?.([])
  }

  // ------------------------------------------------------------
  // Controles locais
  // ------------------------------------------------------------
  /**
   * Troca o microfone durante a chamada: captura o novo dispositivo e
   * substitui a trilha de áudio em todas as conexões ao vivo (sem
   * reconexão — replaceTrack não exige nova negociação).
   */
  async setAudioDevice(deviceId: string): Promise<void> {
    if (!this.localStream || !this.me) {
      throw new Error('Você precisa estar num canal de voz para trocar o microfone.')
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(deviceId),
        video: false
      })
    } catch {
      throw new Error('Não foi possível acessar este microfone. Verifique se ele está conectado e as permissões de áudio do sistema.')
    }

    const newTrack = stream.getAudioTracks()[0]
    for (const pc of this.pcs.values()) {
      for (const sender of pc.getSenders()) {
        if (sender.track?.kind === 'audio') {
          void sender.replaceTrack(newTrack).catch(() => undefined)
        }
      }
    }

    // encerra o stream antigo e passa a usar o novo
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.localStream = stream

    // reinicia o detector de fala com o novo stream
    const cleanup = this.detectorCleanups.get('me')
    if (cleanup) {
      cleanup()
      this.detectorCleanups.delete('me')
    }
    this.attachSpeakingDetector('me', stream, (s) => this.setSpeaking(this.me!.id, s))

    // mantém estado de mudo/surdo no novo microfone
    this.applyLocalTrackState()
  }

  /**
   * Define o volume (0 a 1) com que o áudio de um participante é reproduzido.
   */
  setPeerVolume(peerId: string, volume: number): void {
    const v = Math.min(1, Math.max(0, volume))
    this.peerVolumes.set(peerId, v)
    const el = this.audioEls.get(peerId)
    if (el) el.volume = v
  }

  setLocalMuted(muted: boolean): void {
    this.localMuted = muted
    this.applyLocalTrackState()
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened
    this.audioEls.forEach((el) => {
      el.muted = deafened
    })
    this.applyLocalTrackState()
  }

  private applyLocalTrackState(): void {
    const enabled = !this.localMuted && !this.deafened
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = enabled
    })
  }

  // ------------------------------------------------------------
  // WebRTC
  // ------------------------------------------------------------
  private createPc(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    pc.onicecandidate = (e) => {
      if (e.candidate && this.channel) {
        this.send({ type: 'ice', to: peerId, from: this.me!.id, candidate: e.candidate.toJSON() })
      }
    }

    pc.ontrack = (e) => {
      const [stream] = e.streams
      if (stream) this.attachRemote(peerId, stream)
    }

    pc.onconnectionstatechange = () => {
      // 'disconnected' pode ser só um soluço da rede; só encerra em falha de fato
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(peerId)
      }
    }

    this.localStream?.getTracks().forEach((t) => pc.addTrack(t, this.localStream as MediaStream))
    return pc
  }

  private async connectTo(peerId: string): Promise<void> {
    if (this.pcs.has(peerId)) return
    const pc = this.createPc(peerId)
    this.pcs.set(peerId, pc)
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.send({ type: 'offer', to: peerId, from: this.me!.id, offer: pc.localDescription as RTCSessionDescriptionInit })
    } catch {
      this.closePeer(peerId)
    }
  }

  private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    let pc = this.pcs.get(peerId)
    if (!pc) {
      pc = this.createPc(peerId)
      this.pcs.set(peerId, pc)
    }
    try {
      await pc.setRemoteDescription(offer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.send({ type: 'answer', to: peerId, from: this.me!.id, answer: pc.localDescription as RTCSessionDescriptionInit })
      // candidatos ICE que chegaram antes da resposta
      const queued = this.pendingIce.get(peerId) ?? []
      this.pendingIce.delete(peerId)
      for (const c of queued) void pc.addIceCandidate(c).catch(() => undefined)
    } catch {
      this.closePeer(peerId)
    }
  }

  private async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.pcs.get(peerId)
    if (!pc) return
    try {
      await pc.setRemoteDescription(answer)
      const queued = this.pendingIce.get(peerId) ?? []
      this.pendingIce.delete(peerId)
      for (const c of queued) void pc.addIceCandidate(c).catch(() => undefined)
    } catch {
      this.closePeer(peerId)
    }
  }

  private addIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void {
    const pc = this.pcs.get(peerId)
    if (!pc) return
    if (pc.remoteDescription) {
      void pc.addIceCandidate(candidate).catch(() => undefined)
    } else {
      const q = this.pendingIce.get(peerId) ?? []
      q.push(candidate)
      this.pendingIce.set(peerId, q)
    }
  }

  private attachRemote(peerId: string, stream: MediaStream): void {
    let el = this.audioEls.get(peerId)
    if (!el) {
      el = document.createElement('audio')
      el.autoplay = true
      el.muted = this.deafened
      document.body.appendChild(el)
      this.audioEls.set(peerId, el)
    }
    el.srcObject = stream
    // aplica o volume individual salvo para este participante
    el.volume = this.peerVolumes.get(peerId) ?? 1
    void el.play().catch(() => undefined)
    this.attachSpeakingDetector(peerId, stream, (s) => this.setSpeaking(peerId, s))
  }

  private closePeer(peerId: string): void {
    const pc = this.pcs.get(peerId)
    if (pc) {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      pc.close()
      this.pcs.delete(peerId)
    }
    const el = this.audioEls.get(peerId)
    if (el) {
      el.pause()
      el.srcObject = null
      el.remove()
      this.audioEls.delete(peerId)
    }
    this.pendingIce.delete(peerId)
    const cleanup = this.detectorCleanups.get(peerId)
    if (cleanup) {
      cleanup()
      this.detectorCleanups.delete(peerId)
    }
    this.setSpeaking(peerId, false)
  }

  private setSpeaking(userId: string, speaking: boolean): void {
    const had = this.speaking.has(userId)
    if (speaking) this.speaking.add(userId)
    else this.speaking.delete(userId)
    if (had !== speaking) this.onSpeaking?.(userId, speaking)
  }

  // ------------------------------------------------------------
  // Detecção de fala (simples, via volume do áudio)
  // ------------------------------------------------------------
  private attachSpeakingDetector(key: string, stream: MediaStream, onSpeak: (speaking: boolean) => void): void {
    try {
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      let last = false
      const iv = setInterval(() => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        if (key === 'me') this.onLocalLevel?.(rms)
        const now = rms > 0.06
        if (now !== last) {
          last = now
          onSpeak(now)
        }
      }, 150)
      this.detectorCleanups.set(key, () => {
        clearInterval(iv)
        void audioCtx.close().catch(() => undefined)
      })
    } catch {
      // sem indicador de fala, sem problema
    }
  }

  // ------------------------------------------------------------
  // Qualidade do sinal (via WebRTC getStats)
  // ------------------------------------------------------------
  private startStatsPolling(): void {
    if (this.statsInterval !== null) return
    this.statsInterval = window.setInterval(() => {
      for (const peerId of this.pcs.keys()) void this.pollPeerStats(peerId)
    }, 2000)
  }

  private stopStatsPolling(): void {
    if (this.statsInterval !== null) {
      clearInterval(this.statsInterval)
      this.statsInterval = null
    }
  }

  /**
   * Mede a qualidade da conexão com um participante usando RTT do
   * candidate-pair ativo e perda de pacotes do fluxo de áudio recebido.
   * Retorna 0-4 (0 = sem conexão; 4 = excelente).
   */
  private async pollPeerStats(peerId: string): Promise<void> {
    const pc = this.pcs.get(peerId)
    if (!pc || pc.connectionState === 'closed') return
    try {
      const report = await pc.getStats()
      let rtt: number | null = null
      let packetsLost = 0
      let packetsReceived = 0
      report.forEach((s) => {
        const stat = s as unknown as {
          type: string
          state?: string
          currentRoundTripTime?: number
          kind?: string
          packetsLost?: number
          packetsReceived?: number
        }
        if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && typeof stat.currentRoundTripTime === 'number') {
          rtt = stat.currentRoundTripTime * 1000 // segundos -> ms
        }
        if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
          packetsLost += stat.packetsLost ?? 0
          packetsReceived += stat.packetsReceived ?? 0
        }
      })

      let quality: number
      if (rtt === null) {
        quality = 0 // conexão ainda não estabelecida
      } else {
        const lossRatio = packetsReceived > 0 ? packetsLost / packetsReceived : 0
        if (rtt < 200 && lossRatio < 0.05) quality = 4
        else if (rtt < 350) quality = 3
        else if (rtt < 600) quality = 2
        else quality = 1
      }
      if (this.peerSignals.get(peerId) !== quality) {
        this.peerSignals.set(peerId, quality)
        this.onPeerSignal?.(peerId, quality)
      }
    } catch {
      // stats indisponíveis — mantém o último valor
    }
  }

  private send(msg: SignalMsg): void {
    void this.channel?.send({ type: 'broadcast', event: 'signal', payload: msg })
  }
}
