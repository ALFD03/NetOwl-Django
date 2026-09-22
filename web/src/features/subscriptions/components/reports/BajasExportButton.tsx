/** Descarga en `.xlsx` las bajas de un cierre, con la ficha de cada cliente. */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { downloadRowsAsExcel } from '@/shared/lib/excel';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';
import { ExportButton, StatusMessage, type ExportEstado } from '@/shared/ui';
import { BAJAS_COLUMNS, bajasFileName } from '../../lib/bajasExport';

interface BajasExportButtonProps {
  /** Etiqueta del cierre, tal y como la guarda `periodo_reporte`. */
  period: string;
  /**
   * Nodos `"Zona - Sucursal"` a los que se acota la exportación. Sin ellos se
   * exporta el periodo entero; con ellos, lo que ese site, coordinador o nodo
   * tiene en pantalla.
   */
  nodos?: string[];
  /** Qué se está exportando; va en el nombre del archivo. */
  alcance: string;
  /**
   * El corte visible es un día y no el cierre del mes.
   *
   * El detalle nominal solo existe por periodo: `analyzer_day_metrics` guarda
   * agregados, no las órdenes que los componen. Se avisa en el tooltip en vez
   * de desactivar el botón, porque el mes sigue siendo lo que se quiere bajar.
   */
  avisoDia?: boolean;
  label?: string;
  /** Solo el icono: es como va en cada fila de la tabla de nodos. */
  iconOnly?: boolean;
  className?: string;
}

/**
 * Pide el detalle al servidor y lo escribe como hoja de cálculo.
 *
 * A diferencia de `ExcelExportButton`, las filas no están en la página: la
 * tabla muestra cuántas bajas hubo, no quiénes son, así que el detalle se pide
 * al pulsar y no se carga de antemano en todas las zonas del reporte.
 */
export function BajasExportButton({
  period,
  nodos,
  alcance,
  avisoDia = false,
  label = 'Exportar bajas',
  iconOnly = false,
  className,
}: BajasExportButtonProps) {
  const [estado, setEstado] = useState<ExportEstado>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setEstado('busy');
    setError(null);
    try {
      const data = await subscriptionsApi.getBajasDetalle(period, nodos);
      if (!data.bajas?.length) {
        setEstado('empty');
        return;
      }
      await downloadRowsAsExcel({
        rows: data.bajas,
        columns: BAJAS_COLUMNS,
        fileName: bajasFileName(data.period ?? period, alcance),
        sheetName: 'Bajas',
      });
      setEstado('idle');
    } catch (err) {
      // El motivo se enseña, no solo se registra: un permiso denegado, un
      // periodo que ya no existe y un fallo del navegador al escribir el
      // archivo se arreglan de tres formas distintas, y «No se pudo exportar»
      // no distingue entre ellos. La traza sigue yendo a la consola.
      console.error('Fallo al exportar el detalle de bajas:', err);
      setError(getApiErrorMessage(err, 'No se pudo obtener el detalle de las bajas.'));
      setEstado('error');
    }
  };

  const titulo = [
    `Descargar el detalle de las bajas de ${alcance} (${period}).`,
    avisoDia ? 'El detalle nominal solo existe por cierre mensual: se exporta el mes completo, no el día seleccionado.' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col items-start gap-2">
      <ExportButton
        className={className}
        onClick={handleClick}
        estado={estado}
        label={label}
        labelEmpty="Sin bajas que exportar"
        iconOnly={iconOnly}
        disabled={!period}
        title={error ? `${titulo} ${error}` : titulo}
      />

      {/* En la variante de solo icono va en el `title`: el botón vive dentro de
          una celda de la tabla de nodos y un banner ahí rompería la fila. */}
      {!iconOnly && (
        <StatusMessage
          status={error ? { type: 'error', text: error } : null}
          icon={<AlertTriangle />}
          className="max-w-md"
        />
      )}
    </div>
  );
}
