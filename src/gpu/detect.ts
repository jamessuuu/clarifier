/**
 * SPEC.md §6.1: "Detected via a real navigator.gpu.requestAdapter() call —
 * not 'gpu' in navigator, which can be true with no usable adapter." Never
 * throws: every failure mode (no navigator.gpu, requestAdapter rejects,
 * requestAdapter resolves null, requestDevice rejects) resolves to null so
 * the caller can fall through the ladder unconditionally.
 */
export async function detectWebGPUAdapter(): Promise<GPUAdapter | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter ?? null;
  } catch {
    return null;
  }
}

export async function requestWebGPUDevice(adapter: GPUAdapter): Promise<GPUDevice | null> {
  try {
    return await adapter.requestDevice();
  } catch {
    return null;
  }
}
