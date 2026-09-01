"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * The one interaction cue: a short click one-shot fired on every non-navigation
 * button. Served from `public/` — drop the clip at this path (or change just
 * this line to match your filename). Until the file exists the fetch fails and
 * `play()` stays a silent no-op, so nothing breaks before it lands (§6.4).
 */
export const CLICK_CUE = "/sounds/click.mp3";

/**
 * The single sound authority (§1, §4.0). It owns *one* `<audio>` element for the
 * whole app (never looped, never ambient), the global mute switch, and an
 * `isPlaying` flag driven by that element's real play/ended events — so the nav
 * waveform can dance for exactly as long as a cue actually sounds. Audio is
 * emitted only by `play()`, called from a real click gesture.
 */
interface SoundContextValue {
  isMuted: boolean;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  /** Fire the shared click cue. A no-op while muted or before the clip exists. */
  play: () => void;
  /** True while the cue is actually sounding — drives the waveform's dance. */
  isPlaying: boolean;
}

const SoundContext = createContext<SoundContextValue | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  // On by default (the interaction spec asks for audible buttons). Cues fire
  // only from a real click — a user gesture — so there is nothing to unlock, and
  // the header toggle is right there to silence them.
  const [isMuted, setMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // One `<audio>` for the whole app (§1: one element per cue), created on the
  // client only. Its own events keep `isPlaying` in lockstep with real playback,
  // so a visualiser can react to exactly when — and how long — a cue sounds.
  useEffect(() => {
    if (typeof Audio === "undefined") return;
    const audio = new Audio(CLICK_CUE);
    audio.preload = "auto";
    audioRef.current = audio;

    const onPlay = () => setIsPlaying(true);
    const onStop = () => setIsPlaying(false);
    audio.addEventListener("playing", onPlay);
    audio.addEventListener("ended", onStop);
    audio.addEventListener("pause", onStop);
    audio.addEventListener("error", onStop);

    return () => {
      audio.pause();
      audio.removeEventListener("playing", onPlay);
      audio.removeEventListener("ended", onStop);
      audio.removeEventListener("pause", onStop);
      audio.removeEventListener("error", onStop);
      audioRef.current = null;
    };
  }, []);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (isMuted || !audio) return;
    // Restart from 0 so rapid clicks re-fire the one-shot cleanly.
    audio.currentTime = 0;
    void audio.play().catch(() => {
      /* Autoplay/gesture guard or a missing clip — a blocked play is a silent
         no-op, not an error. */
    });
  }, [isMuted]);

  // Muting mid-clip silences it at once (the `pause` event clears `isPlaying`),
  // so the waveform never sits flat while a cue is still audible.
  useEffect(() => {
    if (isMuted) audioRef.current?.pause();
  }, [isMuted]);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const value = useMemo<SoundContextValue>(
    () => ({ isMuted, toggleMute, setMuted, play, isPlaying }),
    [isMuted, toggleMute, play, isPlaying],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSoundContext(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSoundContext must be used within <SoundProvider>");
  return ctx;
}
