import { app, shell, BrowserWindow, ipcMain, safeStorage, session, desktopCapturer } from 'electron'
import { join } from 'path'
import { readFile, writeFile, rm } from 'fs/promises'

// O áudio (WebRTC + processamento) precisa rodar sem exigir clique prévio
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// Captura de tela em Wayland via portal/PipeWire (sem efeito no X11/Windows)
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer')
// TEMPORÁRIO (teste automatizado): porta de depuração via variável de ambiente
if (process.env['CV_REMOTE_DEBUG_PORT']) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env['CV_REMOTE_DEBUG_PORT'])
}

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

/** Fonte escolhida no picker aguardando o getDisplayMedia() do renderer. */
let pendingScreenSourceId: string | null = null

function registerScreenShareIpc(): void {
  ipcMain.handle('screen-share:get-sources', async (e): Promise<ScreenSourceInfo[]> => {
    if (!isTrustedSender(e)) return []
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true
      })
      if (!app.isPackaged) console.log('[main] get-sources:', sources.length, 'fontes')
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

  // Registra a fonte escolhida no nosso picker; o getDisplayMedia() do
  // renderer será atendido pelo handler abaixo usando essa fonte.
  ipcMain.handle('screen-share:select-source', (e, sourceId: unknown): boolean => {
    if (!isTrustedSender(e)) return false
    if (typeof sourceId !== 'string' || sourceId.length === 0 || sourceId.length > 256) return false
    pendingScreenSourceId = sourceId
    return true
  })

  // Captura de tela no Electron moderno: o renderer chama
  // navigator.mediaDevices.getDisplayMedia() e AQUI decidimos qual fonte
  // entregar — a escolhida no nosso picker. Esse é o único caminho que
  // funciona em Wayland (portal/PipeWire) e também cobre X11 e Windows.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    const wanted = pendingScreenSourceId
    if (!wanted) {
      callback({})
      return
    }
    void desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        const source = sources.find((s) => s.id === wanted)
        if (source) callback({ video: source })
        else callback({})
      })
      .catch(() => callback({}))
      .finally(() => {
        if (pendingScreenSourceId === wanted) pendingScreenSourceId = null
      })
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

  // Mensagens do console do renderer aparecem no terminal em dev
  // (Electron 43 usa o objeto de evento como 1º argumento)
  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', (details) => {
      const d = details as unknown as { level?: string | number; message?: string }
      const isError = d.level === 'error' || d.level === 3
      const isWarn = d.level === 'warning' || d.level === 2
      const isDevNoise = typeof d.message === 'string' && d.message.includes('Autofocus processing')
      if (!isError && !isWarn && !isDevNoise) {
        console.log(`[renderer]`, d.message ?? '')
      } else if (isError) {
        console.error(`[renderer]`, d.message ?? '')
      }
    })
  }

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
