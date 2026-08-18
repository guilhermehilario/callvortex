import { supabaseUrl } from './supabase'

/** Mede o round-trip até o servidor do app (GET leve; qualquer resposta, mesmo 4xx, vale). */
export async function measurePing(): Promise<number | null> {
  if (!supabaseUrl) return null
  const start = performance.now()
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    await fetch(`${supabaseUrl}/rest/v1/?cv=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal })
    clearTimeout(timer)
    return Math.round(performance.now() - start)
  } catch {
    return null
  }
}

/** Converte ping (ms) em qualidade 0-4 (0 = sem conexão; 4 = excelente). */
export function qualityFromPing(ping: number | null): number {
  if (ping === null) return 0
  if (ping < 80) return 4
  if (ping < 150) return 3
  if (ping < 300) return 2
  return 1
}
