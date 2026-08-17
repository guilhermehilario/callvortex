import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/useApp'
import { getNoiseSuppressorModuleUrl } from '../lib/voice'
import { ChevronDownIcon, RefreshIcon } from './Icons'

const LEVEL_BARS = 16
const LEVEL_HEIGHTS = [25, 35, 45, 55, 65, 75, 85, 95, 95, 85, 75, 65, 55, 45, 35, 25]

/**
 * Seletor de microfone: lista os dispositivos de áudio do sistema, permite
 * trocar ao vivo (durante a chamada), ajustar o volume do próprio microfone
 * e tem um botão "Testar" que mostra a barra de nível — assim dá para
 * confirmar que o mic capta som antes de entrar no canal de voz.
 */
export default function MicPicker(): React.JSX.Element {
  const {
    microphones,
    selectedMicId,
    voiceChannelId,
    voiceInputLevel,
    micVolume,
    setMicVolume,
    noiseSuppression,
    setNoiseSuppression,
    loadMicrophones,
    selectMicrophone
  } = useApp()

  const [testing, setTesting] = useState(false)
  const [testLevel, setTestLevel] = useState(0)
  const [testError, setTestError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)

  const stopTest = (): void => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void ctxRef.current?.close().catch(() => undefined)
    ctxRef.current = null
    setTesting(false)
    setTestLevel(0)
    setTestError(null)
  }

  useEffect(() => {
    void loadMicrophones()
    return stopTest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMicrophones])

  const startTest = async (): Promise<void> => {
    stopTest()
    setTestError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {})
        },
        video: false
      })
      streamRef.current = stream
      setTesting(true)
      const ctx = new AudioContext()
      ctxRef.current = ctx
      if (ctx.state === 'suspended') void ctx.resume()
      const source = ctx.createMediaStreamSource(stream)

      // medidor de nível (do áudio cru, como na chamada)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = (): void => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        setTestLevel(Math.sqrt(sum / data.length))
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)

      // retorno de áudio: mesma cadeia enviada numa chamada (redução de
      // ruído + volume), com um pequeno atraso para evitar microfonia
      let node: AudioNode = source
      if (noiseSuppression) {
        try {
          await ctx.audioWorklet.addModule(getNoiseSuppressorModuleUrl())
          const worklet = new AudioWorkletNode(ctx, 'noise-suppressor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1]
          })
          source.connect(worklet)
          node = worklet
        } catch {
          node = source // sem supressor: monitora o áudio cru
        }
      }
      const gain = ctx.createGain()
      gain.gain.value = micVolume
      node.connect(gain)
      const delay = ctx.createDelay(1)
      delay.delayTime.value = 0.5
      gain.connect(delay)
      delay.connect(ctx.destination)
    } catch {
      setTesting(false)
      setTestError('Não foi possível acessar este microfone. Verifique se ele está conectado e as permissões de áudio do sistema.')
    }
  }

  // dentro do canal: nível vem do áudio ao vivo; no teste: nível do teste
  const level = testing ? testLevel : voiceChannelId ? voiceInputLevel : 0
  const pct = Math.min(100, Math.round((level / 0.15) * 100))
  const activeBars = Math.round((pct / 100) * LEVEL_BARS)
  const volPct = Math.round(micVolume * 100)

  return (
    <div className="mic-picker">
      <div className="mic-picker-header">
        <span className="mic-picker-label">Microfone</span>
        <button className="mic-picker-refresh" title="Atualizar lista de dispositivos" onClick={() => void loadMicrophones()}>
          <RefreshIcon size={14} />
        </button>
      </div>

      <div className="mic-picker-select-row">
        <div className="mic-select-wrap">
          <select
            className="mic-picker-select"
            value={selectedMicId ?? ''}
            onChange={(e) => void selectMicrophone(e.target.value)}
            title="Escolha o microfone"
          >
            {microphones.length === 0 && <option value="">Nenhum microfone encontrado</option>}
            {microphones.map((m, i) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || `Microfone ${i + 1}`}
              </option>
            ))}
          </select>
          <ChevronDownIcon size={14} className="mic-select-chevron" />
        </div>
        <button
          className={`mic-test-btn ${testing ? 'testing' : ''}`}
          onClick={() => void (testing ? stopTest() : startTest())}
          title={testing ? 'Parar teste' : 'Testar se este microfone capta som'}
        >
          {testing ? 'Parar' : 'Testar'}
        </button>
      </div>

      <div className="mic-volume-row">
        <span className="mic-picker-label">Volume do microfone</span>
        <input
          type="range"
          className="mic-volume-slider"
          min={0}
          max={100}
          value={volPct}
          onChange={(e) => setMicVolume(Number(e.target.value) / 100)}
          style={{ '--fill': `${volPct}%` } as React.CSSProperties}
          title="Volume do microfone"
        />
      </div>

      <div className="mic-level-bars" title="Nível do microfone (fale para ver as barras mexerem)">
        {LEVEL_HEIGHTS.map((h, i) => (
          <span key={i} className={`mic-level-bar ${i < activeBars ? 'on' : ''}`} style={{ height: `${h}%` }} />
        ))}
      </div>

      <div className="mic-picker-row noise-row">
        <span className="mic-picker-label">Redução de ruído</span>
        <label className="noise-switch" title={noiseSuppression ? 'Redução de ruído ligada' : 'Redução de ruído desligada'}>
          <input type="checkbox" checked={noiseSuppression} onChange={(e) => void setNoiseSuppression(e.target.checked)} />
          <span className="noise-switch-track">
            <span className="noise-switch-thumb" />
          </span>
        </label>
      </div>

      {testing && <div className="mic-test-hint">Ouvindo o retorno do microfone (atraso de 0,5 s)…</div>}
      {testError && <div className="mic-test-error">{testError}</div>}
    </div>
  )
}
