/** Las tarjetas de salud por etapa a partir del bloque de efectividad. */

import type { MetricColor } from '@/shared/ui';
import { toNumber } from '@/shared/utils';
import type { CrmEffectivenessRow, CrmHealthCard } from '../types';

/** Health scale of the funnel: green from 80 %, amber from 60 %, red below. */
export function healthColor(pct: number): MetricColor {
  if (pct >= 80) return 'green';
  if (pct >= 60) return 'yellow';
  return 'red';
}

/** `etapa_8_devuelto` -> `8 devuelto`, the label the cards show. */
export function formatStageLabel(stageId: string): string {
  return stageId.replace('etapa_', '').replace(/_/g, ' ');
}

/**
 * Turns the raw per-stage effectiveness rows into card-ready figures.
 *
 * Both the Dashboard health cards and the Results period modal render the same
 * readout, so the percentages are derived here once.
 */
export function buildHealthCards(rows: CrmEffectivenessRow[] = []): CrmHealthCard[] {
  return rows.map((row) => {
    const total = toNumber(row.total_exits);
    const successCount = toNumber(row.successful);
    const failCount = toNumber(row.failed);
    const pct = toNumber(row.effectiveness_pct);

    return {
      id: String(row.stage ?? ''),
      label: formatStageLabel(String(row.stage ?? '')),
      pct,
      color: healthColor(pct),
      successCount,
      successPct: total > 0 ? Math.round((successCount / total) * 100) : 0,
      failCount,
      failPct: total > 0 ? Math.round((failCount / total) * 100) : 0,
    };
  });
}
