import type { AnalyticsMetricConfig } from '../../lib/analyticsDistribution';

export const ANALYTICS_METRICS = {
  churnNeto: {
    dimensionKey: 'churn_neto_pct',
    globalKey: 'churn_neto_pct',
    mode: 'ranking',
    unit: '%',
    direction: 'loss',
    round: 2,
  },

  churnBruto: {
    dimensionKey: 'churn_bruto_pct',
    globalKey: 'churn_bruto_pct',
    mode: 'ranking',
    unit: '%',
    direction: 'loss',
    round: 2,
  },

  suspensiones: {
    dimensionKey: 'porcentaje_suspensiones',
    globalKey: 'porcentaje_suspensiones',
    mode: 'ranking',
    unit: '%',
    direction: 'loss',
    round: 2,
  },

  nuevos: {
    dimensionKey: 'nuevos',
    globalKey: 'nuevos_mes',
    mode: 'simple',
    unit: 'number',
    direction: 'growth',
    round: 0,
  },

  adicionesBrutas: {
    dimensionKey: 'adiciones_brutas',
    globalKey: 'adiciones_brutas',
    mode: 'ranking',
    unit: 'number',
    direction: 'growth',
    round: 0,
  },

  crecimiento: {
    dimensionKey: 'crecimiento',
    globalKey: 'crecimiento',
    mode: 'weighted',
    unit: '%',
    direction: 'growth',
    round: 2,
  },

  winback: {
    dimensionKey: 'tasa_winback_pct',
    globalKey: 'tasa_winback_pct',
    mode: 'weighted',
    unit: '%',
    direction: 'growth',
    round: 2,
  },

  aporteReactivacion: {
    dimensionKey: 'tasa_aporte_react_pct',
    globalKey: 'tasa_aporte_react_pct',
    mode: 'weighted',
    unit: '%',
    direction: 'growth',
    round: 2,
  },

  indiceReemplazo: {
    dimensionKey: 'indice_reemplazo_react_pct',
    globalKey: 'indice_reemplazo_react_pct',
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

export type AnalyticsMetricKey = keyof typeof ANALYTICS_METRICS;