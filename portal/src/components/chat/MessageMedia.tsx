import { useRef, useState } from 'react'

export type MediaLightboxItem = {
  kind: 'image' | 'video'
  src: string
  poster?: string
  caption?: string
  forwarded?: boolean
}

export function ForwardedLabel({ tone = 'bubble' }: { tone?: 'bubble' | 'lightbox' }) {
  return (
    <div className={`msg-forwarded${tone === 'lightbox' ? ' is-lightbox' : ''}`}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"
        />
      </svg>
      Weitergeleitet
    </div>
  )
}

export function MediaZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path
        fill="currentColor"
        d="M3 3h7v2H5v5H3V3zm11 0h7v7h-2V5h-5V3zM3 14h2v5h5v2H3v-7zm16 0h2v7h-7v-2h5v-5z"
      />
    </svg>
  )
}

export function VideoMessage({
  src,
  caption,
  duration,
  poster,
  onOpen,
}: {
  src: string
  caption?: string
  duration?: string
  poster?: string
  onOpen: () => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  async function togglePlay() {
    const video = ref.current
    if (!video) return
    if (video.paused) await video.play()
    else video.pause()
  }

  return (
    <div>
      <div className="video-shell">
        <video
          ref={ref}
          src={src}
          poster={poster ?? '/products/blickfang.jpg'}
          playsInline
          preload="metadata"
          controls={playing}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onClick={(e) => {
            e.stopPropagation()
            void togglePlay()
          }}
        />
        {!playing && (
          <button
            type="button"
            className="video-play"
            aria-label="Video abspielen"
            onClick={(e) => {
              e.stopPropagation()
              void togglePlay()
            }}
          >
            <span className="video-play-icon" aria-hidden>
              ▶
            </span>
            <span>Video · {duration ?? '0:08'}</span>
          </button>
        )}
        <button
          type="button"
          className="media-zoom-btn"
          aria-label="Video maximieren"
          onClick={(e) => {
            e.stopPropagation()
            ref.current?.pause()
            onOpen()
          }}
        >
          <MediaZoomIcon />
        </button>
      </div>
      {caption && <p className="caption">{caption}</p>}
    </div>
  )
}
