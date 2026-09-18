"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import gsap from "gsap";
import { useAddToBagAnimation } from "../../_lib/add-to-bag-context";
import { prefersReducedMotion } from "../../_lib/motion";
import type { BottleRefs } from "./useBottleRefs";

interface AddToBagBottleBridgeProps {
  refs: BottleRefs;
}

/**
 * R3F Bridge Component placed inside <Canvas>.
 * Listens to Add-to-Bag triggers to run Phase 2 (3D Bottle Reaction)
 * and projects the 3D bottle's world coordinates to 2D screen coordinates.
 */
export function AddToBagBottleBridge({ refs }: AddToBagBottleBridgeProps) {
  const { camera } = useThree();
  const { registerBottleBridge } = useAddToBagAnimation();

  useEffect(() => {
    registerBottleBridge({
      triggerImpulse: () => {
        if (prefersReducedMotion()) return;

        const root = refs.root.current;

        // 1. Quick punchy impulse on the 3D bottle mesh:
        //    Scale pop: 1.08 -> settles back to 1.0 with elastic.out(1, 0.4)
        if (root) {
          gsap.fromTo(
            root.scale,
            { x: 1.08, y: 1.08, z: 1.08 },
            {
              x: 1,
              y: 1,
              z: 1,
              duration: 0.65,
              ease: "elastic.out(1, 0.4)",
              overwrite: "auto",
            },
          );

          // 2. 360° spin / tilt flourish along Y axis (lands on exact full turn and resets to dead-front 0)
          const targetY =
            (Math.round(root.rotation.y / (Math.PI * 2)) + 1) * (Math.PI * 2);
          gsap.to(root.rotation, {
            y: targetY,
            duration: 0.75,
            ease: "power2.out",
            overwrite: "auto",
            onComplete: () => {
              root.rotation.y = 0;
            },
          });
        }
      },

      getScreenCoords: () => {
        const root = refs.root.current;
        if (!root) return null;

        const worldPos = new Vector3();
        root.getWorldPosition(worldPos);
        // Slightly offset toward center of bottle
        worldPos.y += 0.2;

        worldPos.project(camera);

        const x = ((worldPos.x + 1) / 2) * window.innerWidth;
        const y = ((-worldPos.y + 1) / 2) * window.innerHeight;

        return { x, y };
      },
    });

    return () => {
      registerBottleBridge(null);
    };
  }, [camera, refs, registerBottleBridge]);

  return null;
}
