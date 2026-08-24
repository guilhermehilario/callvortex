export interface SavedCredentials {
  email: string
  password: string
  username: string
}

export interface ScreenSourceInfo {
  id: string
  name: string
  thumbnail: string | null
  icon: string | null
}

export interface FirewallFixResult {
  ok: boolean
  message: string
}

export interface Api {
  platform: string
  saveCredentials: (creds: SavedCredentials) => Promise<boolean>
  loadCredentials: () => Promise<SavedCredentials | null>
  clearCredentials: () => Promise<boolean>
  screenShare: {
    getSources: () => Promise<ScreenSourceInfo[]>
    /** registra a fonte escolhida no picker; o getDisplayMedia() usará ela */
    selectSource: (sourceId: string) => Promise<boolean>
  }
  voice: {
    /** libera o áudio no Firewall do Windows (abre confirmação UAC) */
    fixFirewall: () => Promise<FirewallFixResult>
  }
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
