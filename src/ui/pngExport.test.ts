import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { crc32, embedMetadata, filenameFor, iTextChunk } from "./pngExport";

/** Minimal, real, sharp-encoded PNG to embed metadata into — not a hand-built fixture, an actual decoder's own output. */
async function makeTestPng(): Promise<Blob> {
  const buf = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 1 } } })
    .png()
    .toBuffer();
  return new Blob([new Uint8Array(buf)], { type: "image/png" });
}

describe("crc32", () => {
  it("matches the standard reference vector for the ASCII bytes \"123456789\"", () => {
    // The canonical CRC-32/ISO-HDLC (zlib/PNG polynomial) check value.
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("is deterministic and sensitive to every byte", () => {
    const a = crc32(new TextEncoder().encode("clarifier"));
    const b = crc32(new TextEncoder().encode("clarifiez"));
    expect(a).toBe(crc32(new TextEncoder().encode("clarifier")));
    expect(a).not.toBe(b);
  });
});

describe("iTextChunk", () => {
  it("frames a chunk whose declared length matches its data and whose CRC covers type+data", () => {
    const chunk = iTextChunk("test:key", "hello");
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const declaredLen = view.getUint32(0, false);
    expect(chunk.length).toBe(4 + 4 + declaredLen + 4);
    const type = new TextDecoder().decode(chunk.subarray(4, 8));
    expect(type).toBe("iTXt");
    const crcInThisChunk = view.getUint32(8 + declaredLen, false);
    const expectedCrc = crc32(chunk.subarray(4, 8 + declaredLen));
    expect(crcInThisChunk).toBe(expectedCrc);
  });
});

describe("embedMetadata — round-tripped through a real PNG decoder (sharp), not just byte-inspected", () => {
  it("produces a PNG that still decodes to the original pixel dimensions and content", async () => {
    const original = await makeTestPng();
    const embedded = await embedMetadata(original, {
      seed: 1,
      step: 798,
      converged: true,
      unstable: false,
      rowCount: 342,
      mappings: [{ name: "species", role: "charge", normalization: "rank" }],
    });

    const buf = Buffer.from(await embedded.arrayBuffer());
    expect(buf.length).toBeGreaterThan(Buffer.from(await original.arrayBuffer()).length); // the chunk actually got inserted

    const decoded = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    expect(decoded.info.width).toBe(4);
    expect(decoded.info.height).toBe(4);
    // top-left pixel still round-trips to the background color, untouched by chunk insertion
    expect(Array.from(decoded.data.subarray(0, 3))).toEqual([200, 100, 50]);
  });

  it("embeds a real iTXt chunk sharp's own metadata reader can recover, containing the full SimConfig as valid JSON", async () => {
    const original = await makeTestPng();
    const metadata = { seed: 20260809, step: 341, converged: true, unstable: false, rowCount: 180, mappings: [{ name: "dim_1", role: "attraction", normalization: "raw" }] };
    const embedded = await embedMetadata(original, metadata);
    const buf = Buffer.from(await embedded.arrayBuffer());

    const sharpMeta = await sharp(buf).metadata();
    const entry = sharpMeta.comments?.find((c) => c.keyword === "clarifier:sim-config");
    expect(entry).toBeDefined();
    expect(JSON.parse(entry?.text ?? "{}")).toEqual(metadata);
  });

  it("survives non-ASCII column names (a real visitor's CSV is not guaranteed ASCII) — the reason this uses iTXt, not tEXt", async () => {
    const original = await makeTestPng();
    const metadata = { seed: 1, step: 10, converged: false, unstable: false, rowCount: 5, mappings: [{ name: "élève", role: "label", normalization: "rank" }] };
    const embedded = await embedMetadata(original, metadata);
    const buf = Buffer.from(await embedded.arrayBuffer());
    const sharpMeta = await sharp(buf).metadata();
    const entry = sharpMeta.comments?.find((c) => c.keyword === "clarifier:sim-config");
    const parsed = JSON.parse(entry?.text ?? "{}") as typeof metadata;
    expect(parsed.mappings[0]?.name).toBe("élève");
  });
});

describe("filenameFor", () => {
  it("states settled state and step count for a converged frame", () => {
    expect(filenameFor({ seed: 1, step: 798, converged: true, unstable: false, rowCount: 342, mappings: [] })).toBe("clarifier_seed1_step798_settled.png");
  });

  it("states \"not-yet-settled\" for an export requested before convergence (SPEC.md §12 — never presented as final silently)", () => {
    expect(filenameFor({ seed: 1, step: 88, converged: false, unstable: false, rowCount: 342, mappings: [] })).toBe("clarifier_seed1_step88_not-yet-settled.png");
  });

  it("states \"unstable\" when the NaN/Infinity guard has frozen the last stable frame", () => {
    expect(filenameFor({ seed: 1, step: 4021, converged: false, unstable: true, rowCount: 342, mappings: [] })).toBe("clarifier_seed1_step4021_unstable.png");
  });
});
