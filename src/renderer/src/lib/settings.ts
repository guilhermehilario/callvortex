// ------------------------------------------------------------
// Persistência de configurações do usuário (localStorage)
// Centraliza chaves e leitura/escrita segura — o resto do app
// não precisa lidar com try/catch de armazenamento.
// ------------------------------------------------------------

export const MIC_STORAGE_KEY = 'selected-mic-id'
export const NOISE_SUPPRESSION_KEY = 'noise-suppression'
export const VOICE_SESSION_KEY = 'voice-session'
export const OUTPUT_DEVICE_KEY = 'output-device-id'
export const OUTPUT_VOLUME_KEY = 'output-volume'
export const PEER_VOLUMES_KEY = 'peer-volumes'
export const MIC_VOLUME_KEY = 'mic-volume'

// sessão de voz é considerada reutilizável por até 20 minutos
export const VOICE_REJOIN_MS = 20 * 60 * 1000

export interface VoiceSession {
  channelId: string
  serverId: string
  at: number
}

// ------------------------------------------------------------
// Sessão de voz ("voltar automaticamente para a sala")
// ------------------------------------------------------------
export function readVoiceSession(): VoiceSession | null {
  try {
    const raw = localStorage.getItem(VOICE_SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as VoiceSession
    return s && typeof s.channelId === 'string' && typeof s.serverId === 'string' ? s : null
  } catch {
    return null
  }
}

export function writeVoiceSession(s: VoiceSession): void {
  try {
    localStorage.setItem(VOICE_SESSION_KEY, JSON.stringify(s))
  } catch {
    // armazenamento indisponível — segue sem voltar automaticamente
  }
}

export function clearVoiceSession(): void {
  try {
    localStorage.removeItem(VOICE_SESSION_KEY)
  } catch {
    // ignore
  }
}

// ------------------------------------------------------------
// Leitura/escrita genérica segura
// ------------------------------------------------------------
export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // armazenamento indisponível — segue só em memória
  }
}

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // armazenamento indisponível — segue só em memória
  }
}

/** Lê um número persistido, limitado a [min, max]; devolve fallback se inválido. */
export function readClampedNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
  } catch {
    return fallback
  }
}
