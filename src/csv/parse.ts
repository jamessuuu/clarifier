/**
 * SPEC.md §12 failure contract: "CSV fails to parse / not tabular (JSON,
 * prose pasted) -> Structured error naming what was detected instead."
 * Pure, zero DOM (SPEC.md §7) — takes a string, returns a result or a typed
 * reason, never throws for malformed input (only for a non-string argument,
 * which is a programmer error, not a visitor-input error).
 */
export type ParseFailureReason = "empty" | "json" | "no-data-rows";

export interface ParseFailure {
  ok: false;
  reason: ParseFailureReason;
  message: string;
}

export interface ParsedTable {
  ok: true;
  headers: string[];
  rows: (string | null)[][];
  delimiter: string;
}

export type ParseResult = ParsedTable | ParseFailure;

function looksLikeJson(trimmed: string): boolean {
  if (trimmed.length === 0) return false;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (!((first === "{" && last === "}") || (first === "[" && last === "]"))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

const DELIMITER_CANDIDATES = [",", "\t", ";", "|"];

function detectDelimiter(firstLine: string): string {
  let best = ",";
  let bestCount = -1;
  for (const d of DELIMITER_CANDIDATES) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** RFC4180-ish tokenizer: quoted fields, embedded delimiters/newlines, doubled-quote escaping, CRLF or LF. */
function tokenize(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  let sawAnyContentInRow = false;

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field.length === 0) {
      inQuotes = true;
      sawAnyContentInRow = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = "";
      sawAnyContentInRow = true;
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      if (sawAnyContentInRow || field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = "";
      sawAnyContentInRow = false;
      i++;
      continue;
    }
    field += c;
    sawAnyContentInRow = true;
    i++;
  }
  if (sawAnyContentInRow || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseCsv(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty", message: "No data pasted." };
  }
  if (looksLikeJson(trimmed)) {
    return { ok: false, reason: "json", message: "This looks like JSON, not CSV." };
  }

  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const tokenized = tokenize(text, delimiter);
  if (tokenized.length === 0) {
    return { ok: false, reason: "empty", message: "No rows found." };
  }

  const headers = (tokenized[0] ?? []).map((h, idx) => (h.trim().length > 0 ? h.trim() : `column_${String(idx + 1)}`));
  const width = headers.length;
  const dataRows = tokenized.slice(1);
  if (dataRows.length === 0) {
    return { ok: false, reason: "no-data-rows", message: "Found a header row but no data rows." };
  }

  const rows: (string | null)[][] = dataRows.map((raw) =>
    Array.from({ length: width }, (_, col) => {
      const cell = raw[col];
      if (cell === undefined) return null;
      const trimmedCell = cell.trim();
      return trimmedCell.length === 0 ? null : trimmedCell;
    })
  );

  return { ok: true, headers, rows, delimiter };
}
