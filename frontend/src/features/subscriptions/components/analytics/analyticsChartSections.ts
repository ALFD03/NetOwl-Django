import type { NeonTheme } from '@/shared/ui';
import { ANALYTICS_METRICS } from './analyticsChartConfig';

export type AnalyticsChartType = 'bar' | 'doughnut';

export interface AnalyticsChartDefinition {
  title: string;
  metric: keyof typeof ANALYTICS_METRICS;
  type: AnalyticsChartType;
}

export interface AnalyticsSectionDefinition {
  title: string;
  description?: string;
  theme: NeonTheme;
  charts: AnalyticsChartDefinition[];
}

export const ANALYTICS_CHART_SECTIONS: AnalyticsSectionDefinition[] = [
  {
    title: 'Análisis Dimensional de Pérdida',
    theme: 'red',
    charts: [
      {
        title: 'Top Churn Neto %',
        metric: 'churnNeto',
        type: 'bar',
      },
      {
        title: 'Top Churn Bruto %',
        metric: 'churnBruto',
        type: 'bar',
      },
      {
        title: 'Top % Suspensiones',
        metric: 'suspensiones',
        type: 'bar',
      },
    ],
  },

  {
    title: 'Análisis Dimensional de Ingresos',
    theme: 'green',
    charts: [
      {
        title: 'Concentración de Clientes Nuevos',
        metric: 'nuevos',
        type: 'doughnut',
      },
      {
        title: 'Ranking Adiciones Brutas',
        metric: 'adicionesBrutas',
        type: 'bar',
      },
      {
        title: 'Aporte al Crecimiento Global %',
        metric: 'crecimiento',
        type: 'doughnut',
      },
    ],
  },

  {
    title: 'Análisis Dimensional de Retención',
    theme: 'blue',
    charts: [
      {
        title: 'Aporte a Tasa Winback',
        metric: 'winback',
        type: 'doughnut',
      },
      {
        title: 'Ranking Tasa de Aporte Reactivación',
        metric: 'aporteReactivacion',
        type: 'bar',
      },
      {
        title: 'Ranking Índice de Reemplazo',
        metric: 'indiceReemplazo',
        type: 'bar',
      },
      {
        title: 'Recuperados de Suspensión (Absolutos)',
        metric: 'recuperaciones',
        type: 'bar',
      },
    ],
  },

  {
    title: 'Análisis Dimensional Financiero',
    theme: 'yellow',
    charts: [
      {
        title: 'Aporte de ARPU por Dimensión',
        metric: 'arpu',
        type: 'doughnut',
      },
      {
        title: 'Ranking Facturación Total ($)',
        metric: 'billing',
        type: 'bar',
      },
    ],
  },
];