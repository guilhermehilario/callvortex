import { useEffect, useState } from 'react'
import type { Channel } from '../lib/types'
import { useApp } from '../lib/useApp'
import Avatar from './Avatar'
import {
  ChevronDownIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  VolumeHighIcon,
  VolumeMuteIcon
} from './Icons'
import MicPicker from './MicPicker'
import ScreenShareButton from './ScreenShareButton'
import { ScreenSharingDot } from './ScreenShareStage'
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

/**
 * Sala do canal de voz — layout de chamada estilo Discord:
 * grade de "tiles" (um por participante, anel verde quando fala),
 * dock de controles flutuante na base e popover de microfone.
 */
export default function VoiceChannelScreen({ channel }: { channel: Channel }): React.JSX.Element {
  const {
    profile,
    voiceChannelId,
    voiceRoster,
    voicePresence,
    voiceSessions,
    voiceMuted,
    voiceDeafened,
    micVolume,
    outputVolume,
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
  const [pickerOpen, setPickerOpen] = useState(false)
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(iv)
  }, [])
  // saiu da sala: fecha o popover junto
  useEffect(() => {
    if (!joined) setPickerOpen(false)
  }, [joined])
  const activity = startedAt && members.length > 0 ? formatActivity(startedAt, now) : null

  return (
    <section className="chat voice-screen">
      <header className="chat-header">
        <div className="chat-title">
          <span className="voice-call-channel-icon">
            <VolumeHighIcon size={20} />
          </span>
          {channel.name}
          <span className="chat-subtitle">
            Canal de voz ·{' '}
            {members.length > 0 ? (
              <>
                {members.length === 1 ? '1 conectado' : `${members.length} conectados`}
                {activity && (
                  <>
                    {' · '}
                    <span
                      className="voice-screen-activity"
                      title={startedAt ? `Sala ativa desde ${new Date(startedAt).toLocaleString('pt-BR')}` : 'Sala ativa'}
                    >
                      ativo há {activity}
                    </span>
                  </>
                )}
              </>
            ) : (
              'vazio'
            )}
          </span>
        </div>
      </header>

      <div className="voice-call">
        {!joined && (
          <div className="voice-call-empty">
            <span className="voice-call-empty-icon">
              <VolumeHighIcon size={44} />
            </span>
            <h2 className="voice-call-empty-title">{channel.name}</h2>
            <p className="voice-call-empty-hint">
              {members.length > 0
                ? 'Entre no canal para conversar por voz com quem estiver aqui.'
                : 'Ninguém aqui ainda. Entre e compartilhe o código de convite para chamar os amigos!'}
            </p>
            <button className="btn-primary voice-join-btn" onClick={() => void joinVoice(channel.id)}>
              Entrar no canal de voz
            </button>
          </div>
        )}

        {members.length > 0 && (
          <div className="voice-tiles">
            {members.map((m) => {
              const isMe = m.userId === profile?.id
              const speaking = joined && speakingUsers.has(m.userId)
              const vol = Math.round((peerVolumes[m.userId] ?? 1) * 100)
              return (
                <div key={m.userId} className={`voice-tile ${speaking ? 'speaking' : ''}`}>
                  <div className="voice-tile-top">
                    <ScreenSharingDot userId={m.userId} />
                    {joined && !isMe && (
                      <span className="voice-tile-signal">
                        <SignalBars quality={peerSignals[m.userId] ?? 0} />
                      </span>
                    )}
                  </div>

                  <span className={`voice-tile-avatar ${speaking ? 'speaking' : ''}`}>
                    <Avatar name={m.username} color={m.avatar_color} size={72} url={m.avatar_url} />
                  </span>
                  <span className="voice-tile-name" title={m.username}>
                    {m.username}
                    {isMe && <span className="voice-tile-you">(você)</span>}
                  </span>

                  {joined && isMe && (voiceMuted || voiceDeafened || micVolume === 0 || outputVolume === 0) && (
                    <div className="voice-tile-badges">
                      {(voiceMuted || micVolume === 0) && (
                        <span
                          className={`voice-tile-badge ${voiceMuted ? 'red' : 'amber'}`}
                          title={voiceMuted ? 'Microfone silenciado' : 'Volume do microfone em 0% — ninguém consegue ouvir você'}
                        >
                          <MicOffIcon size={13} />
                        </span>
                      )}
                      {(voiceDeafened || outputVolume === 0) && (
                        <span
                          className={`voice-tile-badge ${voiceDeafened ? 'red' : 'amber'}`}
                          title={voiceDeafened ? 'Sem som' : 'Volume de saída em 0% — você não ouve os participantes'}
                        >
                          <HeadphonesOffIcon size={13} />
                        </span>
                      )}
                    </div>
                  )}

                  {joined && !isMe && (
                    <div className="voice-tile-volume" title={`Volume de ${m.username}`}>
                      <span className="voice-tile-vol-icon">{vol === 0 ? <VolumeMuteIcon size={13} /> : <VolumeHighIcon size={13} />}</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={vol}
                        onChange={(e) => setPeerVolume(m.userId, Number(e.target.value) / 100)}
                        style={{ '--fill': `${vol}%` } as React.CSSProperties}
                        aria-label={`Volume de ${m.username}`}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {joined && (
          <div className="voice-controls-dock">
            {pickerOpen && (
              <div className="voice-dock-picker">
                <MicPicker />
              </div>
            )}
            <button
              className={`voice-control ${voiceMuted ? 'active' : ''}`}
              title={voiceMuted ? 'Ativar microfone' : 'Silenciar microfone'}
              onClick={toggleVoiceMute}
            >
              {voiceMuted ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
            </button>
            <button
              className={`voice-control settings ${pickerOpen ? 'open' : ''}`}
              title={pickerOpen ? 'Fechar configurações de voz' : 'Configurações de voz (microfone, volume, ruído)'}
              onClick={() => setPickerOpen((v) => !v)}
            >
              <ChevronDownIcon size={16} />
            </button>
            <button
              className={`voice-control ${voiceDeafened ? 'active' : ''}`}
              title={voiceDeafened ? 'Ouvir de novo' : 'Ficar surdo (sem som)'}
              onClick={toggleVoiceDeafen}
            >
              {voiceDeafened ? <HeadphonesOffIcon size={20} /> : <HeadphonesIcon size={20} />}
            </button>
            <ScreenShareButton variant="control" />
            <button className="voice-control leave" title="Sair do canal de voz" onClick={() => void leaveVoice()}>
              <PhoneOffIcon size={20} />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
