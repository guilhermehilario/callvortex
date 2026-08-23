import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScreenShareManager } from './screenShare/manager'
import { listScreenSources } from './screenShare/capture'
import type { ScreenShareState, ScreenSourceInfo } from './screenShare/types'
import type { VoiceManager } from './voice'
import type { Notice } from './app-types'

interface UseScreenShareDeps {
  voiceManager: VoiceManager | null
  profileId: string | null
  voiceChannelId: string | null
  notify: (kind: Notice['kind'], text: string) => void
}

export interface ScreenShareApi {
  screenShareState: ScreenShareState
  /** fontes capturáveis para o picker (telas e janelas) */
  loadScreenSources: () => Promise<ScreenSourceInfo[]>
  /**
   * Fase 1 do início: valida autorização no banco e reserva a vaga.
   * Retorna true quando a UI deve abrir o picker de fontes.
   */
  beginScreenShare: () => Promise<boolean>
  /** Fase 2: fonte escolhida no picker (null = cancelou). */
  confirmScreenSource: (sourceId: string | null) => Promise<void>
  stopScreenShare: () => Promise<void>
}

/**
 * Estado e ações do compartilhamento de tela.
 * O trabalho pesado vive em ScreenShareManager; este hook só o liga ao
 * ciclo de vida React e espelha o estado para o contexto do app.
 */
export function useScreenShare({ voiceManager, profileId, voiceChannelId, notify }: UseScreenShareDeps): ScreenShareApi {
  const managerRef = useRef<ScreenShareManager | null>(null)
  if (!managerRef.current) managerRef.current = new ScreenShareManager()

  const [state, setState] = useState<ScreenShareState>(() => managerRef.current!.getState())
  const lastErrorRef = useRef<string | null>(null)

  // ------------------------------------------------------------
  // Liga o manager ao VoiceManager e espelha o estado
  // ------------------------------------------------------------
  useEffect(() => {
    const m = managerRef.current!
    const sync = (): void => {
      const s = m.getState()
      if (s.error && s.error !== lastErrorRef.current) {
        notify('error', s.error)
        lastErrorRef.current = s.error
      } else if (!s.error) {
        lastErrorRef.current = null
      }
      setState(s)
    }
    m.onChange = sync
    if (voiceManager) {
      m.attach(voiceManager)
      sync()
    }
    return () => {
      m.detach()
      m.onChange = null
    }
  }, [voiceManager, notify])

  // ------------------------------------------------------------
  // Sessão segura acompanha a entrada/saída do canal de voz
  // (sair da chamada encerra o compartilhamento e limpa tudo)
  // ------------------------------------------------------------
  useEffect(() => {
    const m = managerRef.current!
    if (voiceChannelId && profileId) {
      m.enterChannel(voiceChannelId, profileId)
    } else {
      m.leaveChannel()
    }
    return () => undefined
  }, [voiceChannelId, profileId])

  // destruição final no unmount do provider
  useEffect(() => {
    const m = managerRef.current!
    return () => m.destroy()
  }, [])

  const loadScreenSources = useCallback(async () => listScreenSources(), [])

  const beginScreenShare = useCallback(async () => {
    return managerRef.current!.beginStart()
  }, [])

  const confirmScreenSource = useCallback(async (sourceId: string | null) => {
    await managerRef.current!.startWithSource(sourceId)
  }, [])

  const stopScreenShare = useCallback(async () => {
    await managerRef.current!.stop()
  }, [])

  return useMemo<ScreenShareApi>(
    () => ({
      screenShareState: state,
      loadScreenSources,
      beginScreenShare,
      confirmScreenSource,
      stopScreenShare
    }),
    [state, loadScreenSources, beginScreenShare, confirmScreenSource, stopScreenShare]
  )
}
