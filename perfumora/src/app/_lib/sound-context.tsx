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

export const MIST_CUE = "/sounds/mist.wav";

/**
 * Authentic Luxury Perfume Atomizer Spritz (0.38s).
 * Replicates the crisp, delicate liquid spritz of a fine-fragrance atomizer:
 * instantaneous cosmetic actuation, pressurized liquid atomization (5.4kHz/8.8kHz),
 * and a soft, clean airborne droplet fadeout. Zero pneumatic/brake rumble.
 */
export const ATOMIZER_SPRAY_DURATION = 0.38;

let sharedAudioCtx: AudioContext | null = null;
let cachedMistBuffer: AudioBuffer | null = null;
let cachedMistSampleRate: number | null = null;

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
 * Generates the authentic acoustic model of a real luxury perfume atomizer:
 * - High-frequency liquid droplet noise (pink noise + fine white shimmer)
 * - Dual highpass at 2700 Hz (completely strips all pneumatic air brake / low rumble)
 * - Liquid nozzle resonance (5400 Hz, Q=1.4) + airborne micro-mist shimmer (8800 Hz)
 * - Short, crisp 0.38s cosmetic spritz envelope
 * - Delicate cosmetic pump tap (2800 Hz, ~8ms)
 * - 3D stereo decorrelation
 */
export function getOrCreateMistBuffer(ctx: AudioContext): AudioBuffer {
  if (cachedMistBuffer && cachedMistSampleRate === ctx.sampleRate) {
    return cachedMistBuffer;
  }

  const duration = ATOMIZER_SPRAY_DURATION;
  const sampleRate = ctx.sampleRate;
  const numSamples = Math.floor(duration * sampleRate);
  const buffer = ctx.createBuffer(2, numSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Pink noise + fine white shimmer for liquid atomization
  function makeNoise(n: number, seed: number): Float32Array {
    const out = new Float32Array(n);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let s = seed;
    function rand() {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return (s / 4294967296) * 2 - 1;
    }

    for (let i = 0; i < n; i++) {
      const white = rand();
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.12;
      b6 = white * 0.115926;
      out[i] = white * 0.08 + pink * 0.45;
    }
    return out;
  }

  const noiseL = makeNoise(numSamples, 112233);
  const noiseR = makeNoise(numSamples, 445566);

  function makeFilter(type: "bandpass" | "highpass" | "lowpass", Q = 1.0) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return {
      step(x0: number, freq: number) {
        const f = Math.max(80, Math.min(sampleRate * 0.48, freq));
        const w0 = (2 * Math.PI * f) / sampleRate;
        const alpha = Math.sin(w0) / (2 * Q);
        const cosw0 = Math.cos(w0);

        let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
        if (type === "bandpass") {
          b0 = alpha; b1 = 0; b2 = -alpha;
          a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
        } else if (type === "highpass") {
          b0 = (1 + cosw0) / 2; b1 = -(1 + cosw0); b2 = (1 + cosw0) / 2;
          a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
        } else {
          b0 = (1 - cosw0) / 2; b1 = 1 - cosw0; b2 = (1 - cosw0) / 2;
          a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
        }

        b0 /= a0; b1 /= a0; b2 /= a0;
        a1 /= a0; a2 /= a0;

        const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x0;
        y2 = y1; y1 = y0;
        return y0;
      },
    };
  }

  const hpFreq = 2700;
  const hp1L = makeFilter("highpass", 0.7);
  const hp1R = makeFilter("highpass", 0.7);
  const hp2L = makeFilter("highpass", 0.7);
  const hp2R = makeFilter("highpass", 0.7);

  const bpFreq = 5400;
  const nozzleBpL = makeFilter("bandpass", 1.4);
  const nozzleBpR = makeFilter("bandpass", 1.4);

  const sheenBpL = makeFilter("bandpass", 1.0);
  const sheenBpR = makeFilter("bandpass", 1.0);

  const lpL = makeFilter("lowpass", 0.7);
  const lpR = makeFilter("lowpass", 0.7);

  const attackTime = 0.014;
  const sustainTime = 0.13;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // Highpass strictly cuts anything below 2700 Hz (zero air brake mud)
    const hpL = hp2L.step(hp1L.step(noiseL[i], hpFreq), hpFreq);
    const hpR = hp2R.step(hp1R.step(noiseR[i], hpFreq), hpFreq);

    const nL = nozzleBpL.step(hpL, bpFreq);
    const nR = nozzleBpR.step(hpR, bpFreq * 1.02);

    const sL = sheenBpL.step(hpL, 9000);
    const sR = sheenBpR.step(hpR, 8700);

    const mistL = lpL.step(nL * 0.7 + sL * 0.3, 12000);
    const mistR = lpR.step(nR * 0.7 + sR * 0.3, 12000);

    // Fast, crisp cosmetic spray envelope
    let env = 0;
    if (t < attackTime) {
      env = Math.pow(t / attackTime, 1.2);
    } else if (t < sustainTime) {
      const p = (t - attackTime) / (sustainTime - attackTime);
      env = 1.0 - 0.15 * p;
    } else {
      const p = (t - sustainTime) / (duration - sustainTime);
      env = 0.85 * Math.exp(-6.0 * p);
    }

    // Micro cosmetic pump tap (light plastic button impulse)
    let click = 0;
    if (t >= 0.005 && t < 0.016) {
      const tc = t - 0.005;
      click = Math.sin(2 * Math.PI * 2800 * tc) * Math.exp(-tc * 700) * 0.08;
    }

    left[i] = mistL * env * 4.0 + click;
    right[i] = mistR * env * 4.0 + click;
  }

  // Fadeout at end
  const fadeLen = Math.floor(sampleRate * 0.02);
  for (let i = 0; i < fadeLen; i++) {
    const idx = numSamples - 1 - i;
    const g = i / fadeLen;
    left[idx] *= g;
    right[idx] *= g;
  }

  // Peak normalize to -1.5 dBFS
  let peak = 0;
  for (let i = 0; i < numSamples; i++) {
    if (Math.abs(left[i]) > peak) peak = Math.abs(left[i]);
    if (Math.abs(right[i]) > peak) peak = Math.abs(right[i]);
  }
  const norm = peak > 0 ? 0.85 / peak : 1.0;
  for (let i = 0; i < numSamples; i++) {
    left[i] *= norm;
    right[i] *= norm;
  }

  cachedMistBuffer = buffer;
  cachedMistSampleRate = sampleRate;
  return buffer;
}

/** Preload the pristine mist audio buffer from /sounds/mist.wav if available, fallback to synthesis. */
export async function preloadMistBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  if (cachedMistBuffer && cachedMistSampleRate === ctx.sampleRate) {
    return cachedMistBuffer;
  }
  try {
    const res = await fetch(MIST_CUE);
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      cachedMistBuffer = decoded;
      cachedMistSampleRate = decoded.sampleRate;
      return decoded;
    }
  } catch {
    // Silent fallback to procedural synthesis
  }
  return getOrCreateMistBuffer(ctx);
}

/**
 * Fires the authentic luxury perfume atomizer mist spray.
 * Instantaneous, gapless, zero-latency playback via cached AudioBuffer.
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

  const buffer =
    cachedMistBuffer && cachedMistSampleRate === ctx.sampleRate
      ? cachedMistBuffer
      : getOrCreateMistBuffer(ctx);

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const destination = customDestination ?? ctx.destination;
  source.connect(destination);

  const t0 = ctx.currentTime;
  source.start(t0);

  source.onended = () => {
    try {
      source.disconnect();
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

  // Preload mist audio buffer on mount for instant zero-latency playback
  useEffect(() => {
    const ctx = getOrCreateAudioContext();
    if (ctx) {
      void preloadMistBuffer(ctx).catch(() => {});
    }
  }, []);

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

