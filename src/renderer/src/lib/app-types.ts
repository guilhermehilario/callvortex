import type { Channel, DmThreadWithOther, ModalType, Profile, Screen, Server, ServerEmoji, VoicePeerInfo } from './types'
import type { ScreenShareApi } from './useScreenShare'

export type AuthState = 'loading' | 'signedOut' | 'signedIn'

export interface Notice {
  kind: 'error' | 'success'
  text: string
}

export interface SavedCredentials {
  email: string
  password: string
  username: string
}

/** Contrato público do contexto do app — consumido por todos os componentes. */
export interface AppContextValue {
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
  renamingChannel: Channel | null
  openRenameChannel: (channel: Channel) => void
  handleRenameChannel: (channelId: string, name: string) => Promise<void>
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
  // quem está em CADA canal de voz (mesmo sem estar dentro da sala)
  voicePresence: Record<string, VoicePeerInfo[]>
  // início da atividade de cada canal de voz (channelId -> started_at ISO)
  voiceSessions: Record<string, string>
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
  internetPing: number | null
  internetQuality: number
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
  toggleVoiceMute: () => void
  toggleVoiceDeafen: () => void
  loadMicrophones: () => Promise<void>
  selectMicrophone: (deviceId: string) => Promise<void>
  // compartilhamento de tela
  screenShareState: ScreenShareApi['screenShareState']
  loadScreenSources: ScreenShareApi['loadScreenSources']
  beginScreenShare: ScreenShareApi['beginScreenShare']
  confirmScreenSource: ScreenShareApi['confirmScreenSource']
  stopScreenShare: ScreenShareApi['stopScreenShare']
  notify: (kind: Notice['kind'], text: string) => void
}
