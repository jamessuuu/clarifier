import { mulberry32 } from "./rng";

/**
 * SPEC.md §5: "the app takes a stratified random sample (preserving category
 * proportions on the primary charge-mapped column, if any) down to the
 * budget." Shared by the separation-gain metric's own sample cap
 * (docs/limitations — exact silhouette is O(n^2), capped at 2000 rows) and,
 * from M3 onward, the render/point-budget sampling — one implementation, so
 * the two can never silently use different sampling rules.
 */
export function stratifiedSampleIndices(n: number, budget: number, categoryOf: ((i: number) => number) | null, seed: number): number[] {
  if (n <= budget) return Array.from({ length: n }, (_, i) => i);

  const rng = mulberry32(seed);
  const shuffle = (arr: number[]): number[] => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = out[i];
      out[i] = out[j] as number;
      out[j] = tmp as number;
    }
    return out;
  };

  if (!categoryOf) {
    return shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, budget).sort((a, b) => a - b);
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const cat = categoryOf(i);
    const arr = groups.get(cat) ?? [];
    arr.push(i);
    groups.set(cat, arr);
  }

  const selected: number[] = [];
  for (const [, indices] of groups) {
    const proportion = indices.length / n;
    const quota = Math.max(1, Math.round(proportion * budget));
    selected.push(...shuffle(indices).slice(0, quota));
  }

  // Rounding can over/under-shoot the budget slightly; trim or top up deterministically.
  if (selected.length > budget) {
    return shuffle(selected).slice(0, budget).sort((a, b) => a - b);
  }
  if (selected.length < budget) {
    const remaining = shuffle(Array.from({ length: n }, (_, i) => i).filter((i) => !selected.includes(i)));
    selected.push(...remaining.slice(0, budget - selected.length));
  }
  return selected.sort((a, b) => a - b);
}
