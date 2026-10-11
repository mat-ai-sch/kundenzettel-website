import { useEffect, useMemo, useRef, useState } from 'react'

const voiceSpeeds = [0.75, 1, 1.25, 1.5, 2] as const

export function VoiceMessage({
  audio,
  duration,
  transcript,
}: {
  audio: string
  duration: string
  transcript?: string
}) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [time, setTime] = useState(duration)
  const [speed, setSpeed] = useState<(typeof voiceSpeeds)[number]>(1)
  const bars = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => 6 + ((i * 17) % 18) + (i % 3 === 0 ? 6 : 0)),
    [],
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.playbackRate = speed
  }, [speed])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onTime = () => {
      if (!el.duration || Number.isNaN(el.duration)) return
      setProgress(el.currentTime / el.duration)
      const left = Math.max(0, el.duration - el.currentTime)
      const wallLeft = left / el.playbackRate
      const m = Math.floor(wallLeft / 60)
      const s = Math.floor(wallLeft % 60)
      setTime(m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`)
    }
    const onEnd = () => {
      setPlaying(false)
      setProgress(0)
      setTime(duration)
    }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnd)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnd)
    }
  }, [duration])

  async function toggle() {
    const el = ref.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
      return
    }
    el.playbackRate = speed
    try {
      await el.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
    }
  }

  function seek(ratio: number) {
    const el = ref.current
    if (!el || !el.duration) return
    el.currentTime = ratio * el.duration
  }

  function cycleSpeed() {
    setSpeed((prev) => {
      const idx = voiceSpeeds.indexOf(prev)
      return voiceSpeeds[(idx + 1) % voiceSpeeds.length]
    })
  }

  return (
    <div>
      <audio ref={ref} src={audio} preload="metadata" />
      <div className="voice">
        <button className="voice-play" type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Abspielen'}>
          {playing ? (
            <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
          ) : (
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <div
          className="voice-wave"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          tabIndex={0}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            seek((e.clientX - rect.left) / rect.width)
          }}
        >
          {bars.map((h, i) => (
            <i
              key={i}
              className={i / bars.length <= progress ? 'on' : ''}
              style={{ height: h }}
            />
          ))}
        </div>
        <div className="voice-meta">
          <span className="voice-time">{time}</span>
          <button
            className="voice-speed"
            type="button"
            onClick={cycleSpeed}
            aria-label={`Wiedergabegeschwindigkeit ${speed}×`}
            title="Geschwindigkeit ändern"
          >
            {speed}×
          </button>
        </div>
      </div>
      <div className="transcript-box">
        <strong>Transkript</strong>
        {transcript?.trim()
          ? transcript
          : 'Kein wortgetreues Transkript — Aufnahme nicht als natürliche Sprache erkannt.'}
      </div>
    </div>
  )
}
