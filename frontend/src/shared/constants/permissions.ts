import type { Permission } from '@/shared/types/auth';

export const PERMISSIONS = {
  VIEW_SUBSCRIPTIONS: 'can_view_subscriptions',
  VIEW_CRM: 'can_view_crm',
  VIEW_IMPORTS: 'can_view_imports',
  VIEW_SUPPORT: 'can_view_support',
  VIEW_SUBS_ANALYTICS: 'can_view_subs_analytics',
  VIEW_SUBS_RESULTS: 'can_view_subs_results',
  VIEW_SUBS_LIFETIME: 'can_view_subs_lifetime',
  VIEW_SUBS_SALES: 'can_view_subs_sales',
  VIEW_ETA: 'can_view_eta',
  VIEW_CRM_ANALYTICS: 'can_view_crm_analytics',
  VIEW_CRM_RESULTS: 'can_view_crm_results',
  VIEW_SUPPORT_ANALYTICS: 'can_view_support_analytics',
  VIEW_SUPPORT_RESULTS: 'can_view_support_results',
  IMPORT_DATA: 'can_import_data',
  RUN_CALCULATIONS: 'can_run_calculations',
  RUN_LIFETIME: 'can_run_lifetime',
  MANAGE_ETA: 'can_manage_eta',
  MANAGE_USERS: 'can_manage_users',
} as const satisfies Record<string, Permission>;

export const PERMISSION_GROUPS = [
  {
    category: 'Módulos Principales (Navegación)',
    perms: [
      { key: PERMISSIONS.VIEW_SUBSCRIPTIONS, label: 'Módulo Subscriptions' },
      { key: PERMISSIONS.VIEW_CRM, label: 'Módulo CRM Analytics' },
      { key: PERMISSIONS.VIEW_SUPPORT, label: 'Módulo Technical Support' },
      { key: PERMISSIONS.VIEW_IMPORTS, label: 'Módulo de Importaciones' },
    ],
  },
  {
    category: 'Métricas de Subscriptions',
    perms: [
      { key: PERMISSIONS.VIEW_SUBS_ANALYTICS, label: 'Ver Subscriptions Analytics' },
      { key: PERMISSIONS.VIEW_SUBS_RESULTS, label: 'Ver Subscriptions Results' },
      { key: PERMISSIONS.VIEW_SUBS_LIFETIME, label: 'Ver Life Time Cycle' },
      { key: PERMISSIONS.VIEW_SUBS_SALES, label: 'Ver Sales Report & Business Units' },
      { key: PERMISSIONS.VIEW_ETA, label: 'Ver Reporte Regulatorio ETA' },
    ],
  },
  {
    category: 'Métricas de CRM & Support',
    perms: [
      { key: PERMISSIONS.VIEW_CRM_ANALYTICS, label: 'Ver CRM Analytics' },
      { key: PERMISSIONS.VIEW_CRM_RESULTS, label: 'Ver CRM Results' },
      { key: PERMISSIONS.VIEW_SUPPORT_ANALYTICS, label: 'Ver Support Analytics' },
      { key: PERMISSIONS.VIEW_SUPPORT_RESULTS, label: 'Ver Support Results' },
    ],
  },
  {
    category: 'Acciones & Privilegios Especiales',
    perms: [
      { key: PERMISSIONS.IMPORT_DATA, label: 'Importar archivos CSV' },
      { key: PERMISSIONS.RUN_CALCULATIONS, label: 'Ejecutar Cálculos y Motores' },
      { key: PERMISSIONS.RUN_LIFETIME, label: 'Ejecutar Motor Kaplan-Meier' },
      { key: PERMISSIONS.MANAGE_ETA, label: 'Administrar Maestro ETA' },
      { key: PERMISSIONS.MANAGE_USERS, label: 'Administrar Usuarios y Seguridad' },
    ],
  },
] as const;
