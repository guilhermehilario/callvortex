import { app, shell, BrowserWindow, ipcMain, safeStorage, desktopCapturer } from 'electron'
import { join } from 'path'
import { readFile, writeFile, rm } from 'fs/promises'

// O áudio (WebRTC + processamento) precisa rodar sem exigir clique prévio
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// ---------------------------------------------------------------------------
// Credenciais lembradas ("Lembrar de mim")
// Salvas criptografadas com safeStorage (DPAPI no Windows / Keychain no macOS)
// em um arquivo dentro da pasta de dados do app — nunca em texto puro.
// ---------------------------------------------------------------------------
interface SavedCredentials {
  email: string
  password: string
  username: string
}

const credentialsFile = (): string => join(app.getPath('userData'), 'credentials.json')

async function saveCredentials(creds: SavedCredentials): Promise<boolean> {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false
    await writeFile(credentialsFile(), safeStorage.encryptString(JSON.stringify(creds)))
    return true
  } catch {
    return false
  }
}

async function loadCredentials(): Promise<SavedCredentials | null> {
  try {
    const raw = await readFile(credentialsFile())
    if (!safeStorage.isEncryptionAvailable()) return null
    const parsed = JSON.parse(safeStorage.decryptString(raw)) as SavedCredentials
    if (!parsed || typeof parsed.email !== 'string' || typeof parsed.password !== 'string') return null
    return { email: parsed.email, password: parsed.password, username: typeof parsed.username === 'string' ? parsed.username : '' }
  } catch {
    return null
  }
}

// Só aceita chamadas IPC vindas do frame principal da nossa janela — assim,
// nenhuma página externa (ou iframe) consegue ler/gravar credenciais.
function isTrustedSender(event: Electron.IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  if (!frame) return false
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    // dev: apenas a origem do dev server (ex.: http://localhost:5173)
    return frame.url.startsWith(process.env['ELECTRON_RENDERER_URL'])
  }
  // produção: apenas o bundle local (file://) — o frame principal do app
  return frame.url.startsWith('file://')
}

function registerCredentialsIpc(): void {
  ipcMain.handle('credentials:save', (e, creds: SavedCredentials) => {
    if (!isTrustedSender(e)) return false
    return saveCredentials(creds)
  })
  ipcMain.handle('credentials:load', (e) => {
    if (!isTrustedSender(e)) return null
    return loadCredentials()
  })
  ipcMain.handle('credentials:clear', async (e) => {
    if (!isTrustedSender(e)) return false
    try {
      await rm(credentialsFile(), { force: true })
      return true
    } catch {
      return false
    }
  })
}

// ---------------------------------------------------------------------------
// Compartilhamento de tela: lista as fontes capturáveis (telas e janelas).
// O desktopCapturer só existe no processo principal; o renderer recebe
// apenas metadados (id, nome, miniatura) e faz a captura em si via
// getUserMedia — nenhum acesso genérico ao Node é exposto.
// ---------------------------------------------------------------------------
interface ScreenSourceInfo {
  id: string
  name: string
  thumbnail: string | null
  icon: string | null
}

function registerScreenShareIpc(): void {
  ipcMain.handle('screen-share:get-sources', async (e): Promise<ScreenSourceInfo[]> => {
    if (!isTrustedSender(e)) return []
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true
      })
      return sources.slice(0, 50).map((s) => ({
        id: s.id,
        name: s.name.trim() || (s.id.startsWith('screen:') ? 'Tela inteira' : 'Janela'),
        thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
        icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null
      }))
    } catch {
      return []
    }
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 540,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1f22',
    title: 'CallVortex',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // sandbox ativado: o renderer fica isolado do Node — se qualquer página
      // externa carregar ou houver XSS, o preload roda sem privilégios
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Diagnóstico: se o renderer morrer (tela em branco), registra o motivo no terminal
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] Renderer process gone ->', details.reason, '| exitCode:', details.exitCode)
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[main] Falha ao carregar a página:', errorCode, errorDescription)
  })

  // Erros de JavaScript do renderer aparecem no terminal também
  // (Electron 43 usa o objeto de evento como 1º argumento)
  mainWindow.webContents.on('console-message', (details) => {
    const d = details as unknown as { level?: string | number; message?: string }
    if (d.level === 'error' || d.level === 'warning' || d.level === 3) {
      console.error(`[renderer:${String(d.level)}]`, d.message ?? '')
    }
  })

  // Bloquear navegação da janela para qualquer site externo
  // (protege o preload e o window.api de páginas não confiáveis)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = !app.isPackaged && process.env['ELECTRON_RENDERER_URL']
      ? url.startsWith(process.env['ELECTRON_RENDERER_URL'])
      : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })

  // Abrir links externos no navegador padrão — apenas http/https
  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const u = new URL(details.url)
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        shell.openExternal(details.url)
      }
    } catch {
      // URL inválida — ignora
    }
    return { action: 'deny' }
  })

  // electron-vite injeta ELECTRON_RENDERER_URL no modo dev
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerCredentialsIpc()
  registerScreenShareIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
