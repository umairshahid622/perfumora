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

export const CLICK_CUE = "/sounds/click.mp3";

/**
 * Modern Minimalist Spritz duration (0.60s).
 * Clean, fast, compact cosmetic burst.
 */
export const ATOMIZER_SPRAY_DURATION = 0.6;

let sharedAudioCtx: AudioContext | null = null;

export function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx) {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return null;
    sharedAudioCtx = new AudioCtxClass();
  }
  return sharedAudioCtx;
}

/**
 * Pure Web Audio API synthesis for "Option 5: Modern Minimalist Spritz":
 * - Attack: Smooth 30ms linear rise (softened to eliminate slap/percussion click).
 * - Body: Compact 220ms sustained cosmetic spritz.
 * - Tail: Quick, clean exponential decay over 0.60s total duration.
 * - Filtering: Highpass at 1500 Hz (cuts low-end thump), Bandpass 3600 Hz -> 2400 Hz (Q=1.3), Lowpass at 7000 Hz.
 */
export async function triggerAtomizerSpray(
  customDestination?: AudioNode,
  customCtx?: AudioContext,
): Promise<AudioContext | null> {
  const ctx = customCtx ?? getOrCreateAudioContext();
  if (!ctx) return null;

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }

  const duration = ATOMIZER_SPRAY_DURATION;
  const sampleRate = ctx.sampleRate;
  const buffer = ctx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.18;
    }
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const t0 = ctx.currentTime;

  // Highpass: 1500 Hz cutoff strips all low-end thump
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(1500, t0);

  // Bandpass: 3600 Hz down to 2400 Hz (Q=1.3)
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.setValueAtTime(1.3, t0);
  bp.frequency.setValueAtTime(3600, t0);
  bp.frequency.exponentialRampToValueAtTime(2400, t0 + duration);

  // Lowpass: 7000 Hz cutoff
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(7000, t0);

  // Envelope: 30ms rise, 220ms sustain, clean decay to 0.60s
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(0.4, t0 + 0.03);
  gain.gain.setValueAtTime(0.36, t0 + 0.22);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  gain.gain.linearRampToValueAtTime(0, t0 + duration + 0.02);

  const destination = customDestination ?? ctx.destination;
  source.connect(hp);
  hp.connect(bp);
  bp.connect(lp);
  lp.connect(gain);
  gain.connect(destination);

  source.start(t0);
  source.stop(t0 + duration + 0.03);

  source.onended = () => {
    try {
      source.disconnect();
      hp.disconnect();
      bp.disconnect();
      lp.disconnect();
      gain.disconnect();
    } catch {
      // Ignored
    }
  };

  return ctx;
}

export function triggerTactileClick(
  customDestination?: AudioNode,
  customCtx?: AudioContext,
): void {
  const ctx = customCtx ?? getOrCreateAudioContext();
  if (!ctx || ctx.state === "suspended") return;

  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(780, t0);
  osc.frequency.exponentialRampToValueAtTime(140, t0 + 0.02);

  gain.gain.setValueAtTime(0.28, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.02);
  gain.gain.linearRampToValueAtTime(0, t0 + 0.025);

  const destination = customDestination ?? ctx.destination;
  osc.connect(gain);
  gain.connect(destination);

  osc.start(t0);
  osc.stop(t0 + 0.03);

  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      // Ignored
    }
  };
}

interface SoundContextValue {
  isMuted: boolean;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  play: () => void;
  playSpray: () => void;
  isPlaying: boolean;
}

const SoundContext = createContext<SoundContextValue | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const masterGainRef = useRef<GainNode | null>(null);
  const activeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSprayRef = useRef<number | null>(null);

  const getMasterGain = useCallback(() => {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return null;
    if (!masterGainRef.current) {
      const master = ctx.createGain();
      master.gain.setValueAtTime(isMuted ? 0 : 1, ctx.currentTime);
      master.connect(ctx.destination);
      masterGainRef.current = master;
    }
    return masterGainRef.current;
  }, [isMuted]);

  const fireSpray = useCallback(() => {
    if (isMuted) return;
    const ctx = getOrCreateAudioContext();
    const master = getMasterGain();
    if (!ctx || !master) return;

    void triggerAtomizerSpray(master, ctx);
    setIsPlaying(true);
    if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
    activeTimerRef.current = setTimeout(() => {
      setIsPlaying(false);
      activeTimerRef.current = null;
    }, Math.floor(ATOMIZER_SPRAY_DURATION * 1000));
  }, [isMuted, getMasterGain]);

  const fireClick = useCallback(() => {
    if (isMuted) return;
    const ctx = getOrCreateAudioContext();
    const master = getMasterGain();
    if (!ctx || !master) return;

    triggerTactileClick(master, ctx);
    setIsPlaying(true);
    if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
    activeTimerRef.current = setTimeout(() => {
      setIsPlaying(false);
      activeTimerRef.current = null;
    }, 35);
  }, [isMuted, getMasterGain]);

  // Unlocking listeners for browser autoplay policies
  useEffect(() => {
    const unlock = () => {
      const ctx = getOrCreateAudioContext();
      if (ctx && ctx.state === "suspended") {
        void ctx.resume().then(() => {
          if (pendingSprayRef.current && Date.now() - pendingSprayRef.current < 2500) {
            pendingSprayRef.current = null;
            fireSpray();
          }
        }).catch(() => {});
      } else if (ctx && ctx.state === "running") {
        if (pendingSprayRef.current && Date.now() - pendingSprayRef.current < 2500) {
          pendingSprayRef.current = null;
          fireSpray();
        }
      }
    };

    const events = ["pointerdown", "pointerup", "touchstart", "touchend", "keydown", "click"] as const;
    events.forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));
    window.addEventListener("wheel", unlock, { passive: true });
    window.addEventListener("scroll", unlock, { passive: true });

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, unlock, { capture: true }));
      window.removeEventListener("wheel", unlock);
      window.removeEventListener("scroll", unlock);
      if (activeTimerRef.current) {
        clearTimeout(activeTimerRef.current);
        activeTimerRef.current = null;
      }
    };
  }, [fireSpray]);

  const setMuted = useCallback((muted: boolean) => {
    setIsMuted(muted);
    const master = masterGainRef.current;
    const ctx = sharedAudioCtx;
    if (master && ctx) {
      master.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
    }
    if (muted) {
      setIsPlaying(false);
      if (activeTimerRef.current) {
        clearTimeout(activeTimerRef.current);
        activeTimerRef.current = null;
      }
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(!isMuted);
  }, [isMuted, setMuted]);

  const play = useCallback(() => {
    if (isMuted) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().then(() => fireClick()).catch(() => {});
      return;
    }
    fireClick();
  }, [isMuted, fireClick]);

  const playSpray = useCallback(() => {
    if (isMuted) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      pendingSprayRef.current = Date.now();
      void ctx.resume().then(() => {
        if (pendingSprayRef.current) {
          pendingSprayRef.current = null;
          fireSpray();
        }
      }).catch(() => {});
      return;
    }
    fireSpray();
  }, [isMuted, fireSpray]);

  const value = useMemo<SoundContextValue>(
    () => ({ isMuted, toggleMute, setMuted, play, playSpray, isPlaying }),
    [isMuted, toggleMute, setMuted, play, playSpray, isPlaying],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSoundContext(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSoundContext must be used within <SoundProvider>");
  return ctx;
}

