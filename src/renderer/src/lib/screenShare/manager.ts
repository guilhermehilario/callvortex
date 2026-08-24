/**
 * Orquestrador do compartilhamento de tela.
 *
 * Compõe responsabilidades já isoladas:
 *  - capture.ts    → captura (Electron/getUserMedia)
 *  - signaling.ts  → sinalização + estado protegidos por RLS
 *  - VoiceManager  → RTCPeerConnections da chamada (áudio + vídeo na malha)
 *
 * Fluxo autorizado (nunca captura antes de validar no banco — seção 16):
 *   beginStart()   → rpc start_screen_share: autorização + regra "um por vez"
 *   startWithSource() → captura da fonte escolhida → publica trilha nos PCs
 *                      → renegocia via call_signals → heartbeat no banco
 *   stop()         → remove trilha, renegocia, libera a reserva, limpa tudo
 */
import { getSupabase } from '../supabase'
import type { VoiceManager } from '../voice'
import { captureScreenSource } from './capture'
import { ScreenShareSignaling, type ScreenSignal } from './signaling'
import { INITIAL_SCREEN_SHARE_STATE, type ScreenShareState } from './types'

const HEARTBEAT_MS = 30_000

/** Diagnóstico em dev: aparece no terminal via encaminhamento do console. */
function dbg(...args: unknown[]): void {
  if (import.meta.env.DEV) console.debug('[screen-share]', ...args)
}

/** Rejeita se a promessa não resolver em ms — evita silêncio eterno. */
function withTimeout<T>(p: PromiseLike<T>, ms = 10_000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('O Supabase não respondeu a tempo.')), ms))
  ])
}

export class ScreenShareManager {
  private state: ScreenShareState = INITIAL_SCREEN_SHARE_STATE
  private voice: VoiceManager | null = null
  private signaling = new ScreenShareSignaling()
  private channelId: string | null = null
  private myId: string | null = null
  /** token anti-corrida: só a operação mais recente pode alterar o estado */
  private opToken = 0
  private heartbeat: number | null = null
  private endedHandler: (() => void) | null = null
  /** guarda o clique: se 'starting' não evoluir, reseta com aviso */
  private startGuard: number | null = null
  private destroyed = false
  /**
   * Vídeo que chegou antes da confirmação oficial de quem compartilha
   * (ontrack pode vencer a sinalização): guardado por par e aplicado quando
   * o sharerId bater — garante que a tela SEMPRE aparece para todos.
   */
  private pendingRemoteScreens = new Map<string, MediaStream>()

  onChange: ((state: ScreenShareState) => void) | null = null

  // ------------------------------------------------------------
  // Ciclo de vida / integração com o VoiceManager
  // ------------------------------------------------------------
  attach(voice: VoiceManager): void {
    this.voice = voice
    voice.onRemoteScreen = (peerId, stream) => {
      if (this.state.status === 'sharing' && this.state.localStream) return // sou eu quem compartilha
      if (stream === null) {
        const wasSharer = this.state.sharerId === peerId
        this.pendingRemoteScreens.delete(peerId)
        if (wasSharer) this.patch({ remoteStream: null })
        return
      }
      if (this.state.sharerId && this.state.sharerId !== peerId) {
        // vídeo de quem não é o compartilhador oficial — guarda: pode ser o
        // stream chegando antes da confirmação de quem compartilha
        this.pendingRemoteScreens.set(peerId, stream)
        return
      }
      this.patch({ remoteStream: stream })
    }
    voice.onPeerConnectionState = (peerId, connectionState) => {
      const relevant = this.state.sharerId === peerId || (this.state.status === 'sharing' && !!this.state.localStream)
      if (relevant) this.patch({ connectionState })
    }
    // participante conectou depois do início do compartilhamento com uma
    // oferta só de áudio — envia renegociação com o vídeo para ele
    voice.onScreenRenegotiationNeeded = (peerId) => {
      void this.renegotiateScreenTo(peerId)
    }
    this.signaling.onSignal = (signal) => void this.handleSignal(signal)
    this.signaling.onSharerChange = (sharerId) => {
      if (this.destroyed) return
      if (sharerId && sharerId !== this.myId) {
        // outro participante começou a compartilhar
        if (this.state.status === 'sharing') return // conflito já bloqueado pelo banco
        this.patch({ sharerId })
        // se o vídeo já havia chegado antes da confirmação, aplica agora
        const pending = this.pendingRemoteScreens.get(sharerId)
        if (pending) {
          this.pendingRemoteScreens.delete(sharerId)
          this.patch({ remoteStream: pending })
        }
      } else if (!sharerId) {
        this.handleRemoteStopped()
      }
    }
  }

  detach(): void {
    if (this.voice) this.voice.onScreenRenegotiationNeeded = null
    this.voice = null
  }

  /**
   * Renegociação de tela para um par específico que entrou durante o
   * compartilhamento (oferta dele não tinha vídeo). Melhor esforço:
   * qualquer falha apenas mantém o par sem vídeo, como antes.
   */
  private async renegotiateScreenTo(peerId: string): Promise<void> {
    const voice = this.voice
    if (!voice || !this.channelId) return
    if (this.state.status !== 'sharing' || !this.state.localStream) return
    try {
      const desc = await voice.screenOfferFor(peerId)
      if (!desc) return
      await this.signaling.sendSignal(this.channelId, peerId, 'screen-offer', { sdp: desc })
    } catch {
      // par pode ter saído no meio do processo — ignora
    }
  }

  destroy(): void {
    this.destroyed = true
    ++this.opToken
    this.stopHeartbeat()
    this.clearEndedHandler()
    this.pendingRemoteScreens.clear()
    this.signaling.destroy()
    this.state = INITIAL_SCREEN_SHARE_STATE
    this.onChange = null
  }

  getState(): ScreenShareState {
    return this.state
  }

  private patch(partial: Partial<ScreenShareState>): void {
    this.state = { ...this.state, ...partial }
    this.onChange?.(this.state)
  }

  // ------------------------------------------------------------
  // Sessão segura por canal (entro/saio do canal de voz)
  // ------------------------------------------------------------
  enterChannel(channelId: string, myId: string): void {
    if (this.destroyed) {
      dbg('enterChannel ignorado: manager destruído')
      return
    }
    this.channelId = channelId
    this.myId = myId
    this.signaling.subscribe(channelId, myId)
    void this.signaling.watchActiveShare(channelId)
    // sincroniza estado existente (alguém pode já estar compartilhando)
    void this.signaling.fetchActiveSharer(channelId).then((sharerId) => {
      if (this.channelId !== channelId || this.destroyed) return
      if (sharerId && sharerId !== myId) this.patch({ sharerId })
      else if (!sharerId) this.patch({ sharerId: null, remoteStream: null, connectionState: null })
    })
  }

  leaveChannel(): void {
    void this.stop().catch(() => undefined)
    this.signaling.onSharerChange = null
    void this.signaling.unsubscribe()
    void this.signaling.unwatchActiveShare()
    this.channelId = null
    this.myId = null
    this.patch(INITIAL_SCREEN_SHARE_STATE)
  }

  // ------------------------------------------------------------
  // Iniciar — fase 1: autorização ANTES da captura
  // Retorna true se a UI deve abrir o picker de fontes.
  // ------------------------------------------------------------
  async beginStart(): Promise<boolean> {
    if (this.destroyed) {
      dbg('beginStart bloqueado: manager destruído (bug de ciclo de vida?)')
      return false
    }
    const channelId = this.voice?.joinedChannelId
    if (!channelId || !this.myId) {
      dbg('beginStart bloqueado: channelId=', channelId, 'myId=', this.myId)
      this.fail('Entre no canal de voz para compartilhar a tela.')
      return false
    }
    if (this.state.status === 'starting' || this.state.status === 'stopping') {
      dbg('beginStart ignorado: status=', this.state.status)
      return false // corrida: ignora cliques duplos
    }
    if (this.state.status === 'sharing' && this.state.localStream) {
      this.fail('Você já está compartilhando a tela.')
      return false
    }
    if (this.state.sharerId && this.state.sharerId !== this.myId) {
      this.fail('Alguém já está compartilhando a tela neste canal.')
      return false
    }

    const token = ++this.opToken
    this.patch({ status: 'starting', error: null })
    this.armStartGuard(channelId, token)
    dbg('beginStart: chamando RPC start_screen_share…')

    try {
      const { error } = await withTimeout(getSupabase().rpc('start_screen_share', { target_channel: channelId }))
      if (error) throw new Error(translateRpcError(error.message))
    } catch (e) {
      dbg('start_screen_share falhou:', e)
      if (token === this.opToken) {
        this.resetToIdle()
        this.fail(e instanceof Error ? e.message : 'Não foi possível iniciar o compartilhamento.')
      }
      return false
    }
    if (token !== this.opToken) {
      // stop()/leaveChannel() venceu a corrida — libera a reserva criada
      await releaseReservation(channelId)
      return false
    }
    dbg('beginStart autorizado — abrir picker')
    return true // autorizado e reservado; UI mostra o picker
  }

  /** Se o RPC de reserva não responder, o clique nunca fica preso em 'starting'. */
  private armStartGuard(channelId: string, token: number): void {
    this.clearStartGuard()
    this.startGuard = window.setTimeout(() => {
      if (this.opToken !== token || this.state.status !== 'starting') return
      dbg('startGuard: estourou — resetando')
      void releaseReservation(channelId)
      this.resetToIdle()
      this.fail('O servidor demorou para responder. Tente novamente.')
    }, 15_000)
  }

  private clearStartGuard(): void {
    if (this.startGuard !== null) {
      clearTimeout(this.startGuard)
      this.startGuard = null
    }
  }

  /**
   * Iniciar — fase 2: captura da fonte escolhida pela UI.
   * Chamar com sourceId=null quando o usuário cancela o picker.
   */
  async startWithSource(sourceId: string | null): Promise<void> {
    if (this.destroyed) {
      dbg('startWithSource ignorado: manager destruído')
      return
    }
    const channelId = this.voice?.joinedChannelId
    const voice = this.voice
    if (!channelId || !voice || !this.myId) return

    if (sourceId === null) {
      if (this.state.status === 'starting') {
        ++this.opToken
        this.resetToIdle()
        await releaseReservation(channelId)
      }
      return
    }
    if (this.state.status !== 'starting') return // stop()/leaveChannel() chegou antes

    const token = ++this.opToken
    let stream: MediaStream
    try {
      stream = await captureScreenSource(sourceId)
    } catch (e) {
      if (token !== this.opToken) return
      this.resetToIdle()
      await releaseReservation(channelId)
      this.fail(e instanceof Error ? e.message : 'Não foi possível capturar a tela.')
      return
    }
    if (token !== this.opToken) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }

    // detecta encerramento pelo sistema (usuário fechou a janela/fonte)
    this.clearEndedHandler()
    const [track] = stream.getVideoTracks()
    this.endedHandler = () => void this.stop().catch(() => undefined)
    track.addEventListener('ended', this.endedHandler)

    // publica a trilha nos PeerConnections e renegocia com cada par existente
    try {
      for (const offer of await voice.publishScreenTrack(stream)) {
        await this.signaling.sendSignal(channelId, offer.peerId, 'screen-offer', { sdp: offer.sdp })
      }
    } catch (e) {
      if (token !== this.opToken) return
      stream.getTracks().forEach((t) => t.stop())
      this.clearEndedHandler()
      await voice.unpublishScreenTrack().then(
        () => undefined,
        () => undefined
      )
      this.resetToIdle()
      await releaseReservation(channelId)
      this.fail(e instanceof Error ? e.message : 'Falha ao publicar o compartilhamento.')
      return
    }
    if (token !== this.opToken) return

    this.startHeartbeat(channelId)
    this.clearStartGuard()
    dbg('compartilhamento ativo (sharing)')
    this.patch({
      status: 'sharing',
      localStream: stream,
      sharerId: this.myId,
      error: null
    })
  }

  // ------------------------------------------------------------
  // Parar — botão OU fim da captura OU saída da chamada
  // Idempotente: chamadas repetidas não fazem nada.
  // ------------------------------------------------------------
  async stop(): Promise<void> {
    if (this.destroyed) {
      dbg('stop ignorado: manager destruído')
      return
    }
    if (this.state.status !== 'sharing' && this.state.status !== 'starting') return
    const token = ++this.opToken
    const channelId = this.channelId ?? this.voice?.joinedChannelId ?? null
    const localStream = this.state.localStream
    this.stopHeartbeat()
    this.clearEndedHandler()
    this.clearStartGuard()
    this.patch({ status: 'idle', localStream: null })

    if (localStream && this.voice) {
      // remove a trilha dos PCs e renegocia (m-line de vídeo some do SDP)
      try {
        if (channelId) {
          for (const offer of await this.voice.unpublishScreenTrack()) {
            await this.signaling.sendSignal(channelId, offer.peerId, 'screen-offer', { sdp: offer.sdp })
          }
        }
      } catch {
        // segue para a limpeza mesmo se a renegociação falhar
      }
      localStream.getTracks().forEach((t) => t.stop())
    }

    if (channelId) await releaseReservation(channelId)
    if (token === this.opToken) this.resetToIdle()
  }

  // ------------------------------------------------------------
  // Sinais recebidos (via call_signals, já filtrados por RLS)
  // ------------------------------------------------------------
  private async handleSignal(signal: ScreenSignal): Promise<void> {
    const voice = this.voice
    if (!voice || !signal.senderId || !this.channelId) return
    switch (signal.kind) {
      case 'screen-offer': {
        const sdp = signal.payload.sdp
        if (!sdp) return
        // só aceito renegociação de quem está marcado como compartilhante
        if (this.state.sharerId && this.state.sharerId !== signal.senderId) return
        this.patch({ sharerId: signal.senderId })
        const answer = await voice.prepareScreenAnswer(signal.senderId, sdp).catch(() => null)
        if (answer) {
          await this.signaling.sendSignal(this.channelId!, signal.senderId, 'screen-answer', { sdp: answer })
        }
        break
      }
      case 'screen-answer': {
        const sdp = signal.payload.sdp
        if (!sdp || this.state.status !== 'sharing') return
        await voice.applyScreenAnswer(signal.senderId, sdp).catch(() => undefined)
        break
      }
      case 'screen-ice': {
        const candidate = signal.payload.candidate
        if (!candidate) return
        voice.applyRemoteCandidate(signal.senderId, candidate)
        break
      }
    }
  }

  // ------------------------------------------------------------
  // Heartbeat / helpers
  // ------------------------------------------------------------
  private startHeartbeat(channelId: string): void {
    this.stopHeartbeat()
    this.heartbeat = window.setInterval(() => {
      if (this.destroyed) return
      void getSupabase()
        .rpc('touch_screen_share', { target_channel: channelId })
        .then(() => undefined, () => undefined)
    }, HEARTBEAT_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  private clearEndedHandler(): void {
    if (!this.endedHandler) return
    this.state.localStream?.getVideoTracks()[0]?.removeEventListener('ended', this.endedHandler)
    this.endedHandler = null
  }

  private handleRemoteStopped(): void {
    this.pendingRemoteScreens.clear()
    if (this.state.status === 'sharing' && this.state.localStream) return // era meu? nada a fazer
    this.patch({ sharerId: null, remoteStream: null, connectionState: null })
  }

  private resetToIdle(): void {
    this.patch({ ...INITIAL_SCREEN_SHARE_STATE })
  }

  private fail(message: string): void {
    this.patch({ status: 'idle', error: message })
  }
}

/** Libera a reserva no banco (RLS garante que só apaga a MINHA linha). */
async function releaseReservation(channelId: string): Promise<void> {
  await getSupabase()
    .rpc('stop_screen_share', { target_channel: channelId })
    .then(
      () => undefined,
      () => undefined
    )
}

function translateRpcError(message: string): string {
  if (/já está compartilhando/i.test(message)) return 'Alguém já está compartilhando a tela neste canal.'
  if (/Sem permissão/i.test(message)) return 'Você não tem permissão para compartilhar neste canal.'
  return message
}
