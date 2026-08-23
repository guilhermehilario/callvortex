/**
 * Captura de tela (somente captura — sem Supabase, sem React).
 *
 * A lista de fontes vem do processo principal via IPC específico
 * (`window.api.screenShare.getSources`); a captura em si é feita aqui no
 * renderer com getUserMedia usando a fonte escolhida explicitamente
 * pelo usuário. Nada é gravado nem enviado a servidor algum.
 */
import type { ScreenSourceInfo } from './types'

/** Lista telas e janelas capturáveis (metadados + miniatura). */
export async function listScreenSources(): Promise<ScreenSourceInfo[]> {
  try {
    const sources = await window.api.screenShare.getSources()
    return Array.isArray(sources) ? sources : []
  } catch {
    return []
  }
}

/**
 * Captura a fonte escolhida. Restringe resolução/frame rate: conteúdo de
 * tela não precisa de 60 fps — 15 fps + 1080p economizam banda na malha P2P.
 */
export async function captureScreenSource(sourceId: string): Promise<MediaStream> {
  if (!sourceId || typeof sourceId !== 'string') {
    throw new Error('Fonte de tela inválida.')
  }
  // Constraints proprietárias do Electron/Chromium para desktop capture.
  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        minWidth: 640,
        minHeight: 360,
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 15
      }
    }
  } as unknown as MediaStreamConstraints

  const stream = await navigator.mediaDevices.getUserMedia(constraints)
  if (stream.getVideoTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop())
    throw new Error('A captura não retornou nenhuma imagem.')
  }
  return stream
}
