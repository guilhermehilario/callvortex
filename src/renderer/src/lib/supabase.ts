import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseReady = Boolean(url && anonKey)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!url || !anonKey) {
      throw new Error(
        'Configuração do Supabase incompleta. Adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env do projeto.'
      )
    }
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  }
  return client
}
