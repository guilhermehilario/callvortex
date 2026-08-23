import { useEffect, useState } from 'react'
import type { Channel } from '../lib/types'
import { useApp } from '../lib/useApp'
import Avatar from './Avatar'
import { HeadphonesIcon, HeadphonesOffIcon, MicIcon, MicOffIcon, PhoneOffIcon, VolumeHighIcon, VolumeMuteIcon } from './Icons'
import MicPicker from './MicPicker'
import ScreenShareButton from './ScreenShareButton'
import ScreenShareStage, { ScreenSharingDot } from './ScreenShareStage'
import SignalBars from './SignalBars'

function formatActivity(startedAtIso: string, nowMs: number): string | null {
  const ms = nowMs - new Date(startedAtIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h} h ${m} min ${s} s`
  if (m > 0) return `${m} min ${s} s`
  return `${s} s`
}

export default function VoiceChannelScreen({ channel }: { channel: Channel }): React.JSX.Element {
  const {
    profile,
    voiceChannelId,
    voiceRoster,
    voicePresence,
    voiceSessions,
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
  // dentro da sala: roster do VoiceManager; fora: presença observada
  const members = joined ? voiceRoster : (voicePresence[channel.id] ?? [])
  const startedAt = voiceSessions[channel.id]
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(iv)
  }, [])
  const activity = startedAt && members.length > 0 ? formatActivity(startedAt, now) : null

  return (
    <section className="chat voice-screen">
      <header className="chat-header">
        <div className="chat-title">
          🔊 {channel.name}
          <span className="chat-subtitle">
            Canal de voz
            {activity && (
              <>
                {' · '}
                <span className="voice-screen-activity" title={startedAt ? `Sala ativa desde ${new Date(startedAt).toLocaleString('pt-BR')}` : 'Sala ativa'}>ativo há {activity}</span>
              </>
            )}
          </span>
        </div>
      </header>

      <div className="voice-screen-body">
        {joined && <ScreenShareStage members={members} />}
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
                  <span className={`voice-member-avatar ${joined && speakingUsers.has(m.userId) ? 'speaking' : ''}`}>
                    <Avatar name={m.username} color={m.avatar_color} size={40} url={m.avatar_url} />
                  </span>
                  <div className="voice-member-info">
                    <span className="voice-member-name">
                      <span className="voice-member-name-text">
                        {m.username}
                        {isMe && <span className="voice-member-you">(você)</span>}
                      </span>
                      <ScreenSharingDot userId={m.userId} />
                      {joined && !isMe && <SignalBars quality={peerSignals[m.userId] ?? 0} />}
                    </span>
                    {joined && !isMe && (
                      <div className="voice-member-volume">
                        <span className="voice-member-vol-icon">{vol === 0 ? <VolumeMuteIcon size={14} /> : <VolumeHighIcon size={14} />}</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={vol}
                          onChange={(e) => setPeerVolume(m.userId, Number(e.target.value) / 100)}
                          style={{ '--fill': `${vol}%` } as React.CSSProperties}
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
              {voiceMuted ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
            </button>
            <button className={`voice-control ${voiceDeafened ? 'active' : ''}`} title={voiceDeafened ? 'Ouvir de novo' : 'Ficar surdo (sem som)'} onClick={toggleVoiceDeafen}>
              {voiceDeafened ? <HeadphonesOffIcon size={20} /> : <HeadphonesIcon size={20} />}
            </button>
            {joined && <ScreenShareButton />}
            <button className="voice-control leave" title="Sair do canal de voz" onClick={() => void leaveVoice()}>
              <PhoneOffIcon size={20} />
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
