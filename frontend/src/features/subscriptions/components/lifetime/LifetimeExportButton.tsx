/** Descarga en `.xlsx` las bajas de un mes con sus dos duraciones. */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { downloadRowsAsExcel } from '@/shared/lib/excel';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';
import { ExportButton, StatusMessage, type ExportEstado } from '@/shared/ui';
import { LIFETIME_COLUMNS, lifetimeFileName } from '../../lib/lifetimeExport';

/**
 * Pide el detalle al pulsar: son unas miles de filas que la página no necesita
 * para mostrar el resumen, y cargarlas en cada cambio de mes pesaba casi 1 MB.
 */
export function LifetimeExportButton({ mes }: { mes: string }) {
  const [estado, setEstado] = useState<ExportEstado>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setEstado('busy');
    setError(null);
    try {
      const data = await subscriptionsApi.getLifetimeDetalle(mes);
      if (!data.bajas?.length) {
        setEstado('empty');
        return;
      }
      await downloadRowsAsExcel({
        rows: data.bajas,
        columns: LIFETIME_COLUMNS,
        fileName: lifetimeFileName(mes),
        sheetName: 'Bajas',
      });
      setEstado('idle');
    } catch (err) {
      console.error('Fallo al exportar el lifetime del mes:', err);
      setError(getApiErrorMessage(err, 'No se pudo obtener el detalle de las bajas.'));
      setEstado('error');
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <ExportButton
        onClick={handleClick}
        estado={estado}
        label="Exportar bajas"
        labelEmpty="Sin bajas que exportar"
        title={`Descargar las bajas de ${mes} con su instalación, última activación, fecha de baja y días.`}
      />
      <StatusMessage
        status={error ? { type: 'error', text: error } : null}
        icon={<AlertTriangle />}
        className="max-w-md"
      />
    </div>
  );
}
