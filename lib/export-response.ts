/**
 * Shared CSV/.xlsx response builder for Settings -> Data downloads
 * (BRIEF.md §7.6), so each export route only has to produce columns+rows.
 */

import { NextResponse } from "next/server";
import { toCsv } from "./csv";
import { buildXlsxBuffer } from "./xlsx-export";

export async function buildExportResponse(
  filenameBase: string,
  columns: string[],
  rows: Array<Array<string | number | boolean | null>>,
  format: string | null,
): Promise<NextResponse> {
  if (format === "xlsx") {
    const buffer = await buildXlsxBuffer(filenameBase, columns, rows);
    return new NextResponse(new Blob([new Uint8Array(buffer)]), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
      },
    });
  }

  const csv = toCsv(columns, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
    },
  });
}
