import { useApp } from '../lib/useApp'
import Avatar from './Avatar'
import MicPicker from './MicPicker'
import SignalBars from './SignalBars'

export default function VoiceBar(): React.JSX.Element | null {
  const {
    profile,
    voiceChannelId,
    voiceRoster,
    voiceMuted,
    voiceDeafened,
    speakingUsers,
    peerSignals,
    channels,
    leaveVoice,
    toggleVoiceMute,
    toggleVoiceDeafen
  } = useApp()

  if (!voiceChannelId) return null
  const channel = channels.find((c) => c.id === voiceChannelId)

  return (
    <div className="voice-bar">
      <div className="voice-bar-info">
        <span className="voice-bar-icon">🔊</span>
        <div className="voice-bar-text">
          <div className="voice-bar-title">{channel?.name ?? 'Canal de voz'}</div>
          <div className="voice-bar-members">
            {voiceRoster.length === 0 && <span className="voice-bar-empty">Só você por enquanto</span>}
            {voiceRoster.map((u) => (
              <span key={u.userId} className={`voice-bar-avatar ${speakingUsers.has(u.userId) ? 'speaking' : ''}`}>
                <Avatar name={u.username} color={u.avatar_color} size={22} url={u.avatar_url} />
                {u.userId !== profile?.id && (
                  <span className="voice-bar-signal">
                    <SignalBars quality={peerSignals[u.userId] ?? 0} small />
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="voice-bar-controls">
        <button className={`voice-control ${voiceMuted ? 'active' : ''}`} title={voiceMuted ? 'Ativar microfone' : 'Silenciar microfone'} onClick={toggleVoiceMute}>
          {voiceMuted ? '🔇' : '🎤'}
        </button>
        <button className={`voice-control ${voiceDeafened ? 'active' : ''}`} title={voiceDeafened ? 'Ouvir de novo' : 'Ficar surdo'} onClick={toggleVoiceDeafen}>
          🎧
        </button>
        <button className="voice-control leave" title="Sair do canal de voz" onClick={() => void leaveVoice()}>
          📞
        </button>
      </div>
      <MicPicker />
    </div>
  )
}
