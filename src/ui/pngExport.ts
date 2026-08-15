"use client";

/**
 * SPEC.md §9: "The exported PNG's filename/metadata carries the SimConfig
 * (seed, mappings, step count) so the exact frame is reproducible." A
 * filename alone can't hold a full mapping list (arbitrary column count,
 * arbitrary names), so the filename carries the compact, always-useful part
 * (seed, step, settled state) and a real PNG `iTXt` chunk carries the full
 * JSON — UTF-8, unlike `tEXt`'s Latin-1-only text, since a visitor's own CSV
 * column names are not guaranteed ASCII. `canvas.toBlob()` alone is nearly
 * free (SPEC.md §9) and works identically across the 2D/WebGL2/WebGPU
 * canvas backing stores this app renders into — a canvas is a canvas to
 * `toBlob()` regardless of which context drew into it, so this file needs
 * no per-rung readback branch.
 */

export interface ExportMetadata {
  seed: number;
  step: number;
  converged: boolean;
  unstable: boolean;
  rowCount: number;
  mappings: { name: string; role: string; normalization: string }[];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** Exported for src/ui/pngExport.test.ts — the hand-rolled PNG binary framing is exactly the part worth verifying against a real, independent decoder, not just eyeballing. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    const idx = (crc ^ byte) & 0xff;
    crc = (CRC_TABLE[idx] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** One length-prefixed, CRC-checked PNG chunk (ISO/IEC 15948 §5.3). */
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  view.setUint32(8 + data.length, crc32(crcInput), false);
  return out;
}

/** An `iTXt` chunk (PNG §11.3.4.4): UTF-8 text, no language tag, no translated keyword, uncompressed. */
export function iTextChunk(keyword: string, text: string): Uint8Array {
  const keywordBytes = new TextEncoder().encode(keyword);
  const textBytes = new TextEncoder().encode(text);
  const data = new Uint8Array(keywordBytes.length + 1 + 1 + 1 + 1 + 1 + textBytes.length);
  let o = 0;
  data.set(keywordBytes, o);
  o += keywordBytes.length;
  data[o++] = 0; // null separator after keyword
  data[o++] = 0; // compression flag: uncompressed
  data[o++] = 0; // compression method (unused, flag is 0)
  data[o++] = 0; // empty language tag, null-terminated
  data[o++] = 0; // empty translated keyword, null-terminated
  data.set(textBytes, o);
  return pngChunk("iTXt", data);
}

const PNG_SIGNATURE_AND_IHDR_LENGTH = 8 + (4 + 4 + 13 + 4); // signature + full IHDR chunk

/** Inserts a reproducibility `iTXt` chunk into a canvas-generated PNG, right after IHDR (before any IDAT). */
export async function embedMetadata(blob: Blob, metadata: ExportMetadata): Promise<Blob> {
  const original = new Uint8Array(await blob.arrayBuffer());
  const splitAt = PNG_SIGNATURE_AND_IHDR_LENGTH;
  const chunk = iTextChunk("clarifier:sim-config", JSON.stringify(metadata));
  const combined = new Uint8Array(original.length + chunk.length);
  combined.set(original.subarray(0, splitAt), 0);
  combined.set(chunk, splitAt);
  combined.set(original.subarray(splitAt), splitAt + chunk.length);
  return new Blob([combined], { type: "image/png" });
}

export function filenameFor(metadata: ExportMetadata): string {
  const settled = metadata.unstable ? "unstable" : metadata.converged ? "settled" : "not-yet-settled";
  return `clarifier_seed${String(metadata.seed)}_step${String(metadata.step)}_${settled}.png`;
}

/**
 * SPEC.md §12: "Export requested before convergence | Allowed; filename/
 * metadata states the step count and 'not yet settled'." No gate here on
 * `converged` — the caller may invoke this at any point, mid-settle.
 */
export async function exportCanvasAsPng(canvas: HTMLCanvasElement, metadata: ExportMetadata): Promise<void> {
  const rawBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!rawBlob) throw new Error("canvas.toBlob() returned null — the canvas may be tainted or zero-sized");
  const blob = await embedMetadata(rawBlob, metadata);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filenameFor(metadata);
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
