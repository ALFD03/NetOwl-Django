import { useMemo } from 'react';
import { toNumber } from '@/shared/utils/formatters';
import { buildHealthCards } from '../lib/crmEffectiveness';
import { selectCrmDimension } from '../lib/crmDimensions';
import type {
  CrmAnalyticsProps,
  CrmDimensionValue,
  CrmHealthCard,
  CrmHistoricoRow,
  CrmRankingEntry,
} from '../types';

const EMPTY_GLOBAL: CrmHistoricoRow = {};

/**
 * Picks the dimension value that leads `key`.
 *
 * `order: 'asc'` finds the lowest instead — for measures where low is good, and
 * where a 0 means "no cases" rather than "instant", hence `excludeZero`.
 */
function leader(
  rows: CrmDimensionValue[],
  key: keyof CrmDimensionValue,
  { order = 'desc', excludeZero = false }: { order?: 'desc' | 'asc'; excludeZero?: boolean } = {},
): { winner: string; value: number } | null {
  const candidates = rows
    .map((row) => ({ winner: row.value, value: toNumber(row[key] as number | undefined) }))
    .filter((item) => !excludeZero || item.value !== 0);

  if (candidates.length === 0) return null;

  return candidates.reduce((best, item) =>
    (order === 'asc' ? item.value < best.value : item.value > best.value) ? item : best,
  );
}

/**
 * Derives everything the CRM Analytics page draws from the selected period and
 * dimension: header stats, per-stage effectiveness, and the ranking readouts.
 */
export function useCrmAnalytics(
  { dimensionsData = [], globalData = EMPTY_GLOBAL }: CrmAnalyticsProps,
  selectedDimension: string,
) {
  const rows = useMemo<CrmDimensionValue[]>(
    () => selectCrmDimension(dimensionsData, selectedDimension),
    [dimensionsData, selectedDimension],
  );

  /**
   * Per-stage effectiveness of the whole period, as the analysis computed it
   * over every log of the month.
   *
   * It deliberately does not depend on `selectedDimension`: the funnel's health
   * is a property of the period, not of the axis you happen to be slicing by.
   * Deriving it from the dimension rows instead made it drift — coverage varies
   * per axis, since an opportunity with no branch (or no seller) has no row to
   * be counted in.
   */
  const healthCards = useMemo<CrmHealthCard[]>(
    () => buildHealthCards(globalData.effectiveness),
    [globalData],
  );

  const rankingCards = useMemo<CrmRankingEntry[]>(() => {
    const globalWon = toNumber(globalData.won);

    const topOpportunities = leader(rows, 'total_opportunities');
    const topInstallation = leader(rows, 'pct_installation');
    const topWon = leader(rows, 'won');
    const fastest = leader(rows, 'hours_avg_inst', { order: 'asc', excludeZero: true });
    const topLost = leader(rows, 'pct_lost');
    const topReturned = leader(rows, 'pct_returned_e8');

    const sharePct =
      topWon && globalWon > 0 ? (topWon.value / globalWon) * 100 : 0;

    const entries: Array<CrmRankingEntry> = [
      {
        id: 'opportunities',
        label: 'Más Oportunidades',
        winner: topOpportunities?.winner ?? '—',
        value: topOpportunities ? topOpportunities.value.toLocaleString('en-US') : '—',
        caption: 'Oportunidades creadas',
        color: 'slate',
      },
      {
        id: 'instalacion',
        label: 'Tasa de Instalación Más Alta',
        winner: topInstallation?.winner ?? '—',
        value: topInstallation ? `${topInstallation.value.toFixed(2)}%` : '—',
        caption: 'Ganados / creados',
        color: 'green',
      },
      {
        id: 'aporte',
        label: 'Mayor Aporte de Instalaciones',
        winner: topWon?.winner ?? '—',
        value: topWon ? `${sharePct.toFixed(2)}%` : '—',
        caption: `${topWon?.value.toLocaleString('en-US') ?? 0} de ${globalWon.toLocaleString('en-US')} instalados`,
        color: 'blue',
      },
      {
        id: 'tiempo',
        label: 'Tiempo de Instalación Más Bajo',
        winner: fastest?.winner ?? '—',
        value: fastest ? `${fastest.value.toFixed(1)} h` : '—',
        caption: 'Promedio hasta instalar',
        color: 'purple',
      },
      {
        id: 'perdida',
        label: 'Mayor Tasa de Pérdida',
        winner: topLost?.winner ?? '—',
        value: topLost ? `${topLost.value.toFixed(2)}%` : '—',
        caption: 'Perdidos / creados',
        color: 'red',
      },
      {
        id: 'devueltos',
        label: 'Mayor Devolución a Etapa 8',
        winner: topReturned?.winner ?? '—',
        value: topReturned ? `${topReturned.value.toFixed(2)}%` : '—',
        caption: 'Entradas a Etapa 8',
        color: 'yellow',
      },
    ];

    return entries;
  }, [rows, globalData]);

  return { rows, globalData, healthCards, rankingCards };
}
