import { useEffect, useRef } from 'react'
import { useApp } from '../lib/useApp'
import type { VoicePeerInfo } from '../lib/types'
import { MonitorIcon } from './Icons'

/**
 * Palco do compartilhamento: exibe a tela de quem está compartilhando
 * (a minha em prévia, ou a remota), com indicador e controle de parada.
 * Estados visíveis ao usuário: conectando / reconectando / encerrado.
 */
export default function ScreenShareStage({ members }: { members: VoicePeerInfo[] }): React.JSX.Element | null {
  const { profile, screenShareState, stopScreenShare } = useApp()
  const videoRef = useRef<HTMLVideoElement>(null)

  const sharerId = screenShareState.sharerId
  const mine = sharerId !== null && sharerId === profile?.id && screenShareState.localStream !== null
  const stream = mine ? screenShareState.localStream : screenShareState.remoteStream

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (el.srcObject !== stream) {
      el.srcObject = stream
    }
    if (stream) {
      void el.play().catch(() => undefined)
    }
  }, [stream])

  if (!sharerId) return null
  const sharer = members.find((m) => m.userId === sharerId)

  // status para o usuário final (sem detalhes técnicos)
  let statusText: string | null = null
  if (mine) {
    statusText = '🔴 Compartilhando sua tela'
  } else if (!stream) {
    statusText = 'Conectando…'
  } else {
    const cs = screenShareState.connectionState
    if (cs === 'disconnected') statusText = 'Reconectando…'
    else if (cs === 'failed' || cs === 'closed') statusText = 'Conexão perdida'
  }

  return (
    <div className="ss-stage">
      <header className="ss-stage-header">
        <span className="ss-stage-title">
          <MonitorIcon size={16} />
          {sharer ? `${sharer.username} está compartilhando a tela` : 'Compartilhamento de tela'}
        </span>
        {statusText && <span className={`ss-status ${statusText.startsWith('🔴') ? 'live' : ''}`}>{statusText}</span>}
        {mine && (
          <button className="ss-stop-btn" onClick={() => void stopScreenShare()}>
            Parar compartilhamento
          </button>
        )}
      </header>
      <div className="ss-stage-body">
        {stream ? (
          <video ref={videoRef} className="ss-video" autoPlay playsInline muted={mine} />
        ) : (
          !mine && <div className="ss-stage-placeholder">Aguardando o vídeo…</div>
        )}
        {mine && stream && <div className="ss-preview-tag">Prévia local</div>}
        {/* parar sempre visível sobre o vídeo — sem precisar procurar */}
        {mine && stream && (
          <button className="ss-stop-fab" onClick={() => void stopScreenShare()}>
            Parar compartilhamento
          </button>
        )}
      </div>
    </div>
  )
}

/** Selo 🖥️ sobre o tile de quem está compartilhando (grade da sala). */
export function ScreenSharingDot({ userId }: { userId: string }): React.JSX.Element | null {
  const { screenShareState } = useApp()
  if (screenShareState.sharerId !== userId) return null
  return (
    <span className="ss-dot" title="Compartilhando a tela" aria-label="Compartilhando a tela">
      <MonitorIcon size={14} />
    </span>
  )
}
