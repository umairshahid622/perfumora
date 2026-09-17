/**
 * Reproduces the Ritual cap controller's zone ladder (useBottleUncap.ts) as a plain
 * state machine, so the reported bug can be confirmed and the fix checked without a
 * browser.
 *
 * Reported: scroll from Gallery up into the Ritual, then back down to the Gallery,
 * and the cap snaps open and shut in a frame or two.
 *
 * The cap position is normalised: 0 = seated, 1 = fully lifted. `applyClose` places
 * it at `1 - closeProgress`, so at the *start* of the close window it commands the
 * cap fully OPEN. That is only correct if the cap is actually open.
 */

const RITUAL_FROM = 3.0;
const CLOSE_FROM = 3.9;
const CLOSE_TO = 4.7;
const RITUAL_ENTRY = RITUAL_FROM - 0.08;
const MAX_JOURNEY_RATE = (CLOSE_TO - RITUAL_FROM) / 1.9;

function makeController({ withFix }) {
  let hasUncapped = false;
  let hasAnnouncedClose = false;
  let sprayDone = false;
  let closeRequested = false;
  let capLifted = false; // only used when withFix
  let latestScreen = 0;
  let lastDirection = 1;
  let journeyScreen = 0;
  let capTarget = 0;

  const log = [];

  const applyClose = () => {
    const closeProgress = Math.min(
      1,
      Math.max(0, (journeyScreen - CLOSE_FROM) / (CLOSE_TO - CLOSE_FROM)),
    );
    const next = 1 - closeProgress;
    // Record every time the close *opens* the cap it was meant to be shutting.
    if (next > capTarget + 0.01) {
      log.push({
        kind: "OPENED-BY-CLOSE",
        screen: +journeyScreen.toFixed(2),
        from: +capTarget.toFixed(2),
        to: +next.toFixed(2),
      });
    }
    capTarget = next;
    if (closeProgress >= 1 && !hasAnnouncedClose) {
      hasAnnouncedClose = true;
      capLifted = false;
    }
  };

  const seatCap = () => {
    capTarget = 0;
    capLifted = false;
  };

  const evaluate = (screen, direction) => {
    const down = direction > 0;
    const up = direction < 0;

    if (screen < 2.5) {
      if (hasUncapped) {
        hasUncapped = false;
        hasAnnouncedClose = false;
        sprayDone = false;
        closeRequested = false;
        capLifted = false;
        seatCap();
      }
      return;
    }

    if (screen >= RITUAL_FROM && !hasUncapped && down) {
      hasUncapped = true;
      hasAnnouncedClose = false;
      sprayDone = false;
      closeRequested = false;
      capTarget = 1; // cap lifts
      capLifted = true;
      sprayDone = true; // the spray is assumed to have completed by the time we leave
      return;
    }

    if (hasUncapped) {
      if (screen >= CLOSE_FROM && down) {
        if (withFix && !capLifted) return; // the fix: never close a cap that is not open
        closeRequested = true;
        if (sprayDone) applyClose();
      } else if (up) {
        closeRequested = false;
        if (sprayDone) seatCap();
      }
    }
  };

  const tick = (target) => {
    latestScreen = target;
    const delta = latestScreen - journeyScreen;
    if (Math.abs(delta) > 0.0005) {
      const inWindow = journeyScreen >= RITUAL_ENTRY && journeyScreen < CLOSE_TO;
      let step = delta;
      if (delta > 0 && inWindow) step = Math.min(delta, MAX_JOURNEY_RATE * 0.05);
      journeyScreen += step;
      lastDirection = Math.sign(delta);
      evaluate(journeyScreen, Math.sign(delta));
    }
  };

  return { tick, log, get capTarget() { return capTarget; }, get journey() { return journeyScreen; } };
}

// The reported scroll: down through the Ritual to the Gallery, back up to the
// Ritual, then down to the Gallery again.
function scrollSequence(c) {
  const marks = [];
  // down to the Gallery
  for (let s = 0; s <= 5.0001; s += 0.05) c.tick(s);
  marks.push(["at Gallery", +c.journey.toFixed(2), +c.capTarget.toFixed(2)]);
  // up into the Ritual (stops around 3.2, never below 2.5)
  for (let s = 5; s >= 3.2; s -= 0.05) c.tick(s);
  marks.push(["up to Ritual", +c.journey.toFixed(2), +c.capTarget.toFixed(2)]);
  // down to the Gallery again
  for (let s = 3.2; s <= 5.0001; s += 0.05) c.tick(s);
  marks.push(["down to Gallery", +c.journey.toFixed(2), +c.capTarget.toFixed(2)]);
  return marks;
}

for (const withFix of [false, true]) {
  const c = makeController({ withFix });
  const marks = scrollSequence(c);
  console.log(`\n=== ${withFix ? "WITH the fix" : "current code"} ===`);
  for (const [label, j, cap] of marks) {
    console.log(`  ${label.padEnd(18)} journey ${String(j).padStart(4)}   cap ${cap}`);
  }
  if (c.log.length === 0) {
    console.log("  -> no spurious cap opening");
  } else {
    for (const e of c.log) {
      console.log(
        `  -> ${e.kind} at screen ${e.screen}: cap jumped ${e.from} -> ${e.to}`,
      );
    }
  }
}
