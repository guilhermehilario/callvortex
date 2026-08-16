import { app, shell, BrowserWindow, ipcMain, safeStorage } from 'electron'
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

function registerCredentialsIpc(): void {
  ipcMain.handle('credentials:save', (_e, creds: SavedCredentials) => saveCredentials(creds))
  ipcMain.handle('credentials:load', () => loadCredentials())
  ipcMain.handle('credentials:clear', async () => {
    try {
      await rm(credentialsFile(), { force: true })
      return true
    } catch {
      return false
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
    title: 'Discord Clone',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
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

  // Abrir links externos no navegador padrão
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
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
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
