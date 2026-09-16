import { useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';

import { downloadRowsAsExcel, type ExcelColumn } from '@/shared/lib/excel';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { StatusMessage } from '../feedback';
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
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setState('busy');
    setError(null);
    try {
      await downloadRowsAsExcel({ rows, columns, fileName, sheetName });
      setState('idle');
    } catch (err) {
      // El motivo se enseña, no solo se registra: «No se pudo exportar» obliga
      // a abrir la consola para saber si falta un permiso, si el libro está
      // mal formado o si el navegador bloqueó la descarga. La traza completa
      // sigue yendo a la consola, que es donde sirve.
      console.error('Fallo al generar el archivo de Excel:', err);
      setError(getApiErrorMessage(err, 'El navegador no pudo escribir el archivo.'));
      setState('error');
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
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

      <StatusMessage
        status={error ? { type: 'error', text: error } : null}
        icon={<AlertTriangle />}
        className="max-w-md"
      />
    </div>
  );
}
