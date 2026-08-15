/**
 * SPEC.md §6.2: "Detected via a real WebGL2 context-creation probe." A
 * throwaway canvas, never attached to the DOM — cheap, and doesn't require
 * the caller's own <canvas> to exist yet.
 */
export function detectWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("webgl2");
    return ctx !== null;
  } catch {
    return false;
  }
}
