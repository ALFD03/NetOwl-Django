/** Barril del feature de CRM: vistas, hooks, utilidades y tipos. */

export { CrmDashboardView } from './components/CrmDashboardView';
export { CrmAnalyticsView } from './components/CrmAnalyticsView';
export { CrmAnalyticsFilters } from './components/analytics/CrmAnalyticsFilters';
export { CrmAnalyticsCharts } from './components/analytics/CrmAnalyticsCharts';
export { CrmAnalyticsTable } from './components/analytics/CrmAnalyticsTable';
export { CampanasExportButton } from './components/analytics/CampanasExportButton';
export { CrmStageTimeSection } from './components/analytics/CrmStageTimeSection';
export { CRM_ANALYTICS_COLUMNS } from './components/analytics/crmAnalyticsColumns';
export { CrmResultsView } from './components/CrmResultsView';
export { CrmPeriodDetail } from './components/CrmPeriodDetail';
export { CrmPeriodDimensions } from './components/CrmPeriodDimensions';
export { useCrmDashboard } from './hooks/useCrmDashboard';
export { useCrmAnalytics } from './hooks/useCrmAnalytics';
export { useCrmStageTime } from './hooks/useCrmStageTime';
export { useCrmPeriodDimensions } from './hooks/useCrmPeriodDimensions';
export * from './lib/crmAnalyticsDistribution';
export * from './lib/campanasExport';
export * from './lib/crmEfectividad';
export * from './lib/crmDaySummary';
export * from './lib/crmDimensions';
export * from './lib/crmTiempoEtapa';
export type * from './types';
