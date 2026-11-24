/**
 * Minimal .xlsx writer for Settings -> Data downloads (BRIEF.md §7.6).
 * Thin wrapper over exceljs so every export route builds a workbook the
 * same way: one sheet, a bold header row, columns sized to their header.
 */

import ExcelJS from "exceljs";

export async function buildXlsxBuffer(
  sheetName: string,
  columns: string[],
  rows: Array<Array<string | number | boolean | null>>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((header) => ({ header, width: Math.max(12, header.length + 2) }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
