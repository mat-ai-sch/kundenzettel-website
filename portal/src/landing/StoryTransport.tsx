import { landingCopy } from '../landingCopy'
import type { FlowPhase } from './story/storyProgress'
import './StoryTransport.css'

/**
 * Die beiden ursprünglichen Zeichen (Wiederholen, Abspielen) und darunter die Zeile
 * „Ablauf abspielen“. Die Zeichen bleiben die Bedienung: links von vorn, rechts
 * abspielen, anhalten oder fortsetzen.
 */
export function StoryTransport({
  phase,
  onPlay,
  onPause,
  onResume,
  onReplay,
}: {
  phase: FlowPhase
  onPlay: () => void
  onPause: () => void
  onResume: () => void
  onReplay: () => void
}) {
  const playing = phase === 'PLAYING' || phase === 'REPLAYING'
  const playLabel = playing ? landingCopy.pauseLabel : phase === 'PAUSED' ? landingCopy.resumeLabel : landingCopy.playLabel
  const play = playing ? onPause : phase === 'PAUSED' ? onResume : onPlay
  const quiet = phase === 'REDUCED_MOTION'
  return (
    <div className="lp-transport" data-phase={phase}>
      <div className="lp-transport-icons">
        <button
          type="button"
          className="lp-transport-btn"
          data-slot="replay"
          aria-label={landingCopy.replayLabel}
          disabled={quiet}
          onClick={quiet ? undefined : onReplay}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path d="M5 12a7 7 0 1 0 2.2-5.1M5 4.5v4h4" />
          </svg>
        </button>
        <button
          type="button"
          className="lp-transport-btn"
          data-slot="play"
          aria-label={playLabel}
          disabled={quiet}
          onClick={quiet ? undefined : play}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            {playing ? <path d="M8.5 5.5v13M15.5 5.5v13" /> : <path d="M8 5.5v13l10-6.5-10-6.5Z" />}
          </svg>
        </button>
      </div>
      <p className="lp-transport-caption">{landingCopy.playLabel}</p>
    </div>
  )
}
