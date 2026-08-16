import type { Channel } from '../lib/types'
import { useApp } from '../lib/useApp'
import Avatar from './Avatar'
import MicPicker from './MicPicker'
import SignalBars from './SignalBars'

export default function VoiceChannelScreen({ channel }: { channel: Channel }): React.JSX.Element {
  const {
    profile,
    voiceChannelId,
    voiceRoster,
    voiceMuted,
    voiceDeafened,
    speakingUsers,
    peerVolumes,
    setPeerVolume,
    peerSignals,
    joinVoice,
    leaveVoice,
    toggleVoiceMute,
    toggleVoiceDeafen
  } = useApp()

  const joined = voiceChannelId === channel.id
  const members = joined ? voiceRoster : []

  return (
    <section className="chat voice-screen">
      <header className="chat-header">
        <div className="chat-title">
          🔊 {channel.name}
          <span className="chat-subtitle">Canal de voz</span>
        </div>
      </header>

      <div className="voice-screen-body">
        <div className="voice-screen-icon">🔊</div>
        <h2 className="voice-screen-title">{channel.name}</h2>
        <p className="voice-screen-hint">
          {joined
            ? members.length > 1
              ? `${members.length} pessoas neste canal`
              : 'Você está no canal. Compartilhe o código de convite para chamar os amigos!'
            : 'Entre no canal para conversar por voz com quem estiver aqui.'}
        </p>

        {members.length > 0 && (
          <div className="voice-members">
            {members.map((m) => {
              const isMe = m.userId === profile?.id
              const vol = Math.round((peerVolumes[m.userId] ?? 1) * 100)
              return (
                <div key={m.userId} className="voice-member">
                  <span className={`voice-member-avatar ${speakingUsers.has(m.userId) ? 'speaking' : ''}`}>
                    <Avatar name={m.username} color={m.avatar_color} size={40} url={m.avatar_url} />
                  </span>
                  <div className="voice-member-info">
                    <span className="voice-member-name">
                      <span className="voice-member-name-text">
                        {m.username}
                        {isMe && <span className="voice-member-you">(você)</span>}
                      </span>
                      {!isMe && <SignalBars quality={peerSignals[m.userId] ?? 0} />}
                    </span>
                    {!isMe && (
                      <div className="voice-member-volume">
                        <span className="voice-member-vol-icon">{vol === 0 ? '🔇' : '🔊'}</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={vol}
                          onChange={(e) => setPeerVolume(m.userId, Number(e.target.value) / 100)}
                          title={`Volume de ${m.username}`}
                        />
                        <span className="voice-member-vol-value">{vol}%</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <MicPicker />

        {joined ? (
          <div className="voice-screen-controls">
            <button className={`voice-control ${voiceMuted ? 'active' : ''}`} title={voiceMuted ? 'Ativar microfone' : 'Silenciar microfone'} onClick={toggleVoiceMute}>
              {voiceMuted ? '🔇' : '🎤'}
            </button>
            <button className={`voice-control ${voiceDeafened ? 'active' : ''}`} title={voiceDeafened ? 'Ouvir de novo' : 'Ficar surdo (sem som)'} onClick={toggleVoiceDeafen}>
              🎧
            </button>
            <button className="voice-control leave" title="Sair do canal de voz" onClick={() => void leaveVoice()}>
              📞
            </button>
          </div>
        ) : (
          <button className="btn-primary voice-join-btn" onClick={() => void joinVoice(channel.id)}>
            Entrar no canal de voz
          </button>
        )}
      </div>
    </section>
  )
}
