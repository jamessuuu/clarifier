import { describe, expect, it } from "vitest";

import { parseCsv } from "./parse";

describe("parseCsv — SPEC.md §12 failure contracts", () => {
  it("rejects empty input", () => {
    const r = parseCsv("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });

  it("rejects whitespace-only input", () => {
    const r = parseCsv("   \n\n  ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });

  it('detects JSON and names it: "looks like JSON, not CSV"', () => {
    const r = parseCsv('{"a": 1, "b": [1,2,3]}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("json");
      expect(r.message.toLowerCase()).toContain("json");
    }
  });

  it("detects a JSON array", () => {
    const r = parseCsv("[1, 2, 3]");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("json");
  });

  it("rejects a header-only paste with no data rows", () => {
    const r = parseCsv("a,b,c\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-data-rows");
  });
});

describe("parseCsv — happy path", () => {
  it("parses a simple comma-delimited table", () => {
    const r = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.headers).toEqual(["a", "b", "c"]);
      expect(r.rows).toEqual([
        ["1", "2", "3"],
        ["4", "5", "6"],
      ]);
    }
  });

  it("treats empty cells as null (missing)", () => {
    const r = parseCsv("a,b\n1,\n,4\n");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows).toEqual([
        ["1", null],
        [null, "4"],
      ]);
    }
  });

  it("handles quoted fields containing commas and embedded newlines", () => {
    const csv = 'name,note\n"Smith, John","line1\nline2"\n';
    const r = parseCsv(csv);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows[0]).toEqual(["Smith, John", "line1\nline2"]);
    }
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    const r = parseCsv('a\n"she said ""hi"""\n');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows[0]?.[0]).toBe('she said "hi"');
  });

  it("handles CRLF line endings", () => {
    const r = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("detects tab delimiter when it dominates the header line", () => {
    const r = parseCsv("a\tb\tc\n1\t2\t3\n");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.delimiter).toBe("\t");
      expect(r.headers).toEqual(["a", "b", "c"]);
    }
  });

  it("fills unnamed header cells with a generated column name", () => {
    const r = parseCsv("a,,c\n1,2,3\n");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.headers[1]).toBe("column_2");
  });

  it("pads a short row with null for missing trailing cells", () => {
    const r = parseCsv("a,b,c\n1,2\n");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows[0]).toEqual(["1", "2", null]);
  });

  it("trims whitespace around header and cell values", () => {
    const r = parseCsv(" a , b \n 1 , 2 \n");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.headers).toEqual(["a", "b"]);
      expect(r.rows[0]).toEqual(["1", "2"]);
    }
  });
});
