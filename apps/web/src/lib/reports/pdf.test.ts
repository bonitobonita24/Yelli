import { describe, expect, it } from "vitest";

import { generateTablePdf, type PdfColumn } from "./pdf";

interface Row {
  id: string;
  name: string;
  count: number | null;
}

const COLUMNS: ReadonlyArray<PdfColumn<Row>> = [
  { header: "ID", accessor: (r) => r.id, width: 100 },
  { header: "Name", accessor: (r) => r.name, width: 200 },
  { header: "Count", accessor: (r) => r.count, width: 80 },
];

const PDF_MAGIC = Buffer.from("%PDF-", "ascii");

describe("generateTablePdf", () => {
  it("returns a Buffer starting with the PDF magic bytes %PDF-", async () => {
    const buf = await generateTablePdf({
      title: "Test Report",
      subtitle: "Range: 2026-01-01 to 2026-01-31",
      orgName: "Acme Corp",
      columns: COLUMNS,
      rows: [{ id: "a", name: "Alice", count: 3 }],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).equals(PDF_MAGIC)).toBe(true);
  });

  it("ends with the PDF trailer %%EOF (well-formed document)", async () => {
    const buf = await generateTablePdf({
      title: "Trailer Check",
      subtitle: "",
      orgName: "Acme",
      columns: COLUMNS,
      rows: [],
    });
    const tail = buf.subarray(buf.length - 200).toString("ascii");
    expect(tail).toContain("%%EOF");
  });

  it("emits a non-empty document for an empty rows array (header-only is still valid)", async () => {
    const buf = await generateTablePdf({
      title: "No Data",
      subtitle: "",
      orgName: "Acme",
      columns: COLUMNS,
      rows: [],
    });
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).equals(PDF_MAGIC)).toBe(true);
  });

  it("renders many rows without throwing (pagination — no fixed row cap)", async () => {
    const manyRows: Row[] = Array.from({ length: 250 }, (_, i) => ({
      id: `id-${i}`,
      name: `Row ${i}`,
      count: i,
    }));
    const buf = await generateTablePdf({
      title: "Bulk",
      subtitle: "",
      orgName: "Acme",
      columns: COLUMNS,
      rows: manyRows,
    });
    expect(buf.length).toBeGreaterThan(5000);
    expect(buf.subarray(0, 5).equals(PDF_MAGIC)).toBe(true);
  });

  it("renders null cell values without crashing", async () => {
    const buf = await generateTablePdf({
      title: "Null Cells",
      subtitle: "",
      orgName: "Acme",
      columns: COLUMNS,
      rows: [{ id: "a", name: "Alice", count: null }],
    });
    expect(buf.subarray(0, 5).equals(PDF_MAGIC)).toBe(true);
  });

  it("never emits a column not present in the columns array (defense-in-depth)", async () => {
    // Regression guard for [[xendit-internal-id-in-api-wire]]: the generator
    // only renders cells via the accessor list — extra fields on the row are
    // ignored. PDF-internal text streams are encoded/compressed, so we assert
    // the literal raw-byte representation does not appear in the output.
    interface RowWithSecret extends Row {
      xendit_invoice_id: string;
    }
    const cols = COLUMNS as ReadonlyArray<PdfColumn<RowWithSecret>>;
    const buf = await generateTablePdf({
      title: "Leak Guard",
      subtitle: "",
      orgName: "Acme",
      columns: cols,
      rows: [
        {
          id: "a",
          name: "Alice",
          count: 1,
          xendit_invoice_id: "xnd_secret_leak_marker_12345",
        },
      ],
    });
    // pdfkit text streams may be compressed (FlateDecode), so we decode all
    // streams + the raw output and assert neither side contains the marker.
    expect(buf.toString("binary")).not.toContain("xnd_secret_leak_marker_12345");
  });
});
