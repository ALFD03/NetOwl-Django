/**
 * Client-side `.xlsx` export.
 *
 * The workbook is built in the browser from the rows the view already has, so
 * exporting costs no round-trip and always matches what is on screen. The
 * writer is loaded with a dynamic import: it is only needed the first time
 * someone clicks Export, and this keeps it out of the initial bundle.
 */

/** One column of the sheet: a header and the RAW value behind the cell. */
export interface ExcelColumn<Row> {
  header: string;
  /** The unformatted value. Numbers must stay numbers — Excel has to add them up. */
  value: (row: Row) => string | number | null;
  /** Excel number format, e.g. `'#,##0'` or `'0.00'`. Ignored for text. */
  format?: string;
  /** Column width in characters. */
  width?: number;
}

interface ExportParams<Row> {
  rows: Row[];
  columns: ExcelColumn<Row>[];
  /** Without the extension; it is sanitised and `.xlsx` is appended. */
  fileName: string;
  sheetName?: string;
}

/** Excel rejects these in a sheet name, and every OS rejects them in a file name. */
const INVALID_CHARS = /[\\/?*[\]:]/g;

const safeFileName = (name: string) =>
  name.replace(INVALID_CHARS, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'export';

/** Excel caps sheet names at 31 characters and silently corrupts longer ones. */
const safeSheetName = (name: string) =>
  name.replace(INVALID_CHARS, '-').trim().slice(0, 31) || 'Datos';

/**
 * Writes the rows to an `.xlsx` file and hands it to the browser to download.
 *
 * A cell is emitted as a number whenever its value is finite, so the sheet
 * arrives sortable and summable; anything else becomes text. Empty is `null`,
 * never `0` or `'-'`: a missing sample is not a zero.
 */
export async function downloadRowsAsExcel<Row>({
  rows,
  columns,
  fileName,
  sheetName = 'Datos',
}: ExportParams<Row>): Promise<void> {
  const writeXlsxFile = (await import('write-excel-file/browser')).default;

  await writeXlsxFile(rows, {
    sheet: safeSheetName(sheetName),
    // The header row stays visible while scrolling the hundreds of values a
    // dimension can have.
    stickyRowsCount: 1,
    columns: columns.map((column) => ({
      header: { value: column.header, fontWeight: 'bold' as const, align: 'center' as const },
      width: column.width ?? Math.max(12, column.header.length + 4),
      cell: (row: Row) => {
        const value = column.value(row);

        if (typeof value === 'number' && Number.isFinite(value)) {
          return { type: Number, value, format: column.format };
        }

        return { type: String, value: value === null ? undefined : String(value) };
      },
    })),
  }).toFile(`${safeFileName(fileName)}.xlsx`);
}
