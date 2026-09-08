import { useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';

import { downloadRowsAsExcel, type ExcelColumn } from '@/shared/lib/excel';
import { Button } from '../primitives';

interface Props<Row> {
  rows: Row[];
  columns: ExcelColumn<Row>[];
  /** Without the extension; `downloadRowsAsExcel` sanitises it. */
  fileName: string;
  sheetName?: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Downloads the given rows as a `.xlsx` file.
 *
 * It takes the data, not a DOM node: the sheet carries the raw numbers behind
 * the table so it can be sorted and summed in Excel, instead of the formatted
 * strings the cells render. With no rows there is nothing to write, so the
 * button disables itself rather than producing an empty workbook.
 */
export function ExcelExportButton<Row>({
  rows,
  columns,
  fileName,
  sheetName,
  label = 'Exportar a Excel',
  size = 'sm',
  className,
}: Props<Row>) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  const handleClick = async () => {
    setState('busy');
    try {
      await downloadRowsAsExcel({ rows, columns, fileName, sheetName });
      setState('idle');
    } catch (error) {
      // El fallo es del navegador al escribir el archivo, no de la app: se
      // deja visible en el propio botón para no montar un modal por esto.
      console.error('Fallo al generar el archivo de Excel:', error);
      setState('error');
    }
  };

  return (
    <Button
      variant="secondary"
      size={size}
      className={className}
      onClick={handleClick}
      isLoading={state === 'busy'}
      disabled={rows.length === 0}
      icon={state === 'error' ? <AlertTriangle className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
      title={rows.length === 0 ? 'No hay filas que exportar.' : `Descargar ${rows.length} filas en formato .xlsx`}
    >
      {state === 'error' ? 'No se pudo exportar' : label}
    </Button>
  );
}
