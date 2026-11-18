/** Barril del feature de soporte: vistas, hooks y lectura de métricas. */

export { SupportDashboardView } from './components/SupportDashboardView';
export { SupportAnalyticsView } from './components/SupportAnalyticsView';
export { SupportResultsView } from './components/SupportResultsView';
export { SupportUsersView } from './components/users/SupportUsersView';
export { Seccion, SeccionesNav } from './components/Seccion';
export { SupportStagesView } from './components/flow/SupportStagesView';
export { SupportAnalyticsFilters } from './components/analytics/SupportAnalyticsFilters';
export { useSupportDashboard } from './hooks/useSupportDashboard';
export { useSupportAnalytics } from './hooks/useSupportAnalytics';
export { useSupportUsers } from './hooks/useSupportUsers';
export * from './lib/supportDaySummary';
export * from './lib/supportMetrics';
export type * from './types';
