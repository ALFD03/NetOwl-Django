import type { MetricColor } from '@/shared/ui';
import { toNumber } from '@/shared/utils';
import type { CrmEfectividadRow, CrmHealthCard } from '../types';

/** Health scale of the funnel: green from 80 %, amber from 60 %, red below. */
export function healthColor(pct: number): MetricColor {
  if (pct >= 80) return 'green';
  if (pct >= 60) return 'yellow';
  return 'red';
}

/** `etapa_8_devuelto` -> `8 devuelto`, the label the cards show. */
export function formatEtapaLabel(etapa: string): string {
  return etapa.replace('etapa_', '').replace(/_/g, ' ');
}

/**
 * Turns the raw per-stage effectiveness rows into card-ready figures.
 *
 * Both the Dashboard health cards and the Results period modal render the same
 * readout, so the percentages are derived here once.
 */
export function buildHealthCards(rows: CrmEfectividadRow[] = []): CrmHealthCard[] {
  return rows.map((row) => {
    const total = toNumber(row.total_salidas);
    const successCount = toNumber(row.exitosos);
    const failCount = toNumber(row.fallidos);
    const pct = toNumber(row.efectividad_pct);

    return {
      id: String(row.etapa ?? ''),
      label: formatEtapaLabel(String(row.etapa ?? '')),
      pct,
      color: healthColor(pct),
      successCount,
      successPct: total > 0 ? Math.round((successCount / total) * 100) : 0,
      failCount,
      failPct: total > 0 ? Math.round((failCount / total) * 100) : 0,
    };
  });
}
