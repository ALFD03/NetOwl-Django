/** Descarga el reporte de campañas del corte que está en pantalla. */

import { useMemo } from 'react';

import { ExcelExportButton } from '@/shared/ui';
import { selectCrmDimension } from '../../lib/crmDimensions';
import { CAMPAIGNS_EXCEL_COLUMNS, campaignsFileName, sortCampaigns } from '../../lib/campaignsExport';
import type { CrmDimensionRow } from '../../types';

interface Props {
  /** Todas las dimensiones del corte; de ahí se toman las de `campana`. */
  dimensions: CrmDimensionRow[];
  period: string;
  /** El día del corte, para el nombre del archivo. 0 si el mes no tiene cortes. */
  day: number;
}

/**
 * Exporta las campañas sin depender de la dimensión elegida: el reporte es
 * siempre de campañas, y obligar a cambiar el selector para descargarlo
 * cambiaría también lo que se está mirando.
 */
export function CampaignsExportButton({ dimensions, period, day }: Props) {
  const campaignRows = useMemo(() => sortCampaigns(selectCrmDimension(dimensions, 'campana')), [dimensions]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p className="text-xs text-slate-400">{campaignRows.length} campañas</p>
      <ExcelExportButton
        rows={campaignRows}
        columns={CAMPAIGNS_EXCEL_COLUMNS}
        fileName={campaignsFileName(period, day)}
        sheetName="Campañas"
        label="Reporte de campañas"
      />
    </div>
  );
}
