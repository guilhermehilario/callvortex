import { AppProvider, useApp } from './lib/useApp'
import { supabaseReady } from './lib/supabase'
import AuthScreen from './components/AuthScreen'
import ServerRail from './components/ServerRail'
import ChannelSidebar from './components/ChannelSidebar'
import ChatArea from './components/ChatArea'
import MemberList from './components/MemberList'
import Modals from './components/Modals'
import VoiceBar from './components/VoiceBar'

function SetupScreen(): React.JSX.Element {
  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">💬</div>
          <h1>Falta configurar o Supabase</h1>
          <p>Este app usa o Supabase como banco de dados e servidor em tempo real.</p>
        </div>
        <ol className="setup-steps">
          <li>
            Crie um projeto gratuito em <strong>supabase.com</strong> (o botão no chat abre a página).
          </li>
          <li>
            No painel, vá em <strong>Project Settings → API</strong> e copie a <em>Project URL</em> e a <em>anon public key</em>.
          </li>
          <li>
            No projeto, copie o arquivo <code>.env.example</code> para <code>.env</code> e preencha as duas variáveis:
            <pre>
              VITE_SUPABASE_URL=...
              <br />
              VITE_SUPABASE_ANON_KEY=...
            </pre>
          </li>
          <li>
            Rode o <code>supabase/schema.sql</code> no SQL Editor do painel.
          </li>
          <li>Reinicie o app com <code>npm run dev</code>.</li>
        </ol>
      </div>
    </div>
  )
}

function Toast(): React.JSX.Element | null {
  const { notice } = useApp()
  if (!notice) return null
  return (
    <div className={`toast toast-${notice.kind}`}>
      <span>{notice.text}</span>
    </div>
  )
}

function MainLayout(): React.JSX.Element {
  const { screen } = useApp()
  return (
    <div className="app-shell">
      <ServerRail />
      <ChannelSidebar />
      <ChatArea />
      {screen?.type === 'server' && <MemberList serverId={screen.serverId} />}
      <VoiceBar />
      <Toast />
      <Modals />
    </div>
  )
}

function Shell(): React.JSX.Element {
  const { authState } = useApp()
  if (authState === 'loading') {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <span>Carregando…</span>
      </div>
    )
  }
  if (authState === 'signedOut') return <AuthScreen />
  return <MainLayout />
}

export default function App(): React.JSX.Element {
  if (!supabaseReady) return <SetupScreen />
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
