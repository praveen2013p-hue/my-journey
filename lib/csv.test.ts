import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("parses a simple header + data rows", () => {
    const text = "month,amount\n2026-01-01,10000\n2026-02-01,5000\n";
    expect(parseCsv(text)).toEqual([
      ["month", "amount"],
      ["2026-01-01", "10000"],
      ["2026-02-01", "5000"],
    ]);
  });

  it("handles a file with no trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("round-trips a quoted field containing a comma (as written by toCsv)", () => {
    const text = toCsv(["x", "y", "z"], [["a, b", "c", "d"]]);
    expect(parseCsv(`${text}\n`)[1]).toEqual(["a, b", "c", "d"]);
  });

  it("round-trips a quoted field containing an embedded quote", () => {
    const text = toCsv(["col"], [['say "hi"']]);
    expect(parseCsv(`${text}\n`)[1]).toEqual(['say "hi"']);
  });

  it("round-trips a field containing a newline", () => {
    const text = toCsv(["a", "b"], [["line1\nline2", "next"]]);
    expect(parseCsv(`${text}\n`)[1]).toEqual(["line1\nline2", "next"]);
  });

  it("preserves empty fields in the middle of a row", () => {
    expect(parseCsv("a,,c\n")).toEqual([["a", "", "c"]]);
  });

  it("skips a genuinely blank line but keeps a row that is just one empty field", () => {
    const text = "a,b\n\n1,2\n";
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
