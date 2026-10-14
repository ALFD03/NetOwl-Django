/** Descarga el reporte de campañas del corte que está en pantalla. */

import { useMemo } from 'react';

import { ExcelExportButton } from '@/shared/ui';
import type { DimensionVal } from '@/shared/types/domain';
import { useObjetivosConfig } from '../../hooks/useObjetivos';
import {
  CAMPANNAS_EXCEL_COLUMNS,
  campannasFileName,
  construirReporteCampannas,
} from '../../lib/campannasExport';
import { formatObjetivo, objetivoGeneral } from '../../lib/objetivos';

interface Props {
  /** Las filas `campanna` del corte: las del día elegido, o las del cierre si el día no las trae. */
  filas: DimensionVal[];
  /** El periodo elegido; el objetivo es el de su mes. */
  periodo: string;
  /** El día del corte, para el nombre del archivo. 0 si el mes no tiene cortes. */
  dia: number;
}

/**
 * Exporta las campañas sin depender de la dimensión elegida en los gráficos:
 * el reporte es siempre de campañas, y obligar a cambiar el selector para
 * descargarlo cambiaría también lo que se está mirando.
 */
export function CampannasExportButton({ filas, periodo, dia }: Props) {
  const config = useObjetivosConfig();
  const objetivo = useMemo(() => objetivoGeneral(config, periodo), [config, periodo]);
  const filasReporte = useMemo(() => construirReporteCampannas(filas, objetivo), [filas, objetivo]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p className="text-xs text-slate-400">
        {filasReporte.length} campañas · meta al {formatObjetivo(objetivo.crecimiento)} del objetivo general
      </p>
      <ExcelExportButton
        rows={filasReporte}
        columns={CAMPANNAS_EXCEL_COLUMNS}
        fileName={campannasFileName(periodo, dia)}
        sheetName="Campañas"
        label="Reporte de campañas"
      />
    </div>
  );
}
