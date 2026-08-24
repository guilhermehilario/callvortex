import { useApp } from '../lib/useApp'
import type { VoicePeerInfo } from '../lib/types'
import Avatar from './Avatar'
import { HeadphonesOffIcon, MicOffIcon, VolumeHighIcon, VolumeMuteIcon } from './Icons'
import SignalBars from './SignalBars'
import { ScreenSharingDot } from './ScreenShareStage'

/**
 * Faixa inferior da chamada: cards compactos dos participantes,
 * centralizados e lado a lado. Cada card mantém os indicadores e
 * controles individuais (sinal, mute/surdo, volume por pessoa).
 * Apenas layout/organização — nenhum comportamento de mídia aqui.
 */
export default function VoiceParticipantTiles({
  members,
  joined
}: {
  members: VoicePeerInfo[]
  joined: boolean
}): React.JSX.Element | null {
  const {
    profile,
    speakingUsers,
    peerSignals,
    peerVolumes,
    setPeerVolume,
    screenShareState,
    micVolume,
    outputVolume
  } = useApp()

  if (members.length === 0) return null

  return (
    <div className="voice-tiles">
      {members.map((m) => {
        const isMe = m.userId === profile?.id
        const speaking = joined && speakingUsers.has(m.userId)
        const sharing = screenShareState.sharerId === m.userId
        const vol = Math.round((peerVolumes[m.userId] ?? 1) * 100)
        return (
          <div key={m.userId} className={`voice-tile ${speaking ? 'speaking' : ''} ${sharing ? 'sharing' : ''}`}>
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

            {/* estado transmitido na presença: todos veem quem está
                mudo ou surdo; volume 0% só eu consigo medir */}
            {joined && (m.muted || m.deafened) && (
              <div className="voice-tile-badges">
                {m.muted && (
                  <span className="voice-tile-badge red" title="Microfone silenciado">
                    <MicOffIcon size={13} />
                  </span>
                )}
                {m.deafened && (
                  <span className="voice-tile-badge red" title="Sem som (surdo)">
                    <HeadphonesOffIcon size={13} />
                  </span>
                )}
                {isMe && micVolume === 0 && !m.muted && (
                  <span className="voice-tile-badge amber" title="Volume do microfone em 0% — ninguém consegue ouvir você">
                    <MicOffIcon size={13} />
                  </span>
                )}
                {isMe && outputVolume === 0 && !m.deafened && (
                  <span className="voice-tile-badge amber" title="Volume de saída em 0% — você não ouve os participantes">
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
  )
}
