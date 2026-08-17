import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/useApp'

export default function AuthScreen(): React.JSX.Element {
  const { login, register, notify, savedCredentials, storeCredentials, forgetCredentials } = useApp()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState(savedCredentials?.email ?? '')
  const [username, setUsername] = useState(savedCredentials?.username ?? '')
  const [password, setPassword] = useState(savedCredentials?.password ?? '')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoLoginTried = useRef(false)

  // Login automático: se o usuário marcou "Lembrar de mim" antes, entra sozinho
  useEffect(() => {
    if (autoLoginTried.current) return
    if (!savedCredentials?.email || !savedCredentials.password) return
    autoLoginTried.current = true
    setBusy(true)
    login(savedCredentials.email, savedCredentials.password)
      .catch(() => {
        // não conseguiu entrar automaticamente (ex.: sem rede) — deixa o
        // formulário preenchido para o usuário clicar em Entrar
        setError('Não foi possível entrar automaticamente. Confira os dados abaixo.')
      })
      .finally(() => setBusy(false))
  }, [savedCredentials, login])

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (busy) return
    if (!email.trim() || !password) {
      setError('Preencha e-mail e senha.')
      return
    }
    if (mode === 'register' && username.trim().length < 2) {
      setError('Escolha um nome de usuário com pelo menos 2 caracteres.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else {
        await register(email.trim(), password, username.trim())
        notify('success', `Bem-vindo(a), ${username.trim()}!`)
      }
      // guarda (ou apaga) as credenciais conforme o checkbox
      if (remember) {
        await storeCredentials({ email: email.trim(), password, username: username.trim() })
      } else {
        await forgetCredentials()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo deu errado.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">💬</div>
          <h1>CallVortex</h1>
          <p>Converse com seus amigos em tempo real</p>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
            Entrar
          </button>
          <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>
            Criar conta
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && (
            <label>
              Nome de usuário
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: guilherme"
                maxLength={24}
                autoFocus
              />
            </label>
          )}
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" autoFocus={mode === 'login'} />
          </label>
          <label>
            Senha
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={6} />
          </label>

          <label className="auth-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Lembrar de mim (entra automaticamente na próxima vez)</span>
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary btn-block" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  )
}
