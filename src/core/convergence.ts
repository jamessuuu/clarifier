/**
 * SPEC.md §4 convergence rule: track mean particle speed each step in a
 * 30-step ring buffer (~0.5s @ 60fps). Converged when that moving average
 * drops below `0.0015 * boundingBoxDiagonal` for 45 consecutive checks
 * (~0.75s, debounced against a momentary lull).
 */
export const RING_BUFFER_SIZE = 30;
export const CONVERGENCE_THRESHOLD_FACTOR = 0.0015;
export const CONSECUTIVE_CHECKS_REQUIRED = 45;
/**
 * A degenerate layout (a single row, or every row identical on every mapped
 * column — SPEC.md §12's own listed failure contracts) has a bounding-box
 * diagonal of exactly 0. SPEC.md §4's threshold is `0.0015 * diagonal`,
 * relative to "the layout's own scale" — but relative-to-zero is zero, which
 * no non-negative speed can ever drop below, so the sim would never
 * converge. This floor is the minimum "scale" the threshold is computed
 * against; it is far below any real multi-point layout's diagonal (e.g.
 * blobs-3-known measures ~26) so it never affects a non-degenerate case.
 */
export const MIN_DIAGONAL_FOR_THRESHOLD = 1.0;

export class ConvergenceDetector {
  private readonly ring: number[] = [];
  private consecutiveBelow = 0;
  private ringIndex = 0;
  private ringSum = 0;

  /** Feeds one step's mean speed; returns true once convergence has just been reached (edge, not level). */
  step(speed: number, diagonal: number): { movingAverage: number; converged: boolean } {
    if (this.ring.length < RING_BUFFER_SIZE) {
      this.ring.push(speed);
      this.ringSum += speed;
    } else {
      const idx = this.ringIndex % RING_BUFFER_SIZE;
      this.ringSum += speed - (this.ring[idx] ?? 0);
      this.ring[idx] = speed;
      this.ringIndex++;
    }
    const movingAverage = this.ringSum / this.ring.length;

    const threshold = CONVERGENCE_THRESHOLD_FACTOR * Math.max(diagonal, MIN_DIAGONAL_FOR_THRESHOLD);
    const filled = this.ring.length >= RING_BUFFER_SIZE;
    if (filled && movingAverage < threshold) {
      this.consecutiveBelow++;
    } else {
      this.consecutiveBelow = 0;
    }
    return { movingAverage, converged: this.consecutiveBelow >= CONSECUTIVE_CHECKS_REQUIRED };
  }

  reset(): void {
    this.ring.length = 0;
    this.ringSum = 0;
    this.ringIndex = 0;
    this.consecutiveBelow = 0;
  }
}
