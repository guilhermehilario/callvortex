import { useCallback, useRef, useState } from 'react'
import { useApp } from '../lib/useApp'

type Status = 'ok' | 'warn' | 'fail' | 'run' | 'idle'

interface CheckResult {
  id: string
  label: string
  status: Status
  detail?: string
}

interface VoiceDebugApi {
  debugSnapshot(): Record<string, unknown>
  debugPcs(): [string, RTCPeerConnection][]
}

const INITIAL: CheckResult[] = [
  { id: 'mic', label: 'Microfone (permissão e captura)', status: 'idle' },
  { id: 'vol', label: 'Volumes do CallVortex', status: 'idle' },
  { id: 'out', label: 'Saída de som (alto-falantes/fone)', status: 'idle' },
  { id: 'p2p', label: 'Conexão direta com os participantes', status: 'idle' }
]

/**
 * Solucionador de problemas de voz: roda na máquina do usuário e identifica,
 * em linguagem simples, por que ele não ouve ou não é ouvido — permissão do
 * Windows, volume zerado, dispositivo errado ou NAT bloqueando o P2P —
 * com ação corretiva quando possível.
 */
export default function VoiceTroubleshooter({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { micVolume, outputVolume, setMicVolume, setOutputVolume, voiceChannelId } = useApp()
  const [results, setResults] = useState<CheckResult[]>(INITIAL)
  const [running, setRunning] = useState(false)
  const [toneVerdict, setToneVerdict] = useState<'ok' | 'fail' | null>(null)
  const rafRef = useRef<number | null>(null)

  const patch = useCallback((id: string, data: Partial<CheckResult>) => {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, ...data } : r)))
  }, [])

  const voice = (): VoiceDebugApi | null => {
    const v = (window as unknown as { __voice?: VoiceDebugApi }).__voice
    return v ?? null
  }

  const runAll = useCallback(async () => {
    setRunning(true)
    setToneVerdict(null)
    setResults(INITIAL.map((r) => ({ ...r, status: 'idle' })))

    // ---------- 1. microfone ----------
    patch('mic', { status: 'run', detail: 'medindo a captura…' })
    let stream: MediaStream | null = null
    let permissionDenied = false
    try {
      if (navigator.permissions) {
        try {
          const p = await navigator.permissions.query({ name: 'microphone' as PermissionName })
          if (p.state === 'denied') permissionDenied = true
        } catch {
          /* consulta de permissão indisponível — segue com a medição */
        }
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const track = stream.getAudioTracks()[0]
      if (!track || track.readyState !== 'live') throw new Error('trilha indisponível')
      // mede o pico por ~1,8 s
      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      const buf = new Float32Array(analyser.fftSize)
      let peak = 0
      const t0 = performance.now()
      await new Promise<void>((resolve) => {
        const tick = () => {
          analyser.getFloatTimeDomainData(buf)
          for (const v of buf) if (Math.abs(v) > peak) peak = Math.abs(v)
          if (performance.now() - t0 > 1800) resolve()
          else rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      })
      void ctx.close()
      const pct = Math.min(100, Math.round(peak * 400))
      if (permissionDenied) {
        patch('mic', {
          status: 'fail',
          detail: 'Bloqueado nas configurações. No Windows: Configurações › Privacidade e segurança › Microfone › permitir apps.'
        })
      } else if (pct > 1) {
        patch('mic', { status: 'ok', detail: `Capturando som (${pct}% de pico ao falar).` })
      } else {
        patch('mic', {
          status: 'warn',
          detail:
            'Sem sinal nenhum. Verifique se este é o microfone certo e se não está mudo no sistema (bandeja do Windows).'
        })
      }
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      patch('mic', {
        status: 'fail',
        detail:
          name === 'NotAllowedError'
            ? 'Permissão negada. No Windows: Configurações › Privacidade e segurança › Microfone › permitir apps desktop.'
            : 'Não foi possível abrir o microfone neste dispositivo.'
      })
    } finally {
      stream?.getTracks().forEach((t) => t.stop())
    }

    // ---------- 2. volumes internos ----------
    patch('vol', {
      status: micVolume > 0 && outputVolume > 0 ? 'ok' : 'warn',
      detail:
        micVolume > 0 && outputVolume > 0
          ? `Microfone ${Math.round(micVolume * 100)}% · saída ${Math.round(outputVolume * 100)}%.`
          : `Problema encontrado: microfone ${Math.round(micVolume * 100)}% · saída ${Math.round(outputVolume * 100)}%. Use “Restaurar 100%” abaixo.`
    })

    // ---------- 4. conexão P2P (antes do tom, que depende do usuário) ----------
    patch('p2p', { status: 'run', detail: 'analisando…' })
    try {
      const v = voice()
      const snap = v?.debugSnapshot()
      const peers = (snap?.peers as Array<{ connection?: string }> | undefined) ?? []
      const connected = peers.filter((p) => p.connection === 'connected').length
      if (!voiceChannelId) {
        patch('p2p', { status: 'ok', detail: 'Fora do canal — entre na sala para testar a conexão.' })
      } else if (peers.length === 0) {
        patch('p2p', { status: 'warn', detail: 'Ninguém mais na sala para testar.' })
      } else if (connected > 0) {
        patch('p2p', { status: 'ok', detail: `${connected} de ${peers.length} pares conectados.` })
      } else if (v) {
        // classifica o candidato local do primeiro par: host (rede local),
        // srflx/prflx (NAT) ou relay (TURN) — ajuda a identificar NAT restritivo
        const pcs = v.debugPcs()
        const [, pc] = pcs[0] ?? []
        let types: string[] = []
        if (pc) {
          const stats = await pc.getStats()
          const cands = new Map<string, string>()
          stats.forEach((s) => {
            if (s.type === 'local-candidate') cands.set(s.id, String(s.candidateType))
          })
          stats.forEach((s) => {
            if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.localCandidateId) {
              const t = cands.get(s.localCandidateId)
              if (t) types = [...types, t]
            }
          })
        }
        const info = types.length ? ` (via ${[...new Set(types)].join('/')})` : ''
        patch('p2p', {
          status: 'fail',
          detail: `Nenhum par conectado. Rede bloqueando a conexão direta (roteador/firewall)${info}. Teste desativando VPN/firewall do Windows para este app.`
        })
      }
    } catch {
      patch('p2p', { status: 'warn', detail: 'Não foi possível analisar a conexão agora.' })
    }

    setRunning(false)
    // tom de teste fica por conta do usuário (botão abaixo)
  }, [micVolume, outputVolume, patch, voiceChannelId])

  const playTone = useCallback(async () => {
    try {
      const v = voice()
      const snap = v?.debugSnapshot()
      const deviceId = (snap?.outputDeviceId as string | null) ?? undefined
      const ctx = new AudioContext()
      type SinkIdCtx = AudioContext & { setSinkId?: (id: string) => Promise<void> }
      const sinkCtx = ctx as SinkIdCtx
      if (deviceId && sinkCtx.setSinkId) await sinkCtx.setSinkId(deviceId)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 440
      gain.gain.value = 0.12
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      await new Promise((r) => setTimeout(r, 900))
      osc.stop()
      void ctx.close()
    } catch {
      /* falha do tom aparece como veredito manual */
    }
  }, [])

  const restoreVolumes = useCallback(() => {
    setMicVolume(1)
    setOutputVolume(1)
    patch('vol', { status: 'ok', detail: 'Volumes restaurados para 100%.' })
  }, [patch, setMicVolume, setOutputVolume])

  const icon = (s: Status): string =>
    s === 'ok' ? '✓' : s === 'warn' ? '⚠' : s === 'fail' ? '✕' : s === 'run' ? '…' : '·'

  return (
    <div className="vts-overlay" onClick={onClose}>
      <div className="vts-modal" onClick={(e) => e.stopPropagation()}>
        <header className="vts-header">
          <h3>Solução de problemas de voz</h3>
          <button className="vts-close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </header>

        <div className="vts-body">
          <ul className="vts-list">
            {results.map((r) => (
              <li key={r.id} className={`vts-item ${r.status}`}>
                <span className="vts-icon">{icon(r.status)}</span>
                <div className="vts-text">
                  <strong>{r.label}</strong>
                  {r.detail && <span>{r.detail}</span>}
                </div>
              </li>
            ))}
          </ul>

          <div className="vts-tone">
            <button className="btn-secondary" disabled={running} onClick={() => void playTone()}>
              Tocar som de teste
            </button>
            {toneVerdict === null ? (
              <span className="vts-hint">Toque o som e diga se você ouviu:</span>
            ) : (
              <span className="vts-hint">Você ouviu?</span>
            )}
            <div className="vts-verdict">
              <button
                className={`vts-vote ${toneVerdict === 'ok' ? 'yes' : ''}`}
                onClick={() => {
                  setToneVerdict('ok')
                  patch('out', { status: 'ok', detail: 'Você confirmou que ouviu o som de teste.' })
                }}
              >
                Ouvi
              </button>
              <button
                className={`vts-vote no ${toneVerdict === 'fail' ? 'sel' : ''}`}
                onClick={() => {
                  setToneVerdict('fail')
                  patch('out', {
                    status: 'fail',
                    detail: 'Som não reproduzido: escolha outro dispositivo de saída no seletor acima ou verifique o volume do Windows.'
                  })
                }}
              >
                Não ouvi
              </button>
            </div>
          </div>

          {(micVolume === 0 || outputVolume === 0) && (
            <button className="btn-primary vts-fix" onClick={restoreVolumes}>
              Restaurar volumes em 100%
            </button>
          )}
        </div>

        <footer className="vts-footer">
          <button className="btn-secondary" disabled={running} onClick={() => void runAll()}>
            {running ? 'Analisando…' : 'Executar análise'}
          </button>
        </footer>
      </div>
    </div>
  )
}
