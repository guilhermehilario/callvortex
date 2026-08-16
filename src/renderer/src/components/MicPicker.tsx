import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/useApp'

/**
 * Seletor de microfone: lista os dispositivos de áudio do sistema, permite
 * trocar ao vivo (durante a chamada) e tem um botão "Testar" que mostra a
 * barra de nível — assim dá para confirmar que o mic captura som antes de
 * entrar no canal de voz.
 */
export default function MicPicker(): React.JSX.Element {
  const { microphones, selectedMicId, voiceChannelId, voiceInputLevel, loadMicrophones, selectMicrophone } = useApp()

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
      const source = ctx.createMediaStreamSource(stream)
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
    } catch {
      setTesting(false)
      setTestError('Não foi possível acessar este microfone. Verifique se ele está conectado e as permissões de áudio do sistema.')
    }
  }

  // dentro do canal: nível vem do áudio ao vivo; no teste: nível do teste
  const level = testing ? testLevel : voiceChannelId ? voiceInputLevel : 0
  const pct = Math.min(100, Math.round((level / 0.15) * 100))

  return (
    <div className="mic-picker">
      <div className="mic-picker-row">
        <span className="mic-picker-label">🎤 Microfone</span>
        <button className="mic-picker-refresh" title="Atualizar lista de dispositivos" onClick={() => void loadMicrophones()}>
          ↻
        </button>
      </div>
      <div className="mic-picker-select-row">
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
        <button
          className={`mic-test-btn ${testing ? 'testing' : ''}`}
          onClick={() => void (testing ? stopTest() : startTest())}
          title={testing ? 'Parar teste' : 'Testar se este microfone capta som'}
        >
          {testing ? '■ Parar' : 'Testar'}
        </button>
      </div>
      <div className="mic-level" title="Nível do microfone (fale para ver a barra mexer)">
        <div className="mic-level-fill" style={{ width: `${pct}%` }} />
      </div>
      {testError && <div className="mic-test-error">{testError}</div>}
    </div>
  )
}
