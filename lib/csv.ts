/**
 * Minimal CSV parsing for the sector-constituents upload (BRIEF.md §7.2).
 * Accepts one ticker per line, an optional "ticker" header, and tolerates
 * a second column (e.g. company name) by ignoring it - the file just
 * needs to be something Praveen can export from a spreadsheet without
 * fussing over exact formatting.
 */
export function parseTickerCsv(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(",")[0]?.trim())
    .filter((cell): cell is string => Boolean(cell) && cell.toLowerCase() !== "ticker");
}

/**
 * Generic CSV writer for Settings -> Data downloads (BRIEF.md §7.6).
 * Quotes a cell only when it needs it (contains a comma, quote or
 * newline), and escapes embedded quotes by doubling them - the one rule
 * that actually matters for opening cleanly in Excel/Sheets.
 */
function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(columns: string[], rows: Array<Array<string | number | boolean | null>>): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n");
}

/**
 * General-purpose CSV reader for the Mutual Fund import feature
 * (DECISIONS.md) - unlike `parseTickerCsv` above (one bare column, no
 * real quoting needs), this handles quoted fields with embedded commas,
 * doubled `""` quotes, and embedded newlines, so a `notes` column
 * containing any of those round-trips correctly. `\r\n` and `\n` line
 * endings both work; a genuinely blank line is skipped rather than
 * returned as a one-empty-field row.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let lineHasContent = false;

  const endRow = () => {
    row.push(field);
    if (lineHasContent) rows.push(row);
    row = [];
    field = "";
    lineHasContent = false;
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      lineHasContent = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      lineHasContent = true;
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += c;
    lineHasContent = true;
    i += 1;
  }
  // Last line with no trailing newline.
  if (lineHasContent) endRow();

  return rows;
}
