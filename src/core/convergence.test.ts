import { describe, expect, it } from "vitest";

import { ConvergenceDetector, RING_BUFFER_SIZE, CONSECUTIVE_CHECKS_REQUIRED, CONVERGENCE_THRESHOLD_FACTOR } from "./convergence";

describe("ConvergenceDetector", () => {
  it("does not converge before the ring buffer fills", () => {
    const d = new ConvergenceDetector();
    for (let i = 0; i < RING_BUFFER_SIZE - 1; i++) {
      const { converged } = d.step(0, 100);
      expect(converged).toBe(false);
    }
  });

  it("converges after CONSECUTIVE_CHECKS_REQUIRED checks below threshold, counting from the step the buffer first fills", () => {
    const d = new ConvergenceDetector();
    const diagonal = 100;
    const belowThresholdSpeed = CONVERGENCE_THRESHOLD_FACTOR * diagonal * 0.5;
    let converged = false;
    let steps = 0;
    while (!converged && steps < RING_BUFFER_SIZE + CONSECUTIVE_CHECKS_REQUIRED + 5) {
      converged = d.step(belowThresholdSpeed, diagonal).converged;
      steps++;
    }
    expect(converged).toBe(true);
    // The buffer fills on call RING_BUFFER_SIZE (the "below threshold" check
    // starts counting on that same call), so the 45th consecutive below-
    // threshold check lands on call (RING_BUFFER_SIZE - 1) + CONSECUTIVE_CHECKS_REQUIRED.
    expect(steps).toBe(RING_BUFFER_SIZE - 1 + CONSECUTIVE_CHECKS_REQUIRED);
  });

  it("a single-step blip does not break convergence — the 30-step moving average already smooths it away", () => {
    // "movingAverage", not instantaneous speed, is what's compared to the
    // threshold, so a lone noisy frame contributes only 1/30th of the
    // average and typically doesn't push it back over the line. This is the
    // FIRST of SPEC.md §4's two debounce layers (the rolling average itself);
    // the second is the 45-consecutive-checks requirement tested below.
    const diagonal = 100;
    const below = CONVERGENCE_THRESHOLD_FACTOR * diagonal * 0.5;
    const oneNoisyFrame = CONVERGENCE_THRESHOLD_FACTOR * diagonal * 5;

    function stepsToConverge(blipAtCall: number): number {
      const d = new ConvergenceDetector();
      let steps = 0;
      let converged = false;
      while (!converged && steps < 500) {
        const speed = steps === blipAtCall ? oneNoisyFrame : below;
        converged = d.step(speed, diagonal).converged;
        steps++;
      }
      return steps;
    }

    const baseline = stepsToConverge(-1);
    const withOneBlip = stepsToConverge(baseline - 2);
    expect(withOneBlip).toBe(baseline);
  });

  it("a SUSTAINED perturbation (longer than the ring buffer) genuinely delays convergence, then the same rule fires once things settle again", () => {
    const diagonal = 100;
    const below = CONVERGENCE_THRESHOLD_FACTOR * diagonal * 0.5;
    const sustainedHigh = CONVERGENCE_THRESHOLD_FACTOR * diagonal * 5;

    const d = new ConvergenceDetector();
    let steps = 0;
    let converged = false;
    // Run a burst of sustained high speed for longer than RING_BUFFER_SIZE,
    // long enough that the moving average itself must rise above threshold —
    // simulating a real drag re-injecting energy (SPEC.md §4/§12).
    for (let i = 0; i < RING_BUFFER_SIZE + 10; i++) {
      converged = d.step(sustainedHigh, diagonal).converged;
      steps++;
      expect(converged).toBe(false);
    }
    // Now it settles again — must run the full debounce window before firing.
    while (!converged && steps < 500) {
      converged = d.step(below, diagonal).converged;
      steps++;
    }
    expect(converged).toBe(true);
    // Must take at least the full RING_BUFFER_SIZE (to flush the sustained-high samples out of the average) + CONSECUTIVE_CHECKS_REQUIRED.
    expect(steps).toBeGreaterThanOrEqual(RING_BUFFER_SIZE + 10 + CONSECUTIVE_CHECKS_REQUIRED);
  });

  it("threshold scales with the layout's own bounding-box diagonal, not an absolute constant", () => {
    const dSmall = new ConvergenceDetector();
    const dLarge = new ConvergenceDetector();
    const speed = 1; // same absolute speed
    let smallConverged = false;
    let largeConverged = false;
    for (let i = 0; i < 200; i++) {
      if (!smallConverged) smallConverged = dSmall.step(speed, 10).converged; // small diagonal -> tight threshold
      if (!largeConverged) largeConverged = dLarge.step(speed, 100000).converged; // huge diagonal -> loose threshold
    }
    expect(smallConverged).toBe(false); // speed=1 never drops below 0.0015*10=0.015
    expect(largeConverged).toBe(true); // speed=1 is well below 0.0015*100000=150
  });

  it("reset() clears state so a perturbation can resume the identical rule", () => {
    const d = new ConvergenceDetector();
    const diagonal = 100;
    const below = CONVERGENCE_THRESHOLD_FACTOR * diagonal * 0.5;
    let converged = false;
    for (let i = 0; i < RING_BUFFER_SIZE + CONSECUTIVE_CHECKS_REQUIRED; i++) {
      converged = d.step(below, diagonal).converged;
    }
    expect(converged).toBe(true);
    d.reset();
    expect(d.step(below, diagonal).converged).toBe(false);
  });
});
