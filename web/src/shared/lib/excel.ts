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

/** Una hoja del libro: sus filas, sus columnas y su nombre de pestaña. */
export interface ExcelSheet<Row> {
  rows: Row[];
  columns: ExcelColumn<Row>[];
  sheetName: string;
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
    columns: aColumnasDelEscritor(columns),
  }).toFile(`${safeFileName(fileName)}.xlsx`);
}

/**
 * Traduce nuestras columnas a las que espera el escritor.
 *
 * Es lo único que comparten la exportación de una hoja y la de varias, y está
 * aparte porque duplicarlo dejaría dos reglas distintas sobre cuándo una celda
 * sale como número.
 */
const aColumnasDelEscritor = <Row>(columns: ExcelColumn<Row>[]) =>
  columns.map((column) => ({
    header: { value: column.header, fontWeight: 'bold' as const, align: 'center' as const },
    width: column.width ?? Math.max(12, column.header.length + 4),
    cell: (row: Row) => {
      const value = column.value(row);

      if (typeof value === 'number' && Number.isFinite(value)) {
        return { type: Number, value, format: column.format };
      }

      return { type: String, value: value === null ? undefined : String(value) };
    },
  }));

/**
 * Escribe varias hojas en un solo libro.
 *
 * Existe porque hay entregables que **son** el libro entero y no una tabla: el
 * formulario de la reguladora son tres hojas con columnas distintas, y
 * descargarlas por separado obligaría a montarlas a mano antes de declararlas.
 *
 * Cada hoja lleva su propio tipo de fila, así que el parámetro se declara
 * sobre la tupla entera: un `ExcelSheet<unknown>[]` obligaría a castear en
 * cada llamada y perdería la comprobación de que la columna lee un campo que
 * la fila tiene.
 *
 * Una hoja sin filas se escribe igual, solo con sus cabeceras: en un
 * formulario oficial "ninguno" es una respuesta, y quitar la hoja cambiaría el
 * libro que se entrega.
 */
export async function downloadSheetsAsExcel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada hoja tiene su propio tipo de fila y el escritor las trata una a una.
  sheets: ExcelSheet<any>[],
  fileName: string,
): Promise<void> {
  // El modo de varias hojas **no acepta objetos**: esa comodidad solo existe
  // para el libro de una hoja, y aquí cada hoja tiene que llegar ya como
  // filas de celdas (`Expected each sheet data row to be an array`). La
  // conversión la hace la propia librería con `getSheetData`, a la que se le
  // pasan las mismas columnas que al modo de objetos, así que las dos
  // exportaciones siguen describiendo sus columnas igual.
  const { default: writeXlsxFile, getSheetData } = await import('write-excel-file/browser');

  await writeXlsxFile(
    sheets.map((sheet) => ({
      data: getSheetData(sheet.rows, aColumnasDelEscritor(sheet.columns)),
      sheet: safeSheetName(sheet.sheetName),
      stickyRowsCount: 1,
      // Aquí `columns` ya solo lleva anchos: las cabeceras y las celdas se
      // fueron con los datos al convertirlos.
      columns: sheet.columns.map((column) => ({
        width: column.width ?? Math.max(12, column.header.length + 4),
      })),
    })),
  ).toFile(`${safeFileName(fileName)}.xlsx`);
}
