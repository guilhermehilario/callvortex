import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/useApp'
import { ChevronDownIcon, RefreshIcon } from './Icons'

/**
 * Configurações do fone de ouvido (saída): escolhe em qual dispositivo o som
 * dos participantes toca, ajusta o volume geral e tem um botão "Testar" que
 * toca um tom no dispositivo selecionado.
 */
export default function OutputPicker(): React.JSX.Element {
  const { outputDevices, selectedOutputId, outputVolume, setOutputVolume, loadOutputDevices, selectOutputDevice } = useApp()

  const [testing, setTesting] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const volPct = Math.round(outputVolume * 100)

  const stopTest = (): void => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    void ctxRef.current?.close().catch(() => undefined)
    ctxRef.current = null
    setTesting(false)
  }

  useEffect(() => {
    void loadOutputDevices()
    return stopTest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadOutputDevices])

  const startTest = async (): Promise<void> => {
    stopTest()
    try {
      const ctx = new AudioContext()
      ctxRef.current = ctx
      if (ctx.state === 'suspended') await ctx.resume()
      // toca o tom no dispositivo de saída selecionado ('' = padrão do sistema)
      const ctxWithSink = ctx as AudioContext & { setSinkId?: (sinkId: string) => Promise<void> }
      if (selectedOutputId && typeof ctxWithSink.setSinkId === 'function') {
        try {
          await ctxWithSink.setSinkId(selectedOutputId)
        } catch {
          // dispositivo indisponível — toca no padrão
        }
      }
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 440
      const now = ctx.currentTime
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.15, now + 0.05)
      gain.gain.setValueAtTime(0.15, now + 0.35)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.55)
      setTesting(true)
      timeoutRef.current = window.setTimeout(() => setTesting(false), 700)
    } catch {
      setTesting(false)
    }
  }

  return (
    <div className="mic-picker output-picker">
      <div className="mic-picker-header">
        <span className="mic-picker-label">Fone de ouvido</span>
        <button className="mic-picker-refresh" title="Atualizar lista de dispositivos" onClick={() => void loadOutputDevices()}>
          <RefreshIcon size={14} />
        </button>
      </div>

      <div className="mic-picker-select-row">
            <div className="mic-select-wrap">
              <select
                className="mic-picker-select"
                value={selectedOutputId ?? ''}
                onChange={(e) => void selectOutputDevice(e.target.value)}
                title="Escolha o dispositivo de saída"
              >
                <option value="">Padrão do sistema</option>
                {outputDevices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Saída ${i + 1}`}
                  </option>
                ))}
              </select>
              <ChevronDownIcon size={14} className="mic-select-chevron" />
            </div>
            <button
              className={`mic-test-btn ${testing ? 'testing' : ''}`}
              onClick={() => void (testing ? stopTest() : startTest())}
              title={testing ? 'Parar teste' : 'Tocar um som de teste neste dispositivo'}
            >
              {testing ? 'Parar' : 'Testar'}
            </button>
          </div>

      <div className="mic-volume-row">
        <span className="mic-picker-label">Volume do fone</span>
        <input
          type="range"
          className="mic-volume-slider"
          min={0}
          max={100}
          value={volPct}
          onChange={(e) => setOutputVolume(Number(e.target.value) / 100)}
          style={{ '--fill': `${volPct}%` } as React.CSSProperties}
          title="Volume geral do fone de ouvido"
        />
      </div>
    </div>
  )
}
