/** Las métricas seleccionables del gráfico y cómo se lee cada una. */

import type { AnalyticsMetricConfig } from '../../lib/analyticsDistribution';

export const ANALYTICS_METRICS = {
  churnNeto: {
    dimensionKey: 'net_churn_pct',
    globalKey: 'net_churn_pct',
    mode: 'ranking',
    unit: '%',
    direction: 'loss',
    round: 2,
  },

  churnBruto: {
    dimensionKey: 'gross_churn_pct',
    globalKey: 'gross_churn_pct',
    mode: 'ranking',
    unit: '%',
    direction: 'loss',
    round: 2,
  },

  suspensiones: {
    dimensionKey: 'suspension_pct',
    globalKey: 'suspension_pct',
    mode: 'ranking',
    unit: '%',
    direction: 'loss',
    round: 2,
  },

  nuevos: {
    dimensionKey: 'new_subs',
    globalKey: 'new_in_month',
    mode: 'simple',
    unit: 'number',
    direction: 'growth',
    round: 0,
  },

  adicionesBrutas: {
    dimensionKey: 'gross_adds',
    globalKey: 'gross_adds',
    mode: 'ranking',
    unit: 'number',
    direction: 'growth',
    round: 0,
  },

  crecimiento: {
    dimensionKey: 'growth',
    globalKey: 'growth',
    mode: 'weighted',
    unit: '%',
    direction: 'growth',
    round: 2,
  },

  winback: {
    dimensionKey: 'winback_rate_pct',
    globalKey: 'winback_rate_pct',
    mode: 'weighted',
    unit: '%',
    direction: 'growth',
    round: 2,
  },

  aporteReactivacion: {
    dimensionKey: 'react_contribution_pct',
    globalKey: 'react_contribution_pct',
    mode: 'weighted',
    unit: '%',
    direction: 'growth',
    round: 2,
  },

  indiceReemplazo: {
    dimensionKey: 'react_replacement_pct',
    globalKey: 'react_replacement_pct',
    mode: 'ranking',
    unit: '%',
    direction: 'growth',
    round: 2,
  },

  recuperaciones: {
    dimensionKey: 'react_4_P',
    globalKey: 'react_4_P',
    mode: 'ranking',
    unit: 'number',
    direction: 'growth',
    round: 0,
  },

  arpu: {
    dimensionKey: 'arpu',
    globalKey: 'arpu',
    mode: 'weighted',
    unit: '$',
    direction: 'growth',
    round: 2,
  },

  billing: {
    dimensionKey: 'total_billing',
    globalKey: 'total_billing',
    mode: 'ranking',
    unit: '$',
    direction: 'growth',
    round: 2,
  },
} satisfies Record<string, AnalyticsMetricConfig>;
