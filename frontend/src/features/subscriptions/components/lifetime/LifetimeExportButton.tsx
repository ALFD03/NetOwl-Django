/** Descarga en `.xlsx` las bajas de un mes con sus dos duraciones. */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { downloadRowsAsExcel } from '@/shared/lib/excel';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';
import { ExportButton, StatusMessage, type ExportState } from '@/shared/ui';
import { LIFETIME_COLUMNS, lifetimeFileName } from '../../lib/lifetimeExport';

/**
 * Pide el detalle al pulsar: son unas miles de filas que la página no necesita
 * para mostrar el resumen, y cargarlas en cada cambio de mes pesaba casi 1 MB.
 */
export function LifetimeExportButton({ churn_month }: { churn_month: string }) {
  const [state, setState] = useState<ExportState>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setState('busy');
    setError(null);
    try {
      const data = await subscriptionsApi.getLifetimeDetail(churn_month);
      if (!data.churned?.length) {
        setState('empty');
        return;
      }
      await downloadRowsAsExcel({
        rows: data.churned,
        columns: LIFETIME_COLUMNS,
        fileName: lifetimeFileName(churn_month),
        sheetName: 'Bajas',
      });
      setState('idle');
    } catch (err) {
      console.error('Fallo al exportar el lifetime del mes:', err);
      setError(getApiErrorMessage(err, 'No se pudo obtener el detalle de las bajas.'));
      setState('error');
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <ExportButton
        onClick={handleClick}
        state={state}
        label="Exportar bajas"
        labelEmpty="Sin bajas que exportar"
        title={`Descargar las bajas de ${churn_month} con su instalación, última activación, fecha de baja y días.`}
      />
      <StatusMessage
        status={error ? { type: 'error', text: error } : null}
        icon={<AlertTriangle />}
        className="max-w-md"
      />
    </div>
  );
}
