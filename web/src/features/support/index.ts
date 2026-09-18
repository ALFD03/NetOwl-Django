/** Barril del feature de soporte: vistas, hooks y lectura de métricas. */

export { SupportDashboardView } from './components/SupportDashboardView';
export { SupportAnalyticsView } from './components/SupportAnalyticsView';
export { SupportResultsView } from './components/SupportResultsView';
export { SupportUsuariosView } from './components/usuarios/SupportUsuariosView';
export { SupportAnalyticsFilters } from './components/analytics/SupportAnalyticsFilters';
export { useSupportDashboard } from './hooks/useSupportDashboard';
export { useSupportAnalytics } from './hooks/useSupportAnalytics';
export { useSupportUsuarios } from './hooks/useSupportUsuarios';
export * from './lib/supportDaySummary';
export * from './lib/supportMetrics';
export type * from './types';
