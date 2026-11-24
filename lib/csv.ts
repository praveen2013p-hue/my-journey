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
