"use client";

import { useSoundContext } from "../_lib/sound-context";

/**
 * The one, product-agnostic sound hook (§1) — the single entry point every
 * sound consumer imports. All playback flows through the one `<audio>` owned by
 * `<SoundProvider>`:
 *
 *   const { play, isMuted, toggleMute, isPlaying } = useSoundCue()
 *
 * Rules baked in:
 *   - `play()` fires the shared click cue and is a no-op while muted; nothing
 *     queues to "catch up" later.
 *   - the cue is a short one-shot fired from a real click — never looped, never
 *     played on load/scroll.
 *   - `isPlaying` reflects whether that cue is sounding right now, so a
 *     visualiser (the nav waveform) can react to real playback.
 *
 * The clip is a user-supplied asset (§6.4): until it exists the play fails
 * silently and `play()` stays a no-op, so nothing breaks before it lands.
 */
export function useSoundCue() {
  return useSoundContext();
}
