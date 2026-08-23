import { contextBridge, ipcRenderer } from 'electron'

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

// API mínima exposta ao renderer (o Supabase roda direto no renderer via fetch/websocket)
const api = {
  platform: process.platform,
  // Credenciais lembradas — criptografadas no processo principal (safeStorage)
  saveCredentials: (creds: SavedCredentials): Promise<boolean> => ipcRenderer.invoke('credentials:save', creds),
  loadCredentials: (): Promise<SavedCredentials | null> => ipcRenderer.invoke('credentials:load'),
  clearCredentials: (): Promise<boolean> => ipcRenderer.invoke('credentials:clear'),
  // Compartilhamento de tela — apenas listagem de fontes (captura em si é
  // feita no renderer via getUserMedia com a fonte escolhida pelo usuário)
  screenShare: {
    getSources: (): Promise<ScreenSourceInfo[]> => ipcRenderer.invoke('screen-share:get-sources')
  }
}

contextBridge.exposeInMainWorld('api', api)
