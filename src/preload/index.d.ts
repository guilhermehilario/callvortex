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

export interface Api {
  platform: string
  saveCredentials: (creds: SavedCredentials) => Promise<boolean>
  loadCredentials: () => Promise<SavedCredentials | null>
  clearCredentials: () => Promise<boolean>
  screenShare: {
    getSources: () => Promise<ScreenSourceInfo[]>
  }
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
