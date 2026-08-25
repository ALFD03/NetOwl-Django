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
} from './analyticsChartData';
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

  const suffix =
    config.unit === '%'
      ? '%'
      : config.unit === '$'
        ? '$'
        : '';

  const barData = useMemo(
    () => toBarChartData(distribution),
    [distribution],
  );

  const doughnutData = useMemo(
    () => toDoughnutChartData(distribution),
    [distribution],
  );

  const barOptions = useMemo(
    () =>
      getHorizontalBarOptions(
        undefined,
        suffix,
      ),
    [suffix],
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
      ),
    [doughnutData, hovered, suffix, title],
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