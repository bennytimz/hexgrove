/**
 * Turns a block gap into a rough, honest wait estimate. 1 block is about 1
 * second (see docs/SPEC.md, chain policy facts). Never promises an exact
 * time: once the gap has passed, say so plainly instead of guessing further.
 */
export function formatWaitRemaining(blocksRemaining: number): string {
  if (blocksRemaining <= 0) {
    return 'Ready soon'
  }

  const totalMinutes = Math.round(blocksRemaining / 60)
  if (totalMinutes < 60) {
    const minutes = Math.max(1, totalMinutes)
    return `Ready in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  }

  const hours = Math.round(totalMinutes / 60)
  return `Ready in about ${hours} ${hours === 1 ? 'hour' : 'hours'}`
}
