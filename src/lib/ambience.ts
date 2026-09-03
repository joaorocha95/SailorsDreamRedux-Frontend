import { onScopeDispose, readonly, ref } from 'vue'

/**
 * The harbour ambience on the browse surface.
 *
 * Opt-in, off by default, and remembered. Sound that starts on its own is the single most
 * resented thing a site can do, so nothing here makes a noise until somebody asks it to — and
 * the browser agrees, because an AudioContext created without a user gesture starts suspended.
 *
 * Deliberately scoped to browse. The detail page and, later, a negotiation thread are places
 * where someone is reading carefully or writing to a stranger, and a soundtrack over that is an
 * imposition rather than atmosphere. Mounting this composable is what turns it on; unmounting
 * tears the whole graph down.
 *
 * ## The source seam
 *
 * What is playing is behind {@link AmbienceSource}. Today it is {@link createSurf}, which
 * synthesises surf from filtered noise — a placeholder, and audibly one: it has no gulls, no
 * rigging, none of the incidental detail that makes a real harbour recording worth having.
 *
 * Swapping in a real recording means writing one more function of the same shape:
 *
 * ```ts
 * async function createRecording(context: AudioContext, url: string): Promise<AmbienceSource> {
 *   const buffer = await context.decodeAudioData(await (await fetch(url)).arrayBuffer())
 *   const node = new AudioBufferSourceNode(context, { buffer, loop: true })
 *   return { output: node, start: () => node.start(), stop: () => node.stop() }
 * }
 * ```
 *
 * and pointing `createSource` at it. Serve the file from our own origin — a third-party audio
 * host is a request on every visit to somebody else's server, and one that can start failing
 * quietly.
 */

/** How long the fade takes, in seconds. Slow enough to arrive rather than switch on. */
const FADE_SECONDS = 2.5

/** Where it settles. Ambience competes with nothing; it sits under everything. */
const LEVEL = 0.16

const STORAGE_KEY = 'sd:ambience'

/**
 * One playable thing. `output` is what gets connected to the fade; `start` and `stop` exist
 * because buffer sources and oscillators are one-shot — a stopped node can never be restarted,
 * so a new source is built every time the ambience is turned on.
 */
export interface AmbienceSource {
  output: AudioNode
  start(): void
  stop(): void
}

/**
 * Surf, synthesised: brown noise under a low-pass, with the cutoff and the level drifting on two
 * slow oscillators that share no common period. The drift is the whole trick — steady filtered
 * noise reads as a fan or a hiss, and it is the swell coming and going that the ear hears as
 * water.
 */
function createSurf(context: AudioContext): AmbienceSource {
  // Four seconds of brown noise. Brown rather than white because its energy falls with
  // frequency, which is roughly what moving water does; white noise sounds like static.
  const frames = context.sampleRate * 4
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const channel = buffer.getChannelData(0)

  let last = 0
  for (let i = 0; i < frames; i += 1) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    channel[i] = last * 3.5
  }

  const noise = new AudioBufferSourceNode(context, { buffer, loop: true })

  const surf = new BiquadFilterNode(context, { type: 'lowpass', frequency: 520, Q: 0.6 })

  // Swell: one oscillator opens and closes the filter, a second moves the level. Different
  // periods, so the two never line up into an obvious loop.
  const cutoffDrift = new OscillatorNode(context, { frequency: 0.07 })
  const cutoffDepth = new GainNode(context, { gain: 260 })
  cutoffDrift.connect(cutoffDepth).connect(surf.frequency)

  const swell = new GainNode(context, { gain: 0.75 })
  const swellDrift = new OscillatorNode(context, { frequency: 0.11 })
  const swellDepth = new GainNode(context, { gain: 0.25 })
  swellDrift.connect(swellDepth).connect(swell.gain)

  noise.connect(surf).connect(swell)

  return {
    output: swell,
    start() {
      noise.start()
      cutoffDrift.start()
      swellDrift.start()
    },
    stop() {
      noise.stop()
      cutoffDrift.stop()
      swellDrift.stop()
    },
  }
}

/** The one line to change when a recording arrives. */
const createSource = createSurf

function remembered(): boolean {
  // Private windows and blocked site data both throw on access rather than returning null, so
  // reading the preference must never be what breaks the page.
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

function remember(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // A preference that cannot be saved is not worth failing over; it just will not persist.
  }
}

export function useAmbience() {
  const enabled = ref(false)

  /**
   * True when the ambience is on by preference but the browser has not let it sound yet. A page
   * can be loaded without a gesture — a refresh, a link, a restored tab — and autoplay policy
   * holds the context suspended until the visitor does something. Not an error, and not worth a
   * message: the next click resolves it.
   */
  const waitingForGesture = ref(false)

  let context: AudioContext | null = null
  let source: AmbienceSource | null = null
  let fade: GainNode | null = null

  function build() {
    if (context) return

    context = new AudioContext()
    fade = new GainNode(context, { gain: 0 })
    fade.connect(context.destination)

    source = createSource(context)
    source.output.connect(fade)
    source.start()
  }

  function rampTo(target: number) {
    if (!context || !fade) return
    const now = context.currentTime
    // Anchored at the current value first, or a ramp interrupted mid-fade jumps to wherever the
    // last scheduled curve had reached.
    fade.gain.cancelScheduledValues(now)
    fade.gain.setValueAtTime(fade.gain.value, now)
    fade.gain.linearRampToValueAtTime(target, now + FADE_SECONDS)
  }

  async function play() {
    build()
    if (!context) return

    await context.resume()
    if (context.state !== 'running') {
      // Blocked by autoplay policy. Wait for the visitor to touch something and try again.
      waitingForGesture.value = true
      const retry = () => {
        window.removeEventListener('pointerdown', retry)
        window.removeEventListener('keydown', retry)
        if (enabled.value) void play()
      }
      window.addEventListener('pointerdown', retry, { once: true })
      window.addEventListener('keydown', retry, { once: true })
      return
    }

    waitingForGesture.value = false
    rampTo(LEVEL)
  }

  function silence() {
    rampTo(0)
  }

  function toggle() {
    enabled.value = !enabled.value
    remember(enabled.value)

    if (enabled.value) {
      void play()
    } else {
      silence()
    }
  }

  /**
   * A hidden tab should cost nothing. Suspending stops the audio thread outright rather than
   * merely muting it, which matters for a page somebody leaves open all afternoon.
   */
  function onVisibility() {
    if (!context) return

    if (document.hidden) {
      void context.suspend()
    } else if (enabled.value) {
      void play()
    }
  }

  document.addEventListener('visibilitychange', onVisibility)

  // Honour a remembered preference. This will usually land in `waitingForGesture` on a fresh
  // load, which is the correct outcome — it means the browser, not us, decides when sound is
  // allowed to start.
  if (remembered()) {
    enabled.value = true
    void play()
  }

  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    source?.stop()
    void context?.close()
    context = null
    source = null
    fade = null
  })

  return { enabled: readonly(enabled), waitingForGesture: readonly(waitingForGesture), toggle }
}
