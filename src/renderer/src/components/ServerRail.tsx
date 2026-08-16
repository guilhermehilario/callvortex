import { useApp } from '../lib/useApp'
import Avatar from './Avatar'

function PlusIcon(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function CompassIcon(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5 13.6 13.6 8.5 15.5 10.4 10.4z" />
    </svg>
  )
}

export default function ServerRail(): React.JSX.Element {
  const { servers, screen, selectServer, selectDm, openModal } = useApp()
  const dmActive = screen?.type === 'dm'

  return (
    <nav className="server-rail">
      <div className="server-rail-top">
        <button
          className={`rail-btn rail-dm ${dmActive ? 'active' : ''}`}
          title="Mensagens diretas"
          onClick={() => selectDm(null)}
        >
          <span className="rail-dm-icon">💬</span>
        </button>
        <div className="rail-divider" />
      </div>

      <div className="rail-servers">
        {servers.map((s) => {
          const active = screen?.type === 'server' && screen.serverId === s.id
          return (
            <button
              key={s.id}
              className={`rail-btn ${active ? 'active' : ''}`}
              title={s.name}
              onClick={() => void selectServer(s.id)}
            >
              <Avatar name={s.name} color={s.icon_color} size={48} />
              <span className="rail-tooltip">{s.name}</span>
            </button>
          )
        })}
      </div>

      <div className="rail-actions">
        <button className="rail-btn rail-add" title="Criar servidor" onClick={() => openModal('create-server')}>
          <PlusIcon />
        </button>
        <button className="rail-btn rail-add" title="Entrar em servidor (código)" onClick={() => openModal('join-server')}>
          <CompassIcon />
        </button>
      </div>
    </nav>
  )
}
