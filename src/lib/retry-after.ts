import { onScopeDispose, readonly, ref } from 'vue'

/**
 * The wait after a 429.
 *
 * The rate limits answer with `Retry-After`, and the roadmap is specific about what to do with
 * it: disable the control and count down, rather than leaving it live so somebody can retry
 * straight into another refusal. A button that still looks pressable is an invitation, and every
 * press spends quota that has not come back yet.
 *
 * Counted in whole seconds off a wall-clock deadline rather than by decrementing a number each
 * tick. A background tab throttles timers, and a counter that only moves when the interval fires
 * would come back showing a wait that expired minutes ago.
 */
export function useRetryAfter() {
  const secondsLeft = ref(0)

  let timer: ReturnType<typeof setInterval> | undefined
  let deadline = 0

  function tick() {
    const remaining = Math.ceil((deadline - Date.now()) / 1000)
    secondsLeft.value = Math.max(0, remaining)

    if (secondsLeft.value === 0) {
      clearInterval(timer)
      timer = undefined
    }
  }

  /** Begin (or extend) the wait. A null or absent value clears it — not every error is a 429. */
  function start(seconds: number | null | undefined) {
    clearInterval(timer)
    timer = undefined

    if (!seconds || seconds <= 0) {
      secondsLeft.value = 0
      return
    }

    deadline = Date.now() + seconds * 1000
    tick()
    timer = setInterval(tick, 250)
  }

  onScopeDispose(() => clearInterval(timer))

  return { secondsLeft: readonly(secondsLeft), start }
}
