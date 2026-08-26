import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Credenciais vêm EXCLUSIVAMENTE do ambiente de build (.env local ou
// Variables/Secrets do repositório na CI) — nenhum valor sensível vive no
// código-fonte, que é público.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseReady = Boolean(url && anonKey)

export const supabaseUrl = url

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

// Cliente separado usado SOMENTE para observar a presença dos canais de voz.
// O Realtime do Supabase reutiliza a instância de canal por tópico (channel()
// retorna o canal existente se o tópico já foi criado). Se o efeito de presença
// e o VoiceManager usassem o mesmo cliente, o join() receberia o canal já
// inscrito e tentaria registrar callbacks de presence depois do subscribe(),
// lançando "cannot add 'presence' callbacks ... after 'subscribe()'".
let observerClient: SupabaseClient | null = null

export function getSupabaseObserver(): SupabaseClient {
  if (!observerClient) {
    if (!url || !anonKey) {
      throw new Error(
        'Configuração do Supabase incompleta. Adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env do projeto.'
      )
    }
    // O observador NÃO persiste sessão e usa storage próprio: dois GoTrueClient
    // com o mesmo storage key disparam o aviso "Multiple GoTrueClient instances"
    // e podem brigar pelo refresh token. Presença de voz não exige auth — o
    // token é copiado sob demanda no useApp (realtime.setAuth).
    observerClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'sb-callvortex-observer' }
    })
  }
  return observerClient
}
