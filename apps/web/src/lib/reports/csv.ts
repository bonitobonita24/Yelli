/**
 * Pure CSV serializer — RFC 4180 compliant.
 *
 * Shared by every Reports tRPC procedure (admin.reports.* and
 * superadmin.revenue.*). Caller declares an explicit column list with typed
 * accessors — the serializer NEVER inspects extra fields on the source row, so
 * a column not present in {@link CsvColumn}[] cannot leak into the output. This
 * is the defense-in-depth boundary for [[xendit-internal-id-in-api-wire]]: even
 * if a router accidentally passes a full Prisma row, the CSV won't carry
 * `xendit_invoice_id` (or any other internal correlation id) unless the caller
 * explicitly named it as a column.
 *
 * Line terminator is CRLF and the output ends with one trailing CRLF — matches
 * RFC 4180 and what Excel/Sheets expect for clean imports.
 */

export interface CsvColumn<TRow> {
  /** Header cell text — emitted verbatim, escaping applied per RFC 4180. */
  readonly header: string;
  /** Pure accessor — return the cell value. null and undefined render as empty. */
  readonly accessor: (row: TRow) => string | number | Date | null | undefined;
}

/**
 * Serialize rows into a CSV string. Header row first, then one row per input,
 * each separated by CRLF. Always terminates with a trailing CRLF.
 *
 * Empty `rows` still emits the header (and a trailing CRLF) — a header-only
 * CSV is valid and signals to the user "we ran the query, there was no data".
 */
export function serializeCsv<TRow>(
  rows: ReadonlyArray<TRow>,
  columns: ReadonlyArray<CsvColumn<TRow>>,
): string {
  const headerLine = columns.map((c) => escapeField(c.header)).join(",");
  const bodyLines = rows.map((row) =>
    columns.map((c) => escapeField(renderCell(c.accessor(row)))).join(","),
  );
  return [headerLine, ...bodyLines].join("\r\n") + "\r\n";
}

function renderCell(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function escapeField(str: string): string {
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
