import { CHART_CHROME } from '@/shared/constants/theme';
import { useMemo, useState } from 'react';
import {
  BarChart,
  DoughnutChart,
  getDoughnutOptions,
  getHorizontalBarOptions,
  handleHover,
  type DoughnutHoverValue,
} from '@/shared/charts';
import { EmptyState, NeonContainer, type NeonTheme } from '@/shared/ui';
import { CRM_DIMENSION_LABELS } from '@/shared/constants/labels';
import { toBarChartData, toDoughnutChartData } from '@/shared/utils/distribution';
import {
  CRM_ANALYTICS_METRICS,
  getCrmChartDistribution,
  type CrmAnalyticsMetricKey,
  type CrmMetricConfig,
} from '../../lib/crmAnalyticsDistribution';
import type { CrmDimensionValue, CrmHistoricoRow } from '../../types';

interface ChartDefinition {
  title: string;
  metric: CrmAnalyticsMetricKey;
  type: 'bar' | 'doughnut';
  theme: NeonTheme;
}

const CHARTS: ChartDefinition[] = [
  { title: 'Concentración de Oportunidades', metric: 'oportunidades', type: 'doughnut', theme: 'blue' },
  { title: 'Concentración de Instalados', metric: 'instalados', type: 'doughnut', theme: 'green' },
  { title: 'Instalación Más Rápida (horas)', metric: 'tiempoInstalacion', type: 'bar', theme: 'purple' },
];

interface Props {
  globalData: CrmHistoricoRow;
  rows: CrmDimensionValue[];
  selectedDimension: string;
}

export function CrmAnalyticsCharts({ globalData, rows, selectedDimension }: Props) {
  const dimensionLabel =
    CRM_DIMENSION_LABELS[selectedDimension as keyof typeof CRM_DIMENSION_LABELS] ?? selectedDimension;

  return (
    <section>
      <div className="mb-6 border-l-4 border-sky-500 pl-4">
        <h2 className="text-lg font-bold text-white">Ranking Dimensional</h2>
        <p className="text-xs text-slate-500">Basado en {dimensionLabel}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {CHARTS.map((chart) => (
          <CrmChartItem key={chart.metric} {...chart} globalData={globalData} rows={rows} />
        ))}
      </div>
    </section>
  );
}

type CrmChartItemProps = ChartDefinition & {
  globalData: CrmHistoricoRow;
  rows: CrmDimensionValue[];
};

function CrmChartItem({ title, metric, type, theme, globalData, rows }: CrmChartItemProps) {
  const [hovered, setHovered] = useState<DoughnutHoverValue | null>(null);

  // Widened deliberately: `satisfies` narrows `unit` to the literals in use, so a
  // read through the map alone makes the other branches below look unreachable.
  const config: CrmMetricConfig = CRM_ANALYTICS_METRICS[metric];

  const distribution = useMemo(
    () => getCrmChartDistribution(rows, globalData, config),
    [rows, globalData, config],
  );

  /** Unit of the metric itself — the hover readout shows the raw value. */
  const suffix = config.unit === '%' ? '%' : config.unit === 'h' ? ' h' : '';

  /**
   * Unit of what is actually plotted. `ranking` draws the raw value, so it takes
   * the metric's own unit; the share-based modes always draw a percentage of the
   * total, whatever the underlying metric is measured in.
   */
  const plottedSuffix = config.mode === 'ranking' ? suffix : '%';

  // The chart title names the series in the bar legend; several titles already
  // carry their unit, so the suffix is not appended here a second time.
  const barData = useMemo(() => toBarChartData(distribution, title), [distribution, title]);
  const doughnutData = useMemo(() => toDoughnutChartData(distribution), [distribution]);

  const barOptions = useMemo(
    () => getHorizontalBarOptions(undefined, plottedSuffix),
    [plottedSuffix],
  );

  const doughnutOptions = useMemo(
    () =>
      getDoughnutOptions(
        { title: hovered?.name ?? title, value: hovered?.val ?? '', color: CHART_CHROME.textStrong },
        handleHover(setHovered, doughnutData, suffix),
        { valueSuffix: plottedSuffix },
      ),
    [doughnutData, hovered, plottedSuffix, suffix, title],
  );

  const isEmpty = distribution.length === 0;

  return (
    <NeonContainer theme={theme} title={title}>
      {isEmpty ? (
        <EmptyState title="Sin datos para el periodo seleccionado." className="h-[320px]" />
      ) : type === 'bar' ? (
        <BarChart data={barData} options={barOptions} />
      ) : (
        <DoughnutChart data={doughnutData} options={doughnutOptions} />
      )}
    </NeonContainer>
  );
}
