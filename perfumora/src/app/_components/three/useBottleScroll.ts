"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";
import type { Group } from "three";
import { prefersReducedMotion } from "../../_lib/motion";
import { SECTION_IDS } from "../../_lib/sections";

gsap.registerPlugin(ScrollTrigger);

/**
 * One resting transform for the persistent bottle, in the dock group's own space.
 * Every field is optional so a waypoint states only what differs from the identity
 * pose; `resolvePose` fills the rest.
 */
export interface BottlePose {
  /** World X — positive is the viewer's right. Slides the bottle across screen. */
  x?: number;
  /** World Y — positive is up. */
  y?: number;
  /** Uniform scale (1 = the framing `BottleGltf` computes, ~78% of canvas height). */
  scale?: number;
  /**
   * Y rotation in radians — the turn folded into the *travel*. Distinct from the
   * variant-change spin, which lives on the inner root, so the two never fight.
   */
  rotY?: number;
}

interface ResolvedPose {
  x: number;
  y: number;
  scale: number;
  rotY: number;
}

/** Fills a sparse pose to the identity default so callers can omit unchanged axes. */
export function resolvePose(pose: BottlePose): ResolvedPose {
  return {
    x: pose.x ?? 0,
    y: pose.y ?? 0,
    scale: pose.scale ?? 1,
    rotY: pose.rotY ?? 0,
  };
}

export interface BottleWaypoint {
  /** The section this pose belongs to; its element (`#id`) is the ScrollTrigger. */
  id: string;
  pose: BottlePose;
  /**
   * Where the leg into this waypoint *begins*, as a ScrollTrigger `start`. Every
   * leg ends at `top top` — the frame this section fills the screen — so the whole
   * move happens on the approach and the bottle is already docked when its beat
   * lands. This is the pacing lever: a percentage further down the viewport
   * (`"top 85%"`) starts the move earlier, making it longer and more gradual;
   * closer to the top (`"top 55%"`) holds the previous pose for longer and then
   * moves faster. Only read for legs after the first — the opening waypoint is a
   * resting pose with nothing to travel from.
   */
  approach?: string;
}

/** Default start for a leg's approach — see `BottleWaypoint.approach`. */
const DEFAULT_APPROACH = "top 70%";

/**
 * The bottle's journey, in scroll order — the storytelling itself (§4.1–4.3).
 * Adding a beat is a one-line append here; the hook builds the trigger for it.
 *
 * Units are the canvas's own (camera z 7.2, 24° fov → ~3.06 world units of visible
 * height, so one unit ≈ 33vh and a bottle of `scale` s stands ~85·s vh tall).
 * Horizontal room is aspect-dependent — a 16:9 screen shows ~±3.0 units — which is
 * why the portrait set below cannot reuse these x values.
 *
 * Each pose is a *resting* state, not a pass-through: the leg into it finishes as
 * its section reaches the top of the screen, so for the whole time a section owns
 * the viewport the bottle sits still in that section's pose, and the travel happens
 * in the handover between two beats. Scroll to any of these three and the vessel is
 * already where that beat wants it.
 *
 * Each y is set so the bottle lands in the middle of the *empty slot* its section
 * reserves, not the middle of the viewport: the canvas is centred on the screen,
 * but every one of these sections puts furniture above or below its slot (the
 * Hero's counter and product bar, the Ritual's heading and its 02 caption). These
 * are the first knobs to check on a real screen.
 *
 *  1. Hero — dead centre, dead still, and the largest it will be until the Ritual.
 *     The product under glass; only the variant arrows turn it. It holds that pose
 *     until the Hero itself begins to leave.
 *  2. Manifesto — drifts right into the reserved column *and recedes*, ceding the
 *     screen to the philosophy copy, and the idle float wakes: present, but no
 *     longer the subject.
 *  3. Ritual — returns to centre, swells back past what it was in the Manifesto
 *     and turns furthest of all: a lean-in to the vessel as the three application
 *     steps are read around it.
 */
export const BOTTLE_WAYPOINTS: BottleWaypoint[] = [
  { id: SECTION_IDS.hero, pose: { x: 0, y: 0.15, scale: 0.62, rotY: 0 } },
  {
    // The longest journey of the three — sideways *and* smaller — so it is given
    // the longest runway.
    id: SECTION_IDS.manifesto,
    pose: { x: 1.55, y: 0, scale: 0.42, rotY: 0.35 },
    approach: "top 75%",
  },
  {
    id: SECTION_IDS.ritual,
    pose: { x: 0, y: -0.11, scale: 0.48, rotY: 0.95 },
    approach: "top 70%",
  },
];

/**
 * The same journey for a phone. A portrait viewport only shows ~1.5 world units of
 * width, so the desktop dock at x 1.55 would carry the bottle clean off the screen —
 * the sideways drift is not available here. The story is told with the other two
 * levers instead: the bottle lifts into the band each section reserves at the top of
 * the screen and shrinks, then swells back for the Ritual.
 *
 * Everything is smaller than on desktop because a phone screen has to hold the same
 * copy in a third of the width: the Manifesto's two paragraphs and the Ritual's
 * three steps stack, and holding each section to one screen leaves the bottle only
 * the band above them. The Ritual is the extreme case — three stacked steps plus a
 * heading is nearly a full screen on their own, so the vessel is a small presence
 * there rather than the subject.
 */
export const BOTTLE_WAYPOINTS_COMPACT: BottleWaypoint[] = [
  { id: SECTION_IDS.hero, pose: { x: 0, y: 0.4, scale: 0.46, rotY: 0 } },
  {
    id: SECTION_IDS.manifesto,
    pose: { x: 0, y: 0.75, scale: 0.24, rotY: 0.35 },
    approach: "top 75%",
  },
  {
    id: SECTION_IDS.ritual,
    pose: { x: 0, y: 0.61, scale: 0.22, rotY: 0.95 },
    approach: "top 70%",
  },
];

interface BottleScrollOptions {
  /**
   * Whether the model has loaded. The dock group exists from first render (it
   * wraps the model's `<Suspense>`), so the travel could be wired before the glTF
   * resolves; this re-runs the setup once it is in, so the seeded pose is applied
   * to a group that has something in it.
   */
  ready: boolean;
  waypoints: BottleWaypoint[];
}

/**
 * Scrubbed section-to-section travel for the persistent bottle — the core of the
 * scroll story. One object whose transform is tied to scroll position and tweened
 * between the per-section poses in `waypoints`. Targets the *dock* group (the
 * outer of the two wrappers), never the inner root the spin and idle float own, so
 * the three motions compose instead of colliding (§5/§6.3: motion authored in GSAP).
 *
 * One `ScrollTrigger` per transition, keyed to the destination section's element,
 * so each leg scrubs across the *approach* to that section and is done the moment
 * that section takes the screen; between legs the bottle holds the pose it arrived
 * in. Reusable by construction — the waypoint list is the only thing that grows.
 */
export function useBottleScroll(
  target: RefObject<Group | null>,
  { ready, waypoints }: BottleScrollOptions,
): void {
  useGSAP(
    () => {
      const group = target.current;
      if (!group || waypoints.length === 0) return;

      // Written through `gsap.set` rather than direct assignment so every
      // transform on the dock group flows through GSAP (§6.3), matching the
      // three axes the scrubbed legs below drive.
      const applyPose = (pose: ResolvedPose) => {
        gsap.set(group.position, { x: pose.x, y: pose.y });
        gsap.set(group.scale, { x: pose.scale, y: pose.scale, z: pose.scale });
        gsap.set(group.rotation, { y: pose.rotY });
      };

      const first = resolvePose(waypoints[0].pose);

      // Reduced motion: no scrubbed travel. Snap to whichever section owns the
      // view so the bottle is never stranded over the wrong copy, but never
      // animate it — a scroll-linked drift is exactly what that setting opts out of.
      if (prefersReducedMotion()) {
        applyPose(first);
        for (let i = 1; i < waypoints.length; i++) {
          const to = resolvePose(waypoints[i].pose);
          const back = resolvePose(waypoints[i - 1].pose);
          ScrollTrigger.create({
            trigger: `#${waypoints[i].id}`,
            start: "top top",
            onEnter: () => applyPose(to),
            onLeaveBack: () => applyPose(back),
          });
        }
        return;
      }

      for (let i = 1; i < waypoints.length; i++) {
        const from = resolvePose(waypoints[i - 1].pose);
        const to = resolvePose(waypoints[i].pose);
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: `#${waypoints[i].id}`,
            // The leg runs on the *approach* and lands exactly as the section
            // does: it begins while the previous beat still holds the screen (this
            // section's top is `approach` of the way down the viewport) and ends
            // the frame that top reaches the viewport top. So the vessel is docked
            // where it belongs for the whole time a section owns the screen —
            // scroll to any beat and it is already in place — and the move itself
            // reads as the handover between two beats.
            //
            // Beginning the leg *at* `top top` instead, running past it as an
            // offset span, is the tempting reading and the wrong one: every
            // section would then open with the bottle still in the *previous*
            // section's pose and slide it into place under you. The Manifesto
            // would land with the vessel still centred over its own copy, and the
            // Ritual with it still off to the right of the 01/02/03 stage.
            start: waypoints[i].approach ?? DEFAULT_APPROACH,
            end: "top top",
            // A smoothing number, not `true`. `true` ties the playhead to raw
            // scroll frame-for-frame, so wheel/trackpad steps read as jitter; a
            // number eases the playhead ~1s toward the scroll position, ironing
            // those steps into one fluid glide. The core of the premium feel.
            scrub: 1,
          },
        });

        // `ease: "none"` on every axis: under `scrub` the easing *is* the scroll,
        // so a smoothing ease here would only lag the bottle behind the cursor.
        // All three axes share one timeline and start at 0, so the drift, the
        // resize and the turn arrive at the dock together as one gesture.
        //
        // `immediateRender: false` is load-bearing, not a nicety. A `fromTo`
        // renders its `from` values the moment it is built, so without this every
        // leg would stamp its own starting pose over the dock as the loop ran —
        // and the *last* leg would win, leaving the bottle sitting in the
        // Manifesto's pose (off to the right) while the Hero was still on screen,
        // then one beat behind for the rest of the page. Deferring the render
        // means a leg writes nothing until the scroll actually reaches it.
        tl.fromTo(
          group.position,
          { x: from.x, y: from.y },
          { x: to.x, y: to.y, ease: "none", immediateRender: false },
          0,
        )
          .fromTo(
            group.scale,
            { x: from.scale, y: from.scale, z: from.scale },
            {
              x: to.scale,
              y: to.scale,
              z: to.scale,
              ease: "none",
              immediateRender: false,
            },
            0,
          )
          .fromTo(
            group.rotation,
            { y: from.rotY },
            { y: to.rotY, ease: "none", immediateRender: false },
            0,
          );
      }

      // Seeded last, once every leg exists: paired with `immediateRender: false`
      // above, this is what guarantees the bottle opens the page in the Hero's
      // slot. The refresh then hands control to whichever leg the current scroll
      // position belongs to, so a reload part-way down the page still resolves to
      // the right pose instead of snapping back to the Hero's.
      applyPose(first);

      // The sections lay out before the model resolves, and the fixed canvas adds
      // no document height of its own — but a refresh after wiring keeps trigger
      // positions honest if this runs before layout settles.
      ScrollTrigger.refresh();
    },
    { dependencies: [ready, waypoints] },
  );
}


