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

// URL do módulo do supressor de ruído (AudioWorklet) — cache compartilhado
// entre o VoiceManager e o teste de microfone, para carregar o blob só uma vez.
let noiseModuleUrlCache: string | null = null
export function getNoiseSuppressorModuleUrl(): string {
  if (noiseModuleUrlCache) return noiseModuleUrlCache
  const blob = new Blob([NOISE_WORKLET_SOURCE], { type: 'application/javascript' })
  noiseModuleUrlCache = URL.createObjectURL(blob)
  return noiseModuleUrlCache
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
 * Processador de áudio (AudioWorklet) carregado via blob: — roda no thread
 * de áudio do navegador, em tempo real. Faz:
 *  1. Supressão de ruído por subtração espectral (com piso de ruído
 *     estimado dinamicamente e suavização do ganho);
 *  2. Corte de graves/rumble (bins abaixo de ~150 Hz);
 *  3. AGC leve (normaliza o volume com suavização).
 */
const NOISE_WORKLET_SOURCE = `
class NoiseSuppressor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.N = 256
    this.H = 128
    this.buf = new Float32Array(this.N)
    this.out = new Float32Array(this.N)
    this.win = new Float32Array(this.N)
    for (let i = 0; i < this.N; i++) this.win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (this.N - 1)))
    this.re = new Float32Array(this.N)
    this.im = new Float32Array(this.N)
    this.noise = new Float32Array(this.N / 2 + 1)
    this.noise.fill(1e-4)
    this.prevMag = new Float32Array(this.N / 2 + 1)
    this.gain = new Float32Array(this.N / 2 + 1)
    this.gain.fill(1)
    this.rms = 1e-4
    this.agc = 1
  }
  process(inputs, outputs) {
    const input = inputs[0]
    const output = outputs[0]
    if (!input || !input[0] || !output || !output[0]) return true
    const x = input[0]
    const y = output[0]
    const N = this.N
    const H = this.H
    for (let i = 0; i < N - H; i++) this.buf[i] = this.buf[i + H]
    for (let i = 0; i < H; i++) this.buf[i + N - H] = x[i]
    for (let i = 0; i < N; i++) {
      this.re[i] = this.buf[i] * this.win[i]
      this.im[i] = 0
    }
    this.fft(this.re, this.im, false)
    const half = N / 2
    for (let i = 0; i <= half; i++) {
      const mag = Math.sqrt(this.re[i] * this.re[i] + this.im[i] * this.im[i])
      const sm = 0.8 * this.prevMag[i] + 0.2 * mag
      this.prevMag[i] = sm
      const n = this.noise[i]
      if (sm < n) this.noise[i] = n * 0.92 + sm * 0.08
      else this.noise[i] = Math.min(n * 1.0008, sm * 1.5)
      // Filtro de Wiener suave: ganho por SNR com piso — remove ruído sem
      // criar os artefatos "metalizados" da subtração espectral dura
      const snr = Math.max((sm - n) / Math.max(n, 1e-6), 0)
      const g = Math.max(snr / (snr + 1), 0.15)
      // suavização forte entre quadros (menos shimmer/musical noise)
      const gs = 0.9 * this.gain[i] + 0.1 * g
      this.gain[i] = gs
      let g2 = gs
      if (i === 0) g2 = 0
      else if (i === 1) g2 *= 0.25
      this.re[i] *= g2
      this.im[i] *= g2
    }
    this.fft(this.re, this.im, true)
    let rms = 0
    for (let i = 0; i < N; i++) rms += this.re[i] * this.re[i]
    rms = Math.sqrt(rms / N)
    this.rms = 0.92 * this.rms + 0.08 * (rms + 1e-6)
    let agc = 0.13 / this.rms
    if (agc > 2) agc = 2
    else if (agc < 0.5) agc = 0.5
    this.agc = 0.95 * this.agc + 0.05 * agc
    for (let i = 0; i < N; i++) this.out[i] += this.re[i] * this.win[i] * this.agc
    for (let i = 0; i < H; i++) y[i] = this.out[i]
    for (let i = 0; i < N - H; i++) this.out[i] = this.out[i + H]
    for (let i = N - H; i < N; i++) this.out[i] = 0
    return true
  }
  fft(re, im, inverse) {
    const n = re.length
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1
      for (; j & bit; bit >>= 1) j ^= bit
      j ^= bit
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t
        t = im[i]; im[i] = im[j]; im[j] = t
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = ((2 * Math.PI) / len) * (inverse ? 1 : -1)
      const wRe = Math.cos(ang)
      const wIm = Math.sin(ang)
      for (let i = 0; i < n; i += len) {
        let curRe = 1
        let curIm = 0
        const half = len >> 1
        for (let k = 0; k < half; k++) {
          const uRe = re[i + k]
          const uIm = im[i + k]
          const vRe = re[i + k + half] * curRe - im[i + k + half] * curIm
          const vIm = re[i + k + half] * curIm + im[i + k + half] * curRe
          re[i + k] = uRe + vRe
          im[i + k] = uIm + vIm
          re[i + k + half] = uRe - vRe
          im[i + k + half] = uIm - vIm
          const nRe = curRe * wRe - curIm * wIm
          curIm = curRe * wIm + curIm * wRe
          curRe = nRe
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n }
  }
}
registerProcessor('noise-suppressor', NoiseSuppressor)
`

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
  // supressão de ruído / melhoria de qualidade (AudioWorklet)
  private noiseSuppression = true
  private audioCtx: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private processedStream: MediaStream | null = null
  // volume do próprio microfone (0-1) aplicado ao áudio enviado
  private micVolume = 1
  private sendGain: GainNode | null = null

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

    // monta a cadeia de envio (supressão de ruído + volume do microfone);
    // se falhar, segue com o mic cru
    await this.startProcessing()

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
    await this.stopProcessing()
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

    // encerra o stream antigo e passa a usar o novo
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.localStream = stream

    // reconstrói a cadeia (processada ou crua) e troca a trilha enviada
    await this.rebuildSendTrack()

    // reinicia o detector de fala com o novo stream
    const cleanup = this.detectorCleanups.get('me')
    if (cleanup) {
      cleanup()
      this.detectorCleanups.delete('me')
    }
    this.attachSpeakingDetector('me', stream, (s) => this.setSpeaking(this.me!.id, s))
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

  /**
   * Define o volume (0 a 1) do próprio microfone, aplicado em tempo real ao
   * áudio enviado para os participantes (via nó de ganho na cadeia de envio).
   */
  setMicVolume(volume: number): void {
    this.micVolume = Math.min(1, Math.max(0, volume))
    if (this.sendGain) this.sendGain.gain.value = this.micVolume
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
    this.processedStream?.getAudioTracks().forEach((t) => {
      t.enabled = enabled
    })
  }

  // ------------------------------------------------------------
  // Supressão de ruído / melhoria de qualidade
  // ------------------------------------------------------------
  /** Liga/desliga a redução de ruído; se estiver numa chamada, troca na hora. */
  async setNoiseSuppression(enabled: boolean): Promise<void> {
    this.noiseSuppression = enabled
    if (!this.channelId || !this.localStream) return // aplica no próximo join
    await this.rebuildSendTrack()
  }

  /** A trilha que vai para os pares: a processada (com ganho) ou o mic cru. */
  private getSendTrack(): MediaStreamTrack | null {
    const t = this.processedStream?.getAudioTracks()[0]
    if (t) return t
    return this.localStream?.getAudioTracks()[0] ?? null
  }

  /** (Re)constrói a cadeia de processamento e troca a trilha enviada. */
  private async rebuildSendTrack(): Promise<void> {
    await this.stopProcessing()
    const ok = await this.startProcessing()
    if (!ok && this.noiseSuppression) {
      this.onError?.('Não foi possível ativar a redução de ruído neste dispositivo — usando áudio normal.')
    }
    const track = this.getSendTrack()
    if (!track) return
    for (const pc of this.pcs.values()) {
      for (const sender of pc.getSenders()) {
        if (sender.track?.kind === 'audio') void sender.replaceTrack(track).catch(() => undefined)
      }
    }
    this.applyLocalTrackState()
  }

  private async startProcessing(): Promise<boolean> {
    try {
      const src = this.localStream
      if (!src) return false
      const ctx = new AudioContext()
      this.audioCtx = ctx
      if (ctx.state === 'suspended') void ctx.resume()
      const source = ctx.createMediaStreamSource(src)
      // cadeia: fonte → [supressor de ruído?] → ganho (volume) → destino
      let node: AudioNode = source
      if (this.noiseSuppression) {
        await ctx.audioWorklet.addModule(getNoiseSuppressorModuleUrl())
        const worklet = new AudioWorkletNode(ctx, 'noise-suppressor', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1]
        })
        this.workletNode = worklet
        source.connect(worklet)
        node = worklet
      }
      const gain = ctx.createGain()
      gain.gain.value = this.micVolume
      node.connect(gain)
      this.sendGain = gain
      const dest = ctx.createMediaStreamDestination()
      gain.connect(dest)
      this.processedStream = dest.stream
      return true
    } catch {
      await this.stopProcessing().catch(() => undefined)
      return false
    }
  }

  private async stopProcessing(): Promise<void> {
    this.processedStream?.getTracks().forEach((t) => t.stop())
    this.processedStream = null
    this.sendGain = null
    if (this.workletNode) {
      try {
        this.workletNode.disconnect()
      } catch {
        // ignore
      }
      this.workletNode = null
    }
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => undefined)
      this.audioCtx = null
    }
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

    const track = this.getSendTrack()
    if (track) pc.addTrack(track, this.localStream as MediaStream)
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
