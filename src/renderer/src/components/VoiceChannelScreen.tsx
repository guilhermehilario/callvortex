import { useEffect, useState } from 'react'
import type { Channel } from '../lib/types'
import { useApp } from '../lib/useApp'
import {
  HeadphonesIcon,
  HeadphonesOffIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  VolumeHighIcon
} from './Icons'
import ScreenShareButton from './ScreenShareButton'
import VoiceParticipantTiles from './VoiceParticipantTiles'

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
 * Sala do canal de voz — layout de chamada: a área central fica livre
 * para vídeo/compartilhamento; na faixa inferior ficam os cards dos
 * participantes e, logo abaixo, o dock de controles da chamada.
 * Configurações de microfone vivem apenas na barra lateral.
 */
export default function VoiceChannelScreen({ channel }: { channel: Channel }): React.JSX.Element {
  const {
    voiceChannelId,
    voiceRoster,
    voicePresence,
    voiceSessions,
    voiceMuted,
    voiceDeafened,
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

        {/* faixa inferior compacta: cards empurrados para o rodapé */}
        {joined && <VoiceParticipantTiles members={members} joined={joined} />}

        {joined && (
          <div className="voice-controls-dock">
            <button
              className={`voice-control ${voiceMuted ? 'active' : ''}`}
              title={voiceMuted ? 'Ativar microfone' : 'Silenciar microfone'}
              onClick={toggleVoiceMute}
            >
              {voiceMuted ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
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
