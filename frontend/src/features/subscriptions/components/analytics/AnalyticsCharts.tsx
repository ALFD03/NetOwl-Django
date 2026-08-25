import { useMemo, useState } from 'react';
import {
  BarChart,
  DoughnutChart,
  getDoughnutOptions,
  getHorizontalBarOptions,
  handleHover,
} from '@/shared/charts';
import { NeonContainer, type NeonTheme } from '@/shared/ui';
import type { DimensionVal, Periodo } from '@/shared/types/domain';
import {
  getChartDistribution,
  toBarChartData,
  toDoughnutChartData,
} from '../../lib/analyticsDistribution';
import { ANALYTICS_METRICS } from './analyticsChartConfig';
import { ANALYTICS_CHART_SECTIONS } from './analyticsChartSections';
import { AnalyticsSection } from './AnalyticsSection';

interface Props {
  globalData: Periodo;
  currentDimensionData: DimensionVal[];
  selectedDimension?: string;
}

type HoverState = {
  name: string;
  val: string;
};

const DIMENSION_LABELS: Record<string, string> = {
  zona: 'Zona',
  sucursal: 'Sucursal',
  municipio: 'Municipio',
  campaña: 'Campaña',
  campana: 'Campaña',
  producto: 'Producto',
};

export function AnalyticsCharts({
  globalData,
  currentDimensionData,
  selectedDimension = 'zona',
}: Props) {
  const dimensionLabel =
    DIMENSION_LABELS[selectedDimension] ?? selectedDimension;

  return (
    <div className="space-y-12">
      {ANALYTICS_CHART_SECTIONS.map((section) => {
        const gridClass =
          section.charts.length === 3
            ? 'grid grid-cols-1 lg:grid-cols-3 gap-6'
            : 'grid grid-cols-1 lg:grid-cols-2 gap-6';

        return (
          <AnalyticsSection
            key={section.title}
            title={section.title}
            description={`Basado en ${dimensionLabel}`}
            theme={section.theme}
          >
            <div className={gridClass}>
              {section.charts.map((chart) => (
                <AnalyticsChartItem
                  key={chart.metric}
                  title={chart.title}
                  metric={chart.metric}
                  type={chart.type}
                  theme={section.theme}
                  globalData={globalData}
                  currentDimensionData={currentDimensionData}
                />
              ))}
            </div>
          </AnalyticsSection>
        );
      })}
    </div>
  );
}

interface AnalyticsChartItemProps {
  title: string;
  metric: keyof typeof ANALYTICS_METRICS;
  type: 'bar' | 'doughnut';
  theme: NeonTheme;
  globalData: Periodo;
  currentDimensionData: DimensionVal[];
}

function AnalyticsChartItem({
  title,
  metric,
  type,
  theme,
  globalData,
  currentDimensionData,
}: AnalyticsChartItemProps) {
  const [hovered, setHovered] = useState<HoverState | null>(null);

  const config = ANALYTICS_METRICS[metric];

  const distribution = useMemo(
    () =>
      getChartDistribution(
        currentDimensionData,
        globalData,
        config,
      ),
    [currentDimensionData, globalData, config],
  );

  /** Unit of the metric itself — used for the hover readout, which shows the raw value. */
  const suffix =
    config.unit === '%'
      ? '%'
      : config.unit === '$'
        ? '$'
        : '';

  /**
   * Unit of what is actually plotted. `ranking` draws the raw value, so it takes
   * the metric's own unit; the share-based modes draw a percentage of the total
   * regardless of what the underlying metric is measured in.
   */
  const plottedSuffix = config.mode === 'ranking' ? suffix : '%';

  const barData = useMemo(
    // The chart title names the series in the bar legend. Several titles already
    // carry their unit ("Ranking Facturación Total ($)"), so appending the suffix
    // here would print it twice.
    () => toBarChartData(distribution, title),
    [distribution, title],
  );

  const doughnutData = useMemo(
    () => toDoughnutChartData(distribution),
    [distribution],
  );

  const barOptions = useMemo(
    () =>
      getHorizontalBarOptions(
        undefined,
        plottedSuffix,
      ),
    [plottedSuffix],
  );

  const doughnutOptions = useMemo(
    () =>
      getDoughnutOptions(
        {
          title: hovered?.name ?? title,
          value: hovered?.val ?? '',
          color: '#ffffff',
        },
        handleHover(
          setHovered,
          doughnutData,
          suffix,
        ),
        { valueSuffix: plottedSuffix },
      ),
    [doughnutData, hovered, plottedSuffix, suffix, title],
  );

  return (
    <NeonContainer
      theme={theme}
      title={title}
    >
      {type === 'bar' ? (
        <BarChart
          data={barData}
          options={barOptions}
        />
      ) : (
        <DoughnutChart
          data={doughnutData}
          options={doughnutOptions}
        />
      )}
    </NeonContainer>
  );
}