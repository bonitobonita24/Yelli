import PDFDocument from "pdfkit";

/**
 * Pure PDF table generator — pdfkit-based, A4 landscape, no I/O.
 *
 * Shared by every Reports tRPC procedure (admin.reports.* and
 * superadmin.revenue.*). Caller declares an explicit column list with typed
 * accessors — the generator NEVER renders extra fields on the source row, so
 * a column not present in {@link PdfColumn}[] cannot leak into the output.
 * This is the defense-in-depth boundary for [[xendit-internal-id-in-api-wire]]:
 * even if a router accidentally passes a full Prisma row, the PDF won't carry
 * `xendit_invoice_id` (or any other internal correlation id) unless the caller
 * explicitly named it as a column.
 *
 * Returns a Buffer the caller can either base64-encode for the tRPC wire or
 * stream straight to a Response body.
 */

export interface PdfColumn<TRow> {
  /** Header cell text — rendered verbatim. */
  readonly header: string;
  /** Pure accessor — return the cell value. null and undefined render as "". */
  readonly accessor: (row: TRow) => string | number | Date | null | undefined;
  /** Column width in PDF points (1pt = 1/72 inch). */
  readonly width: number;
}

export interface PdfTableInput<TRow> {
  /** Document title — rendered at the top of page 1. */
  readonly title: string;
  /** Optional subtitle — date range, filter summary, etc. */
  readonly subtitle: string;
  /** Organization name — rendered top-right of every page. */
  readonly orgName: string;
  readonly columns: ReadonlyArray<PdfColumn<TRow>>;
  readonly rows: ReadonlyArray<TRow>;
}

const PAGE_MARGIN = 36; // 0.5 inch
const HEADER_HEIGHT = 24;
const ROW_HEIGHT = 18;
const TITLE_FONT_SIZE = 16;
const SUBTITLE_FONT_SIZE = 10;
const TABLE_HEADER_FONT_SIZE = 9;
const TABLE_BODY_FONT_SIZE = 8;
const FOOTER_FONT_SIZE = 7;

/**
 * Render a tabular report to PDF. Resolves once the document has been
 * fully written and the underlying buffer is complete.
 */
export async function generateTablePdf<TRow>(
  input: PdfTableInput<TRow>,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: PAGE_MARGIN,
    info: { Title: input.title, Author: input.orgName },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  // Track page count for footer rendering — pdfkit fires pageAdded for every
  // page after the first; the first page is implicit and present at start.
  let pageNumber = 1;
  drawHeader(doc, input, pageNumber);
  doc.on("pageAdded", () => {
    pageNumber += 1;
    drawHeader(doc, input, pageNumber);
  });

  drawTableHeader(doc, input.columns);
  for (const row of input.rows) {
    if (doc.y + ROW_HEIGHT > doc.page.height - PAGE_MARGIN - 12) {
      doc.addPage();
      drawTableHeader(doc, input.columns);
    }
    drawTableRow(doc, input.columns, row);
  }

  // Footer on the last page — pdfkit doesn't expose a clean "for each page
  // after the fact" hook, so we draw the footer at the bottom of the current
  // page only. Each new page added during pagination gets its own header
  // rendered above; the running footer is intentionally simple.
  drawFooter(doc, pageNumber);

  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function drawHeader<TRow>(
  doc: PDFKit.PDFDocument,
  input: PdfTableInput<TRow>,
  _pageNumber: number,
): void {
  doc.font("Helvetica-Bold").fontSize(TITLE_FONT_SIZE);
  doc.text(input.title, PAGE_MARGIN, PAGE_MARGIN, { lineBreak: false });
  doc.font("Helvetica").fontSize(SUBTITLE_FONT_SIZE);
  if (input.subtitle.length > 0) {
    doc.text(input.subtitle, PAGE_MARGIN, PAGE_MARGIN + TITLE_FONT_SIZE + 4, {
      lineBreak: false,
    });
  }
  doc.text(
    input.orgName,
    doc.page.width - PAGE_MARGIN - 200,
    PAGE_MARGIN,
    { width: 200, align: "right", lineBreak: false },
  );
  doc.y = PAGE_MARGIN + TITLE_FONT_SIZE + SUBTITLE_FONT_SIZE + 16;
}

function drawTableHeader<TRow>(
  doc: PDFKit.PDFDocument,
  columns: ReadonlyArray<PdfColumn<TRow>>,
): void {
  const startY = doc.y;
  let x = PAGE_MARGIN;
  doc.font("Helvetica-Bold").fontSize(TABLE_HEADER_FONT_SIZE);
  for (const col of columns) {
    doc.text(col.header, x, startY, { width: col.width, lineBreak: false });
    x += col.width;
  }
  doc
    .moveTo(PAGE_MARGIN, startY + HEADER_HEIGHT - 6)
    .lineTo(doc.page.width - PAGE_MARGIN, startY + HEADER_HEIGHT - 6)
    .stroke();
  doc.y = startY + HEADER_HEIGHT;
}

function drawTableRow<TRow>(
  doc: PDFKit.PDFDocument,
  columns: ReadonlyArray<PdfColumn<TRow>>,
  row: TRow,
): void {
  const startY = doc.y;
  let x = PAGE_MARGIN;
  doc.font("Helvetica").fontSize(TABLE_BODY_FONT_SIZE);
  for (const col of columns) {
    doc.text(renderCell(col.accessor(row)), x, startY, {
      width: col.width,
      lineBreak: false,
      ellipsis: true,
    });
    x += col.width;
  }
  doc.y = startY + ROW_HEIGHT;
}

function drawFooter(doc: PDFKit.PDFDocument, pageNumber: number): void {
  doc.font("Helvetica").fontSize(FOOTER_FONT_SIZE);
  doc.text(
    `Generated ${new Date().toISOString()} · Page ${pageNumber}`,
    PAGE_MARGIN,
    doc.page.height - PAGE_MARGIN - 4,
    { width: doc.page.width - PAGE_MARGIN * 2, align: "center", lineBreak: false },
  );
}

function renderCell(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
