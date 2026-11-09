/**
 * Web Audio chime for watering. The AudioContext is created lazily, on the
 * first call, which must come from a user gesture (a tap) — browsers refuse
 * to start audio otherwise. Never called on mount; only from the Water
 * button's click handler.
 */

let audioContext: AudioContext | null = null

function ensureAudioContext(): AudioContext {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioContext = new AudioContextClass()
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }
  return audioContext
}

/** C5, E5, G5: the watering chime. */
export const WATERING_CHIME = [523.25, 659.25, 783.99]

export function playChime(frequencies: number[]): void {
  let ctx: AudioContext
  try {
    ctx = ensureAudioContext()
  }
  catch {
    return
  }

  const startTime = ctx.currentTime
  frequencies.forEach((frequency, i) => {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency

    const noteStart = startTime + i * 0.11
    gain.gain.setValueAtTime(0.0001, noteStart)
    gain.gain.linearRampToValueAtTime(0.18, noteStart + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 1)

    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(noteStart)
    oscillator.stop(noteStart + 1.05)
  })
}
