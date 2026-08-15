"use client";

import { useEffect, useState } from "react";

import { detectWebGL2 } from "@/gl/detect";
import { detectWebGPUAdapter } from "@/gpu/detect";

export interface Capability {
  webgpu: boolean;
  webgl2: boolean;
  /** false until both probes have resolved — the caller should treat this as "still detecting", not "static rung", to avoid a wrong-then-right flash. */
  detected: boolean;
}

/**
 * Runs the real capability probes once on mount (SPEC.md §6: never
 * user-agent sniffing). WebGPU detection is async (requestAdapter returns a
 * Promise); WebGL2 is synchronous but run in the same effect so both land
 * together.
 */
export function useCapability(): Capability {
  const [state, setState] = useState<Capability>({ webgpu: false, webgl2: false, detected: false });

  useEffect(() => {
    let cancelled = false;
    async function run(): Promise<void> {
      const [webgpu, webgl2] = await Promise.all([detectWebGPUAdapter(), Promise.resolve(detectWebGL2())]);
      if (!cancelled) setState({ webgpu: webgpu !== null, webgl2, detected: true });
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
