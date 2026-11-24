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
