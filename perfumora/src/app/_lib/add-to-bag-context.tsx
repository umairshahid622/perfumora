"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import gsap from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { prefersReducedMotion } from "./motion";
import { useCart, type AddToCartInput } from "./cart-context";

if (typeof window !== "undefined") {
  gsap.registerPlugin(MotionPathPlugin);
}

export interface BottleBridgeRegistration {
  triggerImpulse: () => void;
  getScreenCoords: () => { x: number; y: number } | null;
}

interface AddToBagContextValue {
  isAddingToBag: boolean;
  triggerAddToBag: (input: AddToCartInput) => void;
  registerBottleBridge: (bridge: BottleBridgeRegistration | null) => void;
}

const AddToBagContext = createContext<AddToBagContextValue | null>(null);

export function AddToBagProvider({ children }: { children: ReactNode }) {
  const { addItem, canAddItem } = useCart();
  const [isAddingToBag, setIsAddingToBag] = useState(false);
  const bottleBridgeRef = useRef<BottleBridgeRegistration | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const registerBottleBridge = useCallback(
    (bridge: BottleBridgeRegistration | null) => {
      bottleBridgeRef.current = bridge;
    },
    [],
  );

  const triggerAddToBag = useCallback(
    (input: AddToCartInput) => {
      if (isAddingToBag) return;

      // When the max stock error comes the add to cart animation should not work
      if (!canAddItem(input, true)) {
        return;
      }

      setIsAddingToBag(true);

      const reducedMotion = prefersReducedMotion();

      // Phase 1: Button Interaction (GSAP)
      const btn = document.getElementById("add-to-bag-button");
      if (btn && !reducedMotion) {
        gsap
          .timeline()
          .to(btn, { scale: 0.95, duration: 0.12, ease: "power2.inOut" })
          .to(btn, { scale: 1.0, duration: 0.18, ease: "back.out(2)" });
      }

      if (reducedMotion) {
        addItem(input);
        setIsAddingToBag(false);
        return;
      }

      // Phase 2: 3D Bottle Reaction (R3F + GSAP)
      let startCoords: { x: number; y: number } | null = null;
      if (bottleBridgeRef.current) {
        bottleBridgeRef.current.triggerImpulse();
        startCoords = bottleBridgeRef.current.getScreenCoords();
      }

      // Fallback start coordinates: center of clicked button
      if (!startCoords || !Number.isFinite(startCoords.x)) {
        if (btn) {
          const rect = btn.getBoundingClientRect();
          startCoords = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        } else {
          startCoords = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          };
        }
      }

      // Target coordinates: header cart icon (#header-bag-icon)
      const bagIcon = document.getElementById("header-bag-icon");
      let targetX = window.innerWidth - 44;
      let targetY = 32;
      if (bagIcon) {
        const rect = bagIcon.getBoundingClientRect();
        targetX = rect.left + rect.width / 2;
        targetY = rect.top + rect.height / 2;
      }

      // Phase 3: Fly-to-Cart Trajectory (2D/3D Hybrid)
      // Realistic Haute-Parfumerie Miniature Glass Flacon
      const overlay = overlayRef.current;
      const clone = document.createElement("div");
      clone.className =
        "pointer-events-none fixed z-[9999] flex items-center justify-center will-change-transform";

      const flaconWidth = 36;
      const flaconHeight = 56;
      clone.style.width = `${flaconWidth}px`;
      clone.style.height = `${flaconHeight}px`;
      clone.style.left = "0px";
      clone.style.top = "0px";

      const liquidHex = input.hex || "#c68d5e";
      const uid = Math.random().toString(36).substring(2, 7);

      clone.innerHTML = `
        <svg width="36" height="56" viewBox="0 0 36 56" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 0 16px ${liquidHex}aa) drop-shadow(0 8px 20px rgba(0,0,0,0.4));">
          <defs>
            <linearGradient id="capGrad_${uid}" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#141312" />
              <stop offset="35%" stop-color="#3a3835" />
              <stop offset="70%" stop-color="#1c1b1a" />
              <stop offset="100%" stop-color="#0a0909" />
            </linearGradient>
            <linearGradient id="goldCollar_${uid}" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#b8860b" />
              <stop offset="35%" stop-color="#fdf3cd" />
              <stop offset="70%" stop-color="#d4af37" />
              <stop offset="100%" stop-color="#8a6708" />
            </linearGradient>
            <linearGradient id="liquidGrad_${uid}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${liquidHex}" stop-opacity="0.95" />
              <stop offset="55%" stop-color="${liquidHex}" stop-opacity="0.82" />
              <stop offset="100%" stop-color="#14110f" stop-opacity="0.95" />
            </linearGradient>
            <linearGradient id="glassGlare_${uid}" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.85" />
              <stop offset="30%" stop-color="#ffffff" stop-opacity="0.1" />
              <stop offset="70%" stop-color="#ffffff" stop-opacity="0.05" />
              <stop offset="100%" stop-color="#ffffff" stop-opacity="0.5" />
            </linearGradient>
          </defs>

          <!-- Obsidian Sculpted Cap -->
          <rect x="10" y="2" width="16" height="11" rx="2.5" fill="url(#capGrad_${uid})" stroke="rgba(255,255,255,0.3)" stroke-width="0.6" />
          <line x1="15" y1="3" x2="15" y2="12" stroke="rgba(255,255,255,0.3)" stroke-width="0.8" />

          <!-- Polished Gold Atomizer Collar -->
          <rect x="13" y="13" width="10" height="3" rx="0.6" fill="url(#goldCollar_${uid})" stroke="rgba(255,255,255,0.4)" stroke-width="0.4" />

          <!-- Crystal Glass Flacon Vessel -->
          <rect x="3" y="16" width="30" height="37" rx="6.5" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.85)" stroke-width="1.3" />

          <!-- Scent Liquid Chamber -->
          <rect x="5.5" y="22.5" width="25" height="28" rx="4.5" fill="url(#liquidGrad_${uid})" />

          <!-- Liquid Meniscus Surface Glow -->
          <ellipse cx="18" cy="22.5" rx="12.5" ry="2" fill="rgba(255,255,255,0.5)" />

          <!-- Dip Tube -->
          <line x1="18" y1="16" x2="18" y2="48" stroke="rgba(255,255,255,0.6)" stroke-width="0.75" />

          <!-- Glass Specular Reflection on Shoulder -->
          <path d="M 6 18 Q 5 28 6 48" stroke="url(#glassGlare_${uid})" stroke-width="1.6" stroke-linecap="round" />

          <!-- Heavy Crystal Base Highlight -->
          <path d="M 6.5 50.5 Q 18 52.5 29.5 50.5" stroke="rgba(255,255,255,0.7)" stroke-width="1.1" />
        </svg>
      `;

      if (overlay) {
        overlay.appendChild(clone);
      } else {
        document.body.appendChild(clone);
      }

      // Compute visible arc trajectory
      const startX = startCoords.x - flaconWidth / 2;
      const startY = startCoords.y - flaconHeight / 2;
      const endX = targetX - flaconWidth / 2;
      const endY = targetY - flaconHeight / 2;

      // Visible arc apex staying in viewport
      const midX = startX + (endX - startX) * 0.45;
      const midY = Math.max(38, Math.min(startY, endY) + Math.abs(startY - endY) * 0.15 - 20);

      // Sparkle generator for stardust trail
      let lastSparkleTime = 0;
      const spawnSparkle = (x: number, y: number) => {
        const now = performance.now();
        if (now - lastSparkleTime < 55) return;
        lastSparkleTime = now;

        const sparkle = document.createElement("span");
        sparkle.className =
          "pointer-events-none fixed z-[9998] select-none font-serif leading-none";
        sparkle.textContent = "✦";
        sparkle.style.left = `${x + flaconWidth / 2 + (Math.random() - 0.5) * 12}px`;
        sparkle.style.top = `${y + flaconHeight / 2 + (Math.random() - 0.5) * 12}px`;
        sparkle.style.color = Math.random() > 0.4 ? "#fdf3cd" : liquidHex;
        sparkle.style.fontSize = `${10 + Math.random() * 8}px`;
        sparkle.style.filter = `drop-shadow(0 0 6px ${liquidHex})`;

        document.body.appendChild(sparkle);

        gsap.fromTo(
          sparkle,
          { scale: 0.3, opacity: 0.95, rotation: Math.random() * 60 },
          {
            scale: 1.2,
            opacity: 0,
            y: `+=${(Math.random() - 0.5) * 20}`,
            x: `+=${(Math.random() - 0.5) * 20}`,
            duration: 0.45,
            ease: "power1.out",
            onComplete: () => sparkle.remove(),
          },
        );
      };

      // Initialize position at start with a slight initial tilt
      gsap.set(clone, {
        x: startX,
        y: startY,
        scale: 0.35,
        rotation: -14,
        opacity: 0,
      });

      const flyTl = gsap.timeline({
        onComplete: () => {
          clone.remove();

          // Phase 4: Cart Icon Settlement & Golden Ripple Burst
          if (bagIcon) {
            // Ripple burst expanding from cart button
            const ripple = document.createElement("div");
            ripple.className = "pointer-events-none fixed z-[9998] rounded-full";
            ripple.style.width = "44px";
            ripple.style.height = "44px";
            ripple.style.left = `${targetX - 22}px`;
            ripple.style.top = `${targetY - 22}px`;
            ripple.style.border = `2px solid ${liquidHex}`;
            ripple.style.boxShadow = `0 0 20px ${liquidHex}, inset 0 0 10px ${liquidHex}`;
            document.body.appendChild(ripple);

            gsap.fromTo(
              ripple,
              { scale: 0.6, opacity: 0.9 },
              {
                scale: 2.2,
                opacity: 0,
                duration: 0.45,
                ease: "power2.out",
                onComplete: () => ripple.remove(),
              },
            );

            // Punchy cart bounce
            gsap
              .timeline()
              .to(bagIcon, {
                scale: 1.45,
                duration: 0.12,
                ease: "power2.out",
              })
              .to(bagIcon, {
                scale: 0.85,
                duration: 0.1,
                ease: "power2.inOut",
              })
              .to(bagIcon, {
                scale: 1.12,
                duration: 0.08,
                ease: "power2.out",
              })
              .to(bagIcon, {
                scale: 1.0,
                duration: 0.08,
                ease: "power2.in",
              });
          }

          // Commit to cart at the moment of impact
          addItem(input);
          setIsAddingToBag(false);
        },
      });

      // 1. Swell out from bottle with luxury presence (0s -> 0.18s)
      flyTl.to(clone, {
        scale: 1.08,
        opacity: 1,
        rotation: -8,
        duration: 0.18,
        ease: "back.out(1.8)",
      });

      // 2. Flight to cart along visible Bezier arc with 3D tilt and stardust (0.12s -> 0.72s)
      flyTl.to(
        clone,
        {
          motionPath: {
            path: [
              { x: startX, y: startY },
              { x: midX, y: midY },
              { x: endX, y: endY },
            ],
            curviness: 1.25,
          },
          rotation: 16,
          duration: 0.58,
          ease: "power2.inOut",
          onUpdate: function () {
            const currentX = gsap.getProperty(clone, "x") as number;
            const currentY = gsap.getProperty(clone, "y") as number;
            spawnSparkle(currentX, currentY);
          },
        },
        0.14,
      );

      // 3. Glide gracefully into cart at the very end (0.6s -> 0.72s)
      flyTl.to(
        clone,
        {
          scale: 0.15,
          rotation: 0,
          opacity: 0,
          duration: 0.14,
          ease: "power2.in",
        },
        0.58,
      );
    },
    [addItem, canAddItem, isAddingToBag],
  );

  return (
    <AddToBagContext.Provider
      value={{
        isAddingToBag,
        triggerAddToBag,
        registerBottleBridge,
      }}
    >
      {children}
      {/* 2D Overlay container for flying clones */}
      <div
        ref={overlayRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden"
      />
    </AddToBagContext.Provider>
  );
}

export function useAddToBagAnimation() {
  const context = useContext(AddToBagContext);
  if (!context) {
    throw new Error(
      "useAddToBagAnimation must be used within an AddToBagProvider",
    );
  }
  return context;
}
