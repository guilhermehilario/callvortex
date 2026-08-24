export interface Profile {
  id: string
  username: string
  avatar_color: string
  avatar_url?: string | null
  created_at?: string
}

export interface ServerEmoji {
  id: string
  server_id: string
  name: string
  url: string
  created_at?: string
}

export interface Server {
  id: string
  name: string
  owner_id: string
  icon_color: string
  invite_code: string | null
  created_at: string
}

export interface Channel {
  id: string
  server_id: string
  name: string
  type: 'text' | 'voice'
  created_at: string
}

export interface VoicePeerInfo {
  userId: string
  username: string
  avatar_color: string
  avatar_url?: string | null
  /** estado transmitido na presença — visível só a quem está na sala */
  muted?: boolean
  deafened?: boolean
}

export interface Message {
  id: number
  channel_id: string
  author_id: string
  content: string
  created_at: string
  author?: Profile
}

export interface DmThread {
  id: string
  last_message: string | null
  last_message_author: string | null
  last_message_at: string | null
  created_at: string
}

export interface DmThreadWithOther extends DmThread {
  other: Profile
}

export interface DmMessage {
  id: number
  thread_id: string
  author_id: string
  content: string
  created_at: string
  author?: Profile
}

export type Screen =
  | { type: 'dm'; threadId: string | null }
  | { type: 'server'; serverId: string; channelId: string }

export type ModalType = 'create-server' | 'join-server' | 'create-channel' | 'rename-channel' | 'start-dm' | 'manage-emojis' | null

export const AVATAR_COLORS = [
  '#5865f2',
  '#eb459e',
  '#faa61a',
  '#23a55a',
  '#3ba55c',
  '#ed4245',
  '#f73b84',
  '#1abc9c',
  '#9b59b6',
  '#e67e22',
  '#3498db',
  '#e91e63'
]

export function colorFromString(s: string): string {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const INVITE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/**
 * Código de convite de 8 caracteres gerado com CSPRNG (crypto.getRandomValues),
 * em vez de Math.random() — mais entropia e sem padrão previsível (SEC-006).
 */
export function genInviteCode(): string {
  const bytes = new Uint32Array(8)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const n of bytes) code += INVITE_ALPHABET[n % INVITE_ALPHABET.length]
  return code
}
