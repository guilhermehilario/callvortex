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
    if (import.meta.env.DEV) console.debug('[screen-share] fontes recebidas:', sources.length)
    return Array.isArray(sources) ? sources : []
  } catch (e) {
    console.error('[screen-share] falha ao listar fontes:', e)
    return []
  }
}

/**
 * Captura a fonte escolhida. O fluxo é:
 *   1. registra a fonte no processo principal (IPC);
 *   2. chama getDisplayMedia() — o handler do main entrega exatamente essa
 *      fonte. Esse é o único caminho que funciona em Wayland (portal/PipeWire)
 *      e também cobre X11 e Windows.
 * Restringe resolução/frame rate e otimiza a codificação: 1080p com até
 * ~24-30 fps + `contentHint = 'detail'` mantém o texto nítido sem estourar
 * a banda na malha P2P (o teto real de bitrate é aplicado no sender).
 */
export async function captureScreenSource(sourceId: string): Promise<MediaStream> {
  if (!sourceId || typeof sourceId !== 'string') {
    throw new Error('Fonte de tela inválida.')
  }
  const registered = await window.api.screenShare.selectSource(sourceId)
  if (!registered) throw new Error('Não foi possível registrar a fonte escolhida.')

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: {
        frameRate: { max: 30, ideal: 24 },
        width: { max: 1920 },
        height: { max: 1080 }
      }
    })
  } catch (e) {
    const name = e instanceof DOMException ? e.name : ''
    if (name === 'NotAllowedError') throw new Error('Permissão de captura negada pelo sistema.')
    if (name === 'NotSupportedError')
      throw new Error('Captura de tela não suportada neste ambiente (sessão/portal de vídeo).')
    throw new Error('Não foi possível capturar a tela.')
  }
  if (stream.getVideoTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop())
    throw new Error('A captura não retornou nenhuma imagem.')
  }
  // conteúdo de tela: pede ao codificador que priorize nitidez (texto,
  // bordas, áreas estáticas) em vez de suavizar como câmera comum
  const track = stream.getVideoTracks()[0]
  try {
    track.contentHint = 'detail'
  } catch {
    // navegador sem suporte — segue com o padrão
  }
  return stream
}
