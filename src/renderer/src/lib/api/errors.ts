/**
 * Helpers de erro da camada de API.
 *
 * Módulo folha: sem dependências do resto do app; é importado por `api.ts`
 * (e por futuras fatias `api/*.ts`) para padronizar as mensagens lançadas
 * para a UI.
 */

/**
 * Converte um erro em mensagem amigável (SEC-016).
 * Mensagens internas do Supabase/Postgres (RLS, constraints, PGRST…) são
 * logadas no console para diagnóstico, mas NÃO expostas ao usuário — evita
 * vazar detalhes do schema/banco na UI.
 */
export function err(message: string, error: unknown): Error {
  const detail = error && typeof error === 'object' && 'message' in error ? String((error as { message: string }).message) : String(error)
  if (/row-level security|permission denied|violates (unique|foreign key|check|not-null)|duplicate key|pgrst|new row violates/i.test(detail)) {
    console.error('[api]', message, '->', detail)
    return new Error(`${message}.`)
  }
  return new Error(`${message}${detail ? `: ${detail}` : ''}`)
}

/**
 * Converte erros de rede/API em mensagens amigáveis.
 * "Failed to fetch" normalmente significa que a URL do Supabase está errada,
 * sem internet, ou o projeto não existe — nada que o usuário possa resolver
 * dentro do app.
 */
export function friendlyError(prefix: string, error: unknown): Error {
  const raw = error && typeof error === 'object' && 'message' in error ? String((error as { message: string }).message) : String(error)
  if (/failed to fetch|networkerror|network error|fetch failed|socket hang/i.test(raw)) {
    return new Error(
      `${prefix}. Não foi possível conectar ao servidor — verifique sua internet e se as chaves no arquivo .env (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY) estão corretas.`
    )
  }
  if (/rate limit|over_email_send_rate_limit|too many requests/i.test(raw)) {
    return new Error(
      `${prefix}: o Supabase atingiu o limite temporário de e-mails/cadastros (o plano grátis permite poucos por hora). Aguarde cerca de 1 hora e tente de novo, ou desative a confirmação de e-mail no painel do Supabase (Authentication → Providers → Email → desmarque "Confirm email").`
    )
  }
  return err(prefix, error)
}
