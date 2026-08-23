/**
 * Tipos do compartilhamento de tela.
 * A "chamada" no CallVortex é um canal de voz (channels.type='voice');
 * a autorização real vive no Supabase (RLS + RPCs) — estes tipos apenas
 * descrevem o estado local e as mensagens permitidas.
 */

/** Fonte capturável listada pelo processo principal (tela ou janela). */
export interface ScreenSourceInfo {
  id: string
  name: string
  thumbnail: string | null
  icon: string | null
}

/** Tipos de sinalização aceitos pelo backend (whitelist em call_signals.kind). */
export type ScreenSignalKind = 'screen-offer' | 'screen-answer' | 'screen-ice'

export function isScreenSignalKind(value: unknown): value is ScreenSignalKind {
  return value === 'screen-offer' || value === 'screen-answer' || value === 'screen-ice'
}

/** Estado do compartilhamento (local + remoto), consumido pela UI. */
export interface ScreenShareState {
  /** ciclo de vida do MEU compartilhamento */
  status: ScreenShareStatus
  /** id do usuário compartilhando agora (eu ou outro participante); null se ninguém */
  sharerId: string | null
  /** stream local quando EU compartilho */
  localStream: MediaStream | null
  /** stream remoto quando OUTRO compartilha */
  remoteStream: MediaStream | null
  connectionState: RTCPeerConnectionState | null
  error: string | null
}

export type ScreenShareStatus = 'idle' | 'starting' | 'sharing' | 'stopping'

export const INITIAL_SCREEN_SHARE_STATE: ScreenShareState = {
  status: 'idle',
  sharerId: null,
  localStream: null,
  remoteStream: null,
  connectionState: null,
  error: null
}
