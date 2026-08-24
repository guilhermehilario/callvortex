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

export interface FirewallFixResult {
  ok: boolean
  message: string
}

// API mínima exposta ao renderer (o Supabase roda direto no renderer via fetch/websocket)
const api = {
  platform: process.platform,
  // Credenciais lembradas — criptografadas no processo principal (safeStorage)
  saveCredentials: (creds: SavedCredentials): Promise<boolean> => ipcRenderer.invoke('credentials:save', creds),
  loadCredentials: (): Promise<SavedCredentials | null> => ipcRenderer.invoke('credentials:load'),
  clearCredentials: (): Promise<boolean> => ipcRenderer.invoke('credentials:clear'),
  // Compartilhamento de tela — listagem das fontes (para o picker) e
  // registro da fonte escolhida; a captura em si é feita no renderer via
  // getDisplayMedia(), atendido pelo handler do processo principal.
  screenShare: {
    getSources: (): Promise<ScreenSourceInfo[]> => ipcRenderer.invoke('screen-share:get-sources'),
    selectSource: (sourceId: string): Promise<boolean> => ipcRenderer.invoke('screen-share:select-source', sourceId)
  },
  // Voz — correção do Firewall do Windows com confirmação do sistema (UAC)
  voice: {
    fixFirewall: (): Promise<FirewallFixResult> => ipcRenderer.invoke('voice:fix-firewall')
  }
}

contextBridge.exposeInMainWorld('api', api)
