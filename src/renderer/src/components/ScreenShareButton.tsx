import { useEffect, useState } from 'react'
import { useApp } from '../lib/useApp'
import { listScreenSources } from '../lib/screenShare/capture'
import type { ScreenSourceInfo } from '../lib/screenShare/types'
import { MonitorIcon, MonitorOffIcon } from './Icons'

interface ScreenShareButtonProps {
  /**
   * control → controles grandes da tela do canal de voz;
   * quick   → ação rápida do painel "Voz conectada" (sidebar).
   * O fluxo é o mesmo; muda apenas a classe/estilo.
   */
  variant?: 'control' | 'quick'
  size?: number
}

/**
 * Botão de compartilhar tela dos controles da chamada.
 *  - ninguém compartilhando + estou na chamada → abre o fluxo (autoriza → picker)
 *  - EU compartilhando → para
 *  - OUTRO compartilhando → desabilitado (regra: um compartilhamento por canal)
 */
export default function ScreenShareButton({ variant = 'control', size = 20 }: ScreenShareButtonProps): React.JSX.Element {
  const {
    profile,
    voiceChannelId,
    screenShareState,
    beginScreenShare,
    stopScreenShare,
    confirmScreenSource,
    notify
  } = useApp()
  const [pickerOpen, setPickerOpen] = useState(false)

  const joined = voiceChannelId !== null
  const mine = screenShareState.status === 'sharing' && screenShareState.localStream !== null
  const otherSharing = screenShareState.sharerId !== null && screenShareState.sharerId !== profile?.id
  const busy = screenShareState.status === 'starting' || screenShareState.status === 'stopping'
  const stateClass = mine ? 'active sharing' : otherSharing ? 'blocked' : ''

  const handleClick = (): void => {
    if (!joined || busy) return
    if (mine) {
      void stopScreenShare().then(() => notify('success', 'Compartilhamento encerrado.'))
      return
    }
    void (async () => {
      // fase 1: autorização no banco ANTES da captura — só depois abre o
      // picker. Se houver sessão órfã de outro usuário, o próprio banco a
      // expira e autoriza; se for ativa de verdade, nega com aviso.
      const ok = await beginScreenShare()
      if (ok) setPickerOpen(true)
    })()
  }

  const title = mine
    ? 'Parar compartilhamento de tela'
    : otherSharing
      ? 'Alguém está compartilhando a tela (se parou há pouco, tente de novo em instantes)'
      : !joined
        ? 'Entre no canal de voz para compartilhar a tela'
        : 'Compartilhar tela ou janela'

  return (
    <>
      <button
        className={variant === 'quick' ? `voice-quick-action ${stateClass}` : `voice-control ${stateClass}`}
        title={title}
        onClick={handleClick}
        disabled={!joined || busy}
        aria-label={title}
      >
        {mine ? <MonitorOffIcon size={size} /> : <MonitorIcon size={size} />}
      </button>
      {pickerOpen && (
        <ScreenSharePickerInline
          onPick={(id) => {
            setPickerOpen(false)
            void confirmScreenSource(id)
          }}
          onCancel={() => {
            setPickerOpen(false)
            void confirmScreenSource(null)
          }}
        />
      )}
    </>
  )
}

// ------------------------------------------------------------
// Picker embutido: mantém o fluxo num único lugar (botão → escolha).
// A listagem vem do processo principal via IPC específico.
// ------------------------------------------------------------
function ScreenSharePickerInline({
  onPick,
  onCancel
}: {
  onPick: (sourceId: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [sources, setSources] = useState<ScreenSourceInfo[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void listScreenSources().then((s) => {
      if (!cancelled) setSources(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="ss-overlay" role="dialog" aria-modal="true" aria-label="Escolher o que compartilhar">
      <div className="ss-picker">
        <header className="ss-picker-header">
          <h3>Escolha o que compartilhar</h3>
          <p>A transmissão é direta (P2P) e só para quem está na chamada.</p>
        </header>
        <div className="ss-picker-grid">
          {sources === null && <p className="ss-picker-empty">Carregando fontes…</p>}
          {sources !== null && sources.length === 0 && (
            <p className="ss-picker-empty">Nenhuma tela ou janela disponível para captura.</p>
          )}
          {sources?.map((s) => (
            <button key={s.id} className="ss-source" title={s.name} onClick={() => onPick(s.id)}>
              {s.thumbnail ? <img src={s.thumbnail} alt="" className="ss-thumb" draggable={false} /> : <div className="ss-thumb ss-thumb-empty" />}
              <span className="ss-source-name">{s.name}</span>
            </button>
          ))}
        </div>
        <footer className="ss-picker-footer">
          <button className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        </footer>
      </div>
    </div>
  )
}
