export interface SavedCredentials {
  email: string
  password: string
  username: string
}

export interface Api {
  platform: string
  saveCredentials: (creds: SavedCredentials) => Promise<boolean>
  loadCredentials: () => Promise<SavedCredentials | null>
  clearCredentials: () => Promise<boolean>
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
