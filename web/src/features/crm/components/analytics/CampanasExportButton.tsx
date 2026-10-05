/** Descarga el reporte de campañas del corte que está en pantalla. */

import { useMemo } from 'react';

import { ExcelExportButton } from '@/shared/ui';
import { selectCrmDimension } from '../../lib/crmDimensions';
import { CAMPANAS_EXCEL_COLUMNS, campanasFileName, ordenarCampanas } from '../../lib/campanasExport';
import type { CrmDimensionRow } from '../../types';

interface Props {
  /** Todas las dimensiones del corte; de ahí se toman las de `campana`. */
  dimensiones: CrmDimensionRow[];
  periodo: string;
  /** El día del corte, para el nombre del archivo. 0 si el mes no tiene cortes. */
  dia: number;
}

/**
 * Exporta las campañas sin depender de la dimensión elegida: el reporte es
 * siempre de campañas, y obligar a cambiar el selector para descargarlo
 * cambiaría también lo que se está mirando.
 */
export function CampanasExportButton({ dimensiones, periodo, dia }: Props) {
  const filas = useMemo(() => ordenarCampanas(selectCrmDimension(dimensiones, 'campana')), [dimensiones]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p className="text-xs text-slate-400">{filas.length} campañas</p>
      <ExcelExportButton
        rows={filas}
        columns={CAMPANAS_EXCEL_COLUMNS}
        fileName={campanasFileName(periodo, dia)}
        sheetName="Campañas"
        label="Reporte de campañas"
      />
    </div>
  );
}
