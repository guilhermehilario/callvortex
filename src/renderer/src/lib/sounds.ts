/**
 * Efeitos sonoros do app — sintetizados com Web Audio API (sem arquivos
 * externos, funciona no .exe sem assets extras).
 */
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

interface ToneOpts {
  freq: number
  /** deslocamento (s) a partir do momento atual */
  when?: number
  dur?: number
  vol?: number
  type?: OscillatorType
}

function tone({ freq, when = 0, dur = 0.08, vol = 0.3, type = 'sine' }: ToneOpts): void {
  const ac = getCtx()
  if (!ac) return
  const t0 = ac.currentTime + when
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

/** Alguém entrou na sala (ou você entrou) — pop ascendente */
export function playJoinSound(): void {
  tone({ freq: 480, dur: 0.08, vol: 0.26 })
  tone({ freq: 700, when: 0.07, dur: 0.12, vol: 0.22 })
}

/** Alguém saiu da sala (ou você saiu) — pop descendente */
export function playLeaveSound(): void {
  tone({ freq: 620, dur: 0.08, vol: 0.26 })
  tone({ freq: 380, when: 0.06, dur: 0.12, vol: 0.22 })
}

/** Muto/desmuto o microfone — tick suave e curto */
export function playMuteSound(): void {
  tone({ freq: 880, dur: 0.04, vol: 0.15 })
}

/** Muto/desmuto o áudio (surdo) — tick suave um pouco mais grave */
export function playDeafenSound(): void {
  tone({ freq: 700, dur: 0.04, vol: 0.15 })
}
