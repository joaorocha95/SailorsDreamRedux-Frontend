import { onScopeDispose } from 'vue'

/**
 * Refreshing a conversation on a timer.
 *
 * There are no websockets on this API and none are planned, so a thread and an inbox stay current
 * by asking again. Three things make that acceptable rather than wasteful:
 *
 *  1. **It stops while the tab is hidden.** A backgrounded tab has nobody reading it, and a
 *     poll every 25 seconds for an hour is 144 requests answering a question no one asked.
 *  2. **It asks immediately on the way back.** Coming back to a stale thread and waiting out the
 *     rest of an interval is the whole failure mode a poller is supposed to avoid.
 *  3. **Ticks never overlap.** A slow response would otherwise stack a second request on top of
 *     the first, and on a bad connection that compounds.
 *
 * The interval sits in the 20–30s band the roadmap fixed: fast enough that a reply lands while
 * the other person is still looking at the screen, slow enough not to read as a chat client
 * pretending to be live.
 */

/** Inside the 20–30s band. Not a round 30 so two open tabs drift apart rather than beat together. */
const DEFAULT_INTERVAL_MS = 25_000

/**
 * Returning to a tab fires `visibilitychange` and `focus` together, which without this would be
 * two identical requests a few milliseconds apart.
 */
const MIN_GAP_MS = 1_000

export function usePolling(task: () => void | Promise<void>, intervalMs = DEFAULT_INTERVAL_MS) {
  let timer: ReturnType<typeof setInterval> | undefined
  let running = false
  let lastRunAt = 0
  let stopped = true

  async function run() {
    // A tick that arrives while the previous one is still in flight is dropped rather than
    // queued: the next one is 25 seconds away and will carry the same answer, only fresher.
    if (running) return
    running = true
    lastRunAt = Date.now()
    try {
      await task()
    } finally {
      running = false
    }
  }

  function schedule() {
    clearInterval(timer)
    timer = setInterval(() => void run(), intervalMs)
  }

  /** Ask now, unless something else just did. */
  function refreshNow() {
    if (Date.now() - lastRunAt < MIN_GAP_MS) return
    void run()
  }

  function onVisibility() {
    if (document.hidden) {
      clearInterval(timer)
      timer = undefined
      return
    }
    if (stopped) return
    refreshNow()
    schedule()
  }

  function onFocus() {
    if (stopped || document.hidden) return
    refreshNow()
  }

  function start() {
    stopped = false
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    // Only if the tab is actually in front. Opening a link into a background tab should not
    // start a timer nobody is watching.
    if (!document.hidden) schedule()
  }

  function stop() {
    stopped = true
    clearInterval(timer)
    timer = undefined
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', onFocus)
  }

  onScopeDispose(stop)

  return { start, stop, refreshNow }
}
