import { describe, expect, it } from "vitest";

import { serializeCsv, type CsvColumn } from "./csv";

interface Row {
  id: string;
  name: string;
  count: number | null;
  created_at: Date | null;
}

const COLUMNS: ReadonlyArray<CsvColumn<Row>> = [
  { header: "ID", accessor: (r) => r.id },
  { header: "Name", accessor: (r) => r.name },
  { header: "Count", accessor: (r) => r.count },
  { header: "Created", accessor: (r) => r.created_at },
];

describe("serializeCsv", () => {
  it("emits header row + body rows joined by CRLF with trailing newline (RFC 4180)", () => {
    const out = serializeCsv(
      [
        { id: "a", name: "Alice", count: 3, created_at: new Date("2026-01-01T00:00:00.000Z") },
        { id: "b", name: "Bob", count: 5, created_at: new Date("2026-02-15T00:00:00.000Z") },
      ],
      COLUMNS,
    );
    const lines = out.split("\r\n");
    expect(lines[0]).toBe("ID,Name,Count,Created");
    expect(lines[1]).toBe("a,Alice,3,2026-01-01T00:00:00.000Z");
    expect(lines[2]).toBe("b,Bob,5,2026-02-15T00:00:00.000Z");
    expect(lines[3]).toBe("");
    expect(out.endsWith("\r\n")).toBe(true);
  });

  it("escapes embedded commas by wrapping the field in double quotes", () => {
    const out = serializeCsv(
      [{ id: "a", name: "Smith, John", count: 1, created_at: null }],
      COLUMNS,
    );
    expect(out.split("\r\n")[1]).toBe('a,"Smith, John",1,');
  });

  it("escapes embedded double quotes by doubling them and wrapping the field", () => {
    const out = serializeCsv(
      [{ id: "a", name: 'say "hi"', count: 1, created_at: null }],
      COLUMNS,
    );
    expect(out.split("\r\n")[1]).toBe('a,"say ""hi""",1,');
  });

  it("escapes embedded newlines by wrapping the field in double quotes", () => {
    const out = serializeCsv(
      [{ id: "a", name: "line1\nline2", count: 1, created_at: null }],
      COLUMNS,
    );
    expect(out.split("\r\n")[1]).toBe('a,"line1\nline2",1,');
  });

  it("emits empty string for null values (no literal 'null' or 'undefined')", () => {
    const out = serializeCsv(
      [{ id: "a", name: "x", count: null, created_at: null }],
      COLUMNS,
    );
    expect(out.split("\r\n")[1]).toBe("a,x,,");
  });

  it("renders Date as ISO-8601 UTC string", () => {
    const out = serializeCsv(
      [{ id: "a", name: "x", count: 0, created_at: new Date("2026-03-04T05:06:07.890Z") }],
      COLUMNS,
    );
    expect(out.split("\r\n")[1]).toBe("a,x,0,2026-03-04T05:06:07.890Z");
  });

  it("emits header row only for empty rows", () => {
    const out = serializeCsv([], COLUMNS);
    expect(out).toBe("ID,Name,Count,Created\r\n");
  });

  it("treats accessor returning undefined the same as null (empty cell)", () => {
    const cols: ReadonlyArray<CsvColumn<Row>> = [
      { header: "ID", accessor: (r) => r.id },
      { header: "Maybe", accessor: () => undefined },
    ];
    const out = serializeCsv(
      [{ id: "a", name: "x", count: 0, created_at: null }],
      cols,
    );
    expect(out.split("\r\n")[1]).toBe("a,");
  });

  it("never emits an internal correlation id when accessor omits it (defense-in-depth)", () => {
    // Regression guard for [[xendit-internal-id-in-api-wire]]: the serializer
    // only emits what the caller selects via accessor — so any column added to
    // the source row that is NOT in the COLUMNS list must never appear.
    interface RowWithXendit extends Row {
      xendit_invoice_id: string;
    }
    const out = serializeCsv<RowWithXendit>(
      [
        {
          id: "a",
          name: "x",
          count: 0,
          created_at: null,
          xendit_invoice_id: "xnd_secret_leak",
        },
      ],
      COLUMNS as ReadonlyArray<CsvColumn<RowWithXendit>>,
    );
    expect(out).not.toContain("xendit_invoice_id");
    expect(out).not.toContain("xnd_secret_leak");
  });
});
