import { useMemo } from 'react';
import { toNumber } from '@/shared/utils/formatters';
import type { MetricColor } from '@/shared/ui';
import type {
  CrmAnalyticsProps,
  CrmDimensionRow,
  CrmDimensionValue,
  CrmEfectividadRow,
  CrmHealthCard,
  CrmHistoricoRow,
  CrmRankingEntry,
} from '../types';

const EMPTY_GLOBAL: CrmHistoricoRow = {};

function healthColor(pct: number): MetricColor {
  if (pct >= 80) return 'green';
  if (pct >= 60) return 'yellow';
  return 'red';
}

function formatEtapaLabel(etapa: string): string {
  return etapa.replace('etapa_', '').replace(/_/g, ' ');
}

/** Hoists `metricas` to the top level so charts and the table read one flat row. */
function flatten(row: CrmDimensionRow): CrmDimensionValue {
  return {
    ...(row.metricas ?? {}),
    valor: row.valor,
    efectividad: row.efectividad ?? row.metricas?.efectividad ?? [],
  };
}

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
): { valor: string; value: number } | null {
  const candidates = rows
    .map((row) => ({ valor: row.valor, value: toNumber(row[key] as number | undefined) }))
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
    () => dimensionsData.filter((row) => row.dimension === selectedDimension).map(flatten),
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
    () =>
      (globalData.efectividad ?? []).map((stage: CrmEfectividadRow) => {
        const total = toNumber(stage.total_salidas);
        const successCount = toNumber(stage.exitosos);
        const failCount = toNumber(stage.fallidos);
        const pct = toNumber(stage.efectividad_pct);

        return {
          id: String(stage.etapa ?? ''),
          label: formatEtapaLabel(String(stage.etapa ?? '')),
          pct,
          color: healthColor(pct),
          successCount,
          successPct: total > 0 ? Math.round((successCount / total) * 100) : 0,
          failCount,
          failPct: total > 0 ? Math.round((failCount / total) * 100) : 0,
        };
      }),
    [globalData],
  );

  const rankingCards = useMemo<CrmRankingEntry[]>(() => {
    const globalGanados = toNumber(globalData.ganados);

    const topOportunidades = leader(rows, 'total_oportunidades');
    const topInstalacion = leader(rows, 'pct_instalacion');
    const topGanados = leader(rows, 'ganados');
    const fastest = leader(rows, 'horas_promedio_inst', { order: 'asc', excludeZero: true });
    const topPerdida = leader(rows, 'pct_perdida');
    const topDevueltos = leader(rows, 'pct_devueltos_e8');

    const aportePct =
      topGanados && globalGanados > 0 ? (topGanados.value / globalGanados) * 100 : 0;

    const entries: Array<CrmRankingEntry> = [
      {
        id: 'oportunidades',
        label: 'Más Oportunidades',
        valor: topOportunidades?.valor ?? '—',
        value: topOportunidades ? topOportunidades.value.toLocaleString('en-US') : '—',
        caption: 'Oportunidades creadas',
        color: 'slate',
      },
      {
        id: 'instalacion',
        label: 'Tasa de Instalación Más Alta',
        valor: topInstalacion?.valor ?? '—',
        value: topInstalacion ? `${topInstalacion.value.toFixed(2)}%` : '—',
        caption: 'Ganados / creados',
        color: 'green',
      },
      {
        id: 'aporte',
        label: 'Mayor Aporte de Instalaciones',
        valor: topGanados?.valor ?? '—',
        value: topGanados ? `${aportePct.toFixed(2)}%` : '—',
        caption: `${topGanados?.value.toLocaleString('en-US') ?? 0} de ${globalGanados.toLocaleString('en-US')} instalados`,
        color: 'blue',
      },
      {
        id: 'tiempo',
        label: 'Tiempo de Instalación Más Bajo',
        valor: fastest?.valor ?? '—',
        value: fastest ? `${fastest.value.toFixed(1)} h` : '—',
        caption: 'Promedio hasta instalar',
        color: 'purple',
      },
      {
        id: 'perdida',
        label: 'Mayor Tasa de Pérdida',
        valor: topPerdida?.valor ?? '—',
        value: topPerdida ? `${topPerdida.value.toFixed(2)}%` : '—',
        caption: 'Perdidos / creados',
        color: 'red',
      },
      {
        id: 'devueltos',
        label: 'Mayor Devolución a Etapa 8',
        valor: topDevueltos?.valor ?? '—',
        value: topDevueltos ? `${topDevueltos.value.toFixed(2)}%` : '—',
        caption: 'Entradas a Etapa 8',
        color: 'yellow',
      },
    ];

    return entries;
  }, [rows, globalData]);

  return { rows, globalData, healthCards, rankingCards };
}
