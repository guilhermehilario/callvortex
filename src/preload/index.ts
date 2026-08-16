import { contextBridge, ipcRenderer } from 'electron'

export interface SavedCredentials {
  email: string
  password: string
  username: string
}

// API mínima exposta ao renderer (o Supabase roda direto no renderer via fetch/websocket)
const api = {
  platform: process.platform,
  // Credenciais lembradas — criptografadas no processo principal (safeStorage)
  saveCredentials: (creds: SavedCredentials): Promise<boolean> => ipcRenderer.invoke('credentials:save', creds),
  loadCredentials: (): Promise<SavedCredentials | null> => ipcRenderer.invoke('credentials:load'),
  clearCredentials: (): Promise<boolean> => ipcRenderer.invoke('credentials:clear')
}

contextBridge.exposeInMainWorld('api', api)
