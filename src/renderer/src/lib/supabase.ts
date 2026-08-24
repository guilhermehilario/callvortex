import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Padrão embutido: projeto hospedado que o app sempre usou. A anon key é
// pública por design (o RLS protege os dados) e já viaja dentro de todo
// .exe distribuído — mantê-la aqui garante que builds da CI funcionem sem
// nenhum arquivo .env. Para apontar a outro projeto, defina as variáveis
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no build.
const url = import.meta.env.VITE_SUPABASE_URL || '[URL_REMOVIDA]'
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhndm14bW5zeHlzYnVieWJ4ZHRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NjM0MjAsImV4cCI6MjA3MTEzOTQyMH0.[KEY_REMOVIDA]'

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
