const TITLES: Record<number, string> = {
  0: 'Conectando…',
  1: 'Sinal ruim',
  2: 'Sinal regular',
  3: 'Sinal bom',
  4: 'Sinal excelente'
}

/**
 * Indicador de sinal de rede (estilo Discord): 4 barras verticais.
 * quality: 0 = sem conexão, 1-4 = intensidade do sinal.
 */
export default function SignalBars({ quality, small = false }: { quality: number; small?: boolean }): React.JSX.Element {
  const q = Math.max(0, Math.min(4, quality))
  const cls = q === 0 ? 'none' : q <= 1 ? 'bad' : q === 2 ? 'ok' : 'good'
  return (
    <span className={`signal-bars ${cls} ${small ? 'sm' : ''}`} title={TITLES[q]}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`signal-bar ${i <= q ? 'on' : ''}`} />
      ))}
    </span>
  )
}
