import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { clamp01 } from './storyStates'

/**
 * Zeitbasierte Hero-Story. Eine einzige Zeitlinie läuft einmal vom Intro bis zum Endzustand.
 * Scrollen verändert den Fortschritt nicht: Es wechselt nur die Ebene (Hero → Trust).
 * Phase 6: Zeitwerte nach Brief T-05 und `04-interaction-model.md` §2. Die formale Zustandsmaschine
 * mit Hold-Menge (offscreen, hidden-tab, user-pause, overlay) folgt in Phase 9.
 */

/** Dauer der Zeitlinie: Soll 8,0 s, erlaubt 7–9 s. */
export const STORY_MS = 8000
export const STORY_MS_RANGE = { min: 7000, max: 9000 } as const
/** Pause zwischen sichtbarer Bühne und Start der Zeitlinie (Intro bleibt stehen), höchstens 600 ms. */
export const START_DELAY_MS = 600
/** Kürzere Pause beim Wiederholen: Die Nutzerin hat die Bühne schon im Blick, höchstens 300 ms. */
export const REPLAY_DELAY_MS = 300
/** Obergrenze je Frame, damit Tab-Wechsel die Zeitlinie nicht überspringen lässt. */
export const MAX_FRAME_MS = 100
/** Anteil der Bühne, ab dem sie als „im Blick“ gilt. */
const VISIBLE_RATIO = 0.35

/** Ab diesem Anteil gilt die ganze Bühne als sichtbar, auch wenn die Preis-Zeile unterhalb der Falz liegt. */
const FULL_RATIO = 0.9

export type StageRect = { top: number; bottom: number }

/**
 * Startregel (04 §2, Wire 06 §11 Nr. 5): Die Zeitlinie läuft nur, wenn mindestens 35 % der Bühne im Blick sind
 * UND die Pointe sichtbar ist: die Zeile `Preis (vereinbart)` liegt vollständig im Viewport oder mindestens
 * 90 % der Bühne sind sichtbar. So läuft die Geschichte nie ab, während ihre Pointe außerhalb des Bildes liegt
 * (mobil, kurze Viewports). Ohne Preis-Zeile gilt allein die 35-%-Regel.
 */
export function stageInView(stage: StageRect, price: StageRect | null, viewportHeight: number): boolean {
  const height = stage.bottom - stage.top
  if (height <= 0 || viewportHeight <= 0) return false
  const visible = Math.min(stage.bottom, viewportHeight) - Math.max(stage.top, 0)
  const ratio = Math.max(0, visible) / height
  if (ratio < VISIBLE_RATIO) return false
  if (ratio >= FULL_RATIO || !price) return true
  return price.top >= 0 && price.bottom <= viewportHeight
}

/** Fortschritt 0–1 nach `elapsedMs` Zeitlinie (ohne Startverzögerung), linear in der Zeit. */
export function storyProgressAt(elapsedMs: number, durationMs: number = STORY_MS): number {
  const duration = Math.min(STORY_MS_RANGE.max, Math.max(STORY_MS_RANGE.min, durationMs))
  return clamp01(elapsedMs / duration)
}

/** Ein Zeitschritt der Uhr; unterbrochene Frames zählen höchstens `MAX_FRAME_MS`. */
export function advanceClock(elapsedMs: number, deltaMs: number): number {
  return elapsedMs + Math.min(MAX_FRAME_MS, Math.max(0, deltaMs))
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** `?autoplay=0` und Reduced Motion: sofort der Endzustand, keine Zeitlinie. Auch für statische Screenshots. */
export function skipsTimeline(): boolean {
  if (typeof window === 'undefined') return false
  if (prefersReducedMotion()) return true
  return new URLSearchParams(window.location.search).get('autoplay') === '0'
}

/**
 * Ablauf der Hero-Story. Kein einzelnes `isPlaying`.
 * STATIC ist der erste Eindruck: der vollständige Auftrag steht, die Uhr läuft nicht.
 */
export type FlowPhase = 'STATIC' | 'PLAYING' | 'PAUSED' | 'COMPLETED' | 'REPLAYING' | 'REDUCED_MOTION'

export function resolveFlowPhase(input: {
  reduced: boolean
  engaged: boolean
  finished: boolean
  paused: boolean
  replaying: boolean
}): FlowPhase {
  if (input.reduced) return 'REDUCED_MOTION'
  if (!input.engaged) return 'STATIC'
  if (input.finished) return 'COMPLETED'
  if (input.paused) return 'PAUSED'
  if (input.replaying) return 'REPLAYING'
  return 'PLAYING'
}

/** Fortschritt außerhalb von React: die Bühne abonniert ihn, die übrige Seite rendert nicht pro Frame. */
export type ProgressSource = {
  get: () => number
  subscribe: (listener: () => void) => () => void
}

export type StoryTimeline = {
  /** Abonnement für die Bühne. Die Seite selbst liest den Wert nicht bei jedem Tick. */
  progressSource: ProgressSource
  scrolled: boolean
  /** `progress === 1`: Endzustand steht. */
  finished: boolean
  /** Zeitlinie hat begonnen (auch pausiert) oder der Endzustand steht. */
  started: boolean
  /** Nutzerpause (sticky), nur wenn die Zeitlinie nicht fertig ist. */
  paused: boolean
  waiting: boolean
  /** Von vorn: Auswahl gibt es im Hero nicht mehr, `progress = 0`, Replay-Verzögerung. */
  replay: () => void
  pause: () => void
  resume: () => void
  /** Springt zum Endzustand. */
  skip: () => void
  /** STATIC → PLAYING. Startet die Uhr beim ersten Mal. */
  play: () => void
  /** Benannte Phase. Die Seite leitet daraus keine zweite Uhr ab. */
  flow: FlowPhase
}


/** React-Setter, die der Controller bedient (in Tests durch Spione ersetzbar). */
export type StoryUi = {
  setProgress: (update: (previous: number) => number) => void
  setScrolled: (update: (previous: boolean) => boolean) => void
  setStarted: (value: boolean) => void
  setPaused: (value: boolean) => void
  setWaiting: (value: boolean) => void
  setEngaged?: (value: boolean) => void
  setReplaying?: (value: boolean) => void
}

export type StoryControllerOptions = {
  /** true: Uhr startet von selbst (Tests der Zeitlinie). false: STATIC, bis `play` oder `replay`. */
  autostart?: boolean
}

export type StoryControls = {
  replay: () => void
  pause: () => void
  resume: () => void
  skip: () => void
  play: () => void
}

/**
 * Zustand und Uhr der Zeitlinie außerhalb von React: deterministisch testbar (globale `window`/`document`/rAF
 * lassen sich stubben). Der Hook bindet nur noch Setter und Aufräumen an.
 */
export function createStoryController(
  target: HTMLElement | null,
  skip: boolean,
  ui: StoryUi,
  options?: StoryControllerOptions,
): { controls: StoryControls; dispose: () => void } {
  let frame = 0
  let lastNow = 0
  let elapsed = 0
  let delayLeft = START_DELAY_MS
  // Ohne Ziel (Reduced Motion, `?autoplay=0`) zählt die Bühne als sichtbar; sonst entscheidet `evaluate`.
  let visible = skip || !target
  let userPaused = false
  let done = skip
  /** Ohne Auftrag läuft die Uhr nicht. Der Hero zeigt den Endzustand (STATIC). */
  let armed = options?.autostart !== false
  let replaying = false
  let disposed = false
  /** Offscreen-Hold aktiv (Bühne oder Pointe nicht im Blick): der Transport zeigt dann „Fortsetzen“. */
  let holdOffscreen = false
  /** Die Nutzerin hat den Offscreen-Hold per Transport aufgehoben: die Story läuft auch außerhalb des Bildes. */
  let forced = false

  const publish = (value: number) => {
    if (disposed) return
    ui.setProgress((previous) => (previous === value ? previous : value))
  }
  const stop = () => {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    lastNow = 0
  }
  const finish = () => {
    done = true
    userPaused = false
    holdOffscreen = false
    ui.setWaiting(false)
    stop()
    ui.setPaused(false)
    ui.setStarted(true)
    publish(1)
  }
  const tick = (now: number) => {
    frame = 0
    if (disposed || done || userPaused || !visible) {
      lastNow = 0
      return
    }
    const delta = lastNow ? now - lastNow : 0
    lastNow = now
    if (delayLeft > 0) {
      delayLeft -= Math.min(MAX_FRAME_MS, delta)
      if (delayLeft <= 0 && replaying) {
        replaying = false
        ui.setReplaying?.(false)
      }
    } else {
      if (replaying) {
        replaying = false
        ui.setReplaying?.(false)
      }
      ui.setStarted(true)
      elapsed = advanceClock(elapsed, delta)
      const next = storyProgressAt(elapsed)
      publish(next)
      if (next >= 1) {
        done = true
        return
      }
    }
    if (!disposed) frame = requestAnimationFrame(tick)
  }
  const run = () => {
    if (!armed || done || userPaused || !visible || frame) return
    frame = requestAnimationFrame(tick)
  }

  // Hold „offscreen“: Bühne und Pointe (Preis-Zeile) nicht im Blick → Zeitlinie steht (stageInView).
  // `allowFinish = false` (Wiederholen): ein Wechsel zur Trust-Ebene darf die frisch gestartete Zeitlinie nicht sofort beenden.
  const check = (allowFinish: boolean) => {
    if (skip || done || !target || !armed) return
    const rect = target.getBoundingClientRect()
    // Die Pointe = Preis-Zeile bis Ende der Status-Leiste (beides ändert sich in B7).
    const priceEl = target.querySelector('.lp-presentation-live [data-order-field="preisVereinbart"]')
    const statusEl = target.querySelector('.lp-presentation-live .status-track')
    const price = priceEl?.getBoundingClientRect()
    const status = statusEl?.getBoundingClientRect()
    const pointe = price ? { top: price.top, bottom: Math.max(price.bottom, status?.bottom ?? 0) } : null
    const inView = stageInView({ top: rect.top, bottom: rect.bottom }, pointe, window.innerHeight)
    if (inView || forced) {
      visible = true
      if (holdOffscreen) {
        holdOffscreen = false
        ui.setWaiting(false)
      }
      run()
      return
    }
    visible = false
    stop()
    if (!holdOffscreen) {
      holdOffscreen = true
      ui.setWaiting(true)
    }
    // Schneller Wechsel zur Trust-Ebene: sofort Endzustand, damit beim Zurückscrollen nichts fehlt.
    if (allowFinish && rect.bottom < window.innerHeight * 0.5) finish()
  }
  const evaluate = () => check(true)

  const onScroll = () => {
    const next = window.scrollY > 24
    ui.setScrolled((previous) => (previous === next ? previous : next))
    evaluate()
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', evaluate)

  // Hold „hidden-tab“: Im verdeckten Tab steht die Uhr; beim Zurückkehren läuft sie ohne Sprung weiter.
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') stop()
    else evaluate()
  }
  document.addEventListener('visibilitychange', onVisibility)

  let observer: IntersectionObserver | undefined
  let resizeObserver: ResizeObserver | undefined
  if (target && !skip) {
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(evaluate, { threshold: [0, 0.1, 0.2, VISIBLE_RATIO, 0.5, 0.75, 0.9, 1] })
      observer.observe(target)
    }
    // Die Bühnenhöhe entsteht erst nach dem Layout (Ghost-Sizing, Schriften): danach neu bewerten.
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(evaluate)
      resizeObserver.observe(target)
    }
  }
  onScroll()

  const begin = (delay: number, replay: boolean) => {
    if (skip) return
    armed = true
    replaying = replay
    ui.setEngaged?.(true)
    ui.setReplaying?.(replay)
    userPaused = false
    forced = false
    done = false
    elapsed = 0
    delayLeft = delay
    // `finish()` beim Verlassen der Bühne lässt `visible = false` und einen Offscreen-Hold zurück. Ohne Neubewertung
    // bricht `run()` still ab und der Transport zeigt „Wiederholen“ ohne Wirkung.
    visible = skip || !target
    holdOffscreen = false
    ui.setWaiting(false)
    ui.setPaused(false)
    ui.setStarted(false)
    publish(0)
    stop()
    check(false)
    run()
  }

  const controls: StoryControls = {
    play: () => begin(START_DELAY_MS, false),
    replay: () => begin(REPLAY_DELAY_MS, true),
    pause: () => {
      if (done) return
      userPaused = true
      stop()
      ui.setPaused(true)
    },
    resume: () => {
      if (done) return
      if (holdOffscreen) {
        // „Fortsetzen“ vor dem Start: die Nutzerin will die Geschichte sehen, auch wenn die Pointe unterhalb liegt.
        forced = true
        evaluate()
        return
      }
      if (!userPaused) return
      userPaused = false
      ui.setPaused(false)
      run()
    },
    skip: () => {
      if (!done) finish()
    },
  }

  if (armed && !skip) run()

  return {
    controls,
    dispose: () => {
      disposed = true
      stop()
      observer?.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', evaluate)
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}

/**
 * Liefert den Story-Fortschritt als Funktion der Zeit.
 * - Erster Eindruck ist STATIC: der Endzustand steht, die Uhr läuft nicht.
 * - „Ablauf abspielen“ setzt PLAYING. Danach Pause, Abschluss, Nochmal ansehen.
 * - Verlässt die Nutzerin die Bühne während des Ablaufs: pausiert; an der Trust-Ebene steht der Endzustand.
 * - Reduced Motion und `?autoplay=0`: REDUCED_MOTION, keine Zeitlinie.
 * - Kein globaler Zeiger-Hold auf der Bühne (X-11): Pause kommt nur vom Transport.
 */
function createProgressSource(initial: number): ProgressSource & { set: (next: number) => void } {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (next) => {
      if (Object.is(next, current)) return
      current = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStoryTimeline(targetRef: RefObject<HTMLElement | null>): StoryTimeline {
  const skip = skipsTimeline()
  const [progressSource] = useState(() => createProgressSource(1))
  const [finished, setFinished] = useState(true)
  const [scrolled, setScrolled] = useState(false)
  const [started, setStarted] = useState(skip)
  const [paused, setPaused] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [engaged, setEngaged] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const controls = useRef<StoryControls>({
    play: () => {},
    replay: () => {},
    pause: () => {},
    resume: () => {},
    skip: () => {},
  })
  const publishProgress = useCallback((update: (previous: number) => number) => {
    const previous = progressSource.get()
    const next = update(previous)
    if (Object.is(next, previous)) return
    progressSource.set(next)
    if ((previous >= 1) !== (next >= 1)) setFinished(next >= 1)
  }, [progressSource, setFinished])

  useEffect(() => {
    const controller = createStoryController(
      targetRef.current,
      skip,
      {
        setProgress: publishProgress,
        setScrolled,
        setStarted,
        setPaused,
        setWaiting,
        setEngaged,
        setReplaying,
      },
      { autostart: false },
    )
    controls.current = controller.controls
    return controller.dispose
  }, [targetRef, skip, publishProgress])

  const play = useCallback(() => controls.current.play(), [])
  const replay = useCallback(() => controls.current.replay(), [])
  const pause = useCallback(() => controls.current.pause(), [])
  const resume = useCallback(() => controls.current.resume(), [])
  const skipToEnd = useCallback(() => controls.current.skip(), [])

  return {
    progressSource,
    scrolled,
    finished,
    started,
    paused,
    /** Offscreen-Hold: die Story wartet, bis die Pointe im Bild ist (oder die Nutzerin „Fortsetzen“ wählt). */
    waiting,
    replay,
    pause,
    resume,
    skip: skipToEnd,
    play,
    flow: resolveFlowPhase({
      reduced: skip,
      engaged,
      finished,
      paused: paused || waiting,
      replaying,
    }),
  }
}
