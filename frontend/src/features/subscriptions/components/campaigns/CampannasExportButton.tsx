/** Descarga el reporte de campañas del corte que está en pantalla. */

import { useMemo } from 'react';

import { ExcelExportButton } from '@/shared/ui';
import type { DimensionVal } from '@/shared/types/domain';
import { useTargetsConfig } from '../../hooks/useTargets';
import {
  CAMPANNAS_EXCEL_COLUMNS,
  campannasFileName,
  buildCampaignReport,
} from '../../lib/campannasExport';
import { formatTarget, overallTarget } from '../../lib/targets';

interface Props {
  /** Las filas `campanna` del corte: las del día elegido, o las del cierre si el día no las trae. */
  rows: DimensionVal[];
  /** El periodo elegido; el objetivo es el de su mes. */
  period: string;
  /** El día del corte, para el nombre del archivo. 0 si el mes no tiene cortes. */
  day: number;
}

/**
 * Exporta las campañas sin depender de la dimensión elegida en los gráficos:
 * el reporte es siempre de campañas, y obligar a cambiar el selector para
 * descargarlo cambiaría también lo que se está mirando.
 */
export function CampannasExportButton({ rows, period, day }: Props) {
  const config = useTargetsConfig();
  const objetivo = useMemo(() => overallTarget(config, period), [config, period]);
  const reportRows = useMemo(() => buildCampaignReport(rows, objetivo), [rows, objetivo]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p className="text-xs text-slate-400">
        {reportRows.length} campañas · meta al {formatTarget(objetivo.growth)} del objetivo general
      </p>
      <ExcelExportButton
        rows={reportRows}
        columns={CAMPANNAS_EXCEL_COLUMNS}
        fileName={campannasFileName(period, day)}
        sheetName="Campañas"
        label="Reporte de campañas"
      />
    </div>
  );
}
