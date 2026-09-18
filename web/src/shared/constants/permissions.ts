/**
 * Los nombres de los permisos, **espejo manual** de `PERMISSION_FIELDS` en
 * `services/config/models.py`.
 *
 * Nada comprueba que las dos listas estén en paso: al añadir un permiso en el
 * backend hay que añadirlo también aquí.
 */

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
  VIEW_IMPORTS_SUBS: 'can_view_imports_subs',
  VIEW_IMPORTS_CRM: 'can_view_imports_crm',
  VIEW_IMPORTS_SUPPORT: 'can_view_imports_support',
  VIEW_IMPORT_HISTORY: 'can_view_import_history',
  IMPORT_DATA: 'can_import_data',
  RUN_CALCULATIONS: 'can_run_calculations',
  RUN_LIFETIME: 'can_run_lifetime',
  MANAGE_ETA: 'can_manage_eta',
  MANAGE_USERS: 'can_manage_users',
  MANAGE_CATALOGOS: 'can_manage_catalogos',
  MANAGE_SUPPORT_USERS: 'can_manage_support_users',
  IMPORT_SUBS: 'can_import_subs',
  IMPORT_CRM: 'can_import_crm',
  IMPORT_SUPPORT: 'can_import_support',
  RUN_SUBS_ANALYSIS: 'can_run_subs_analysis',
  RUN_CRM_ANALYSIS: 'can_run_crm_analysis',
  RUN_SUPPORT_ANALYSIS: 'can_run_support_analysis',
} as const satisfies Record<string, Permission>;

/*
 * Aqui habia un Set `VIEW_PERMISSIONS` con los diecisiete permisos de lectura,
 * que existia solo para premarcarlos en el formulario de un grupo nuevo. Ya no
 * se premarcan (ver abajo), asi que la division lectura/accion vive unicamente
 * donde es normativa: `VIEW_PERMISSION_FIELDS` y `ACTION_PERMISSION_FIELDS` en
 * services/config/models.py.
 */

/**
 * Matriz con la que se abre el formulario de un grupo nuevo: todo cerrado.
 *
 * Antes venia con los permisos de lectura marcados, reflejando el `default=True`
 * que tenian esos campos en el modelo. Ya no lo tienen (ver la migracion
 * `config/0004_cerrar_permisos_de_lectura`): conceder lectura es un acto
 * explicito, y dejar el formulario premarcado volveria a abrirla de hecho,
 * porque el formulario envia la matriz entera tal y como se ve.
 */
export const DEFAULT_GROUP_PERMISSIONS = Object.fromEntries(
  Object.values(PERMISSIONS).map((permission) => [permission, false]),
) as Record<Permission, boolean>;

/**
 * Matriz con la que se abre el formulario de "Nuevo Usuario": solo el modulo de
 * suscripciones, que es el que abre su dashboard.
 *
 * Es el espejo de `PERMISOS_INICIALES` en services/config/models.py, y hay que
 * mantener las dos listas de acuerdo (ver CLAUDE.md): el backend lo aplica a la
 * cuenta que crea la senal `create_user_profile`, pero el formulario manda la
 * matriz entera y `apply_permissions` escribe los campos ausentes como false,
 * asi que si aqui no estuviera, la cuenta acabaria sin ningun modulo.
 */
export const DEFAULT_USER_PERMISSIONS = {
  ...DEFAULT_GROUP_PERMISSIONS,
  [PERMISSIONS.VIEW_SUBSCRIPTIONS]: true,
} as Record<Permission, boolean>;

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
    category: 'Páginas del Módulo de Importaciones',
    perms: [
      { key: PERMISSIONS.VIEW_IMPORTS_SUBS, label: 'Ver Importar Subscriptions' },
      { key: PERMISSIONS.VIEW_IMPORTS_CRM, label: 'Ver Importar CRM Analytics' },
      { key: PERMISSIONS.VIEW_IMPORTS_SUPPORT, label: 'Ver Importar Technical Support' },
      { key: PERMISSIONS.VIEW_IMPORT_HISTORY, label: 'Ver Historial de Acciones' },
    ],
  },
  {
    category: 'Cargas de CSV por Módulo',
    perms: [
      { key: PERMISSIONS.IMPORT_SUBS, label: 'Cargar CSV de Subscriptions' },
      { key: PERMISSIONS.IMPORT_CRM, label: 'Cargar CSV de CRM Analytics' },
      { key: PERMISSIONS.IMPORT_SUPPORT, label: 'Cargar CSV de Technical Support' },
    ],
  },
  {
    category: 'Ejecución de Análisis por Motor',
    perms: [
      { key: PERMISSIONS.RUN_SUBS_ANALYSIS, label: 'Ejecutar Análisis de Churn' },
      { key: PERMISSIONS.RUN_CRM_ANALYSIS, label: 'Ejecutar Análisis de CRM' },
      { key: PERMISSIONS.RUN_SUPPORT_ANALYSIS, label: 'Ejecutar Análisis de Support' },
    ],
  },
  {
    category: 'Acciones & Privilegios Especiales',
    perms: [
      { key: PERMISSIONS.IMPORT_DATA, label: 'Importar archivos CSV (comodín global)' },
      { key: PERMISSIONS.RUN_CALCULATIONS, label: 'Ejecutar Cálculos y Motores (comodín global)' },
      { key: PERMISSIONS.RUN_LIFETIME, label: 'Ejecutar Motor Kaplan-Meier' },
      { key: PERMISSIONS.MANAGE_ETA, label: 'Administrar Maestro ETA' },
      { key: PERMISSIONS.MANAGE_CATALOGOS, label: 'Administrar Catálogos (planes, zonas, sites…)' },
      { key: PERMISSIONS.MANAGE_SUPPORT_USERS, label: 'Administrar Usuarios de Soporte (directorio y departamentos)' },
      { key: PERMISSIONS.MANAGE_USERS, label: 'Administrar Usuarios y Seguridad' },
    ],
  },
] as const;

/**
 * Permisos que habilitan cada acción del módulo de Importaciones.
 *
 * Basta con uno: el permiso granular o el comodín global heredado. Los
 * decoradores de `frontend/imports/views.py` evalúan exactamente estos pares.
 */
export const IMPORT_ACTION_PERMISSIONS = {
  subs: [PERMISSIONS.IMPORT_SUBS, PERMISSIONS.IMPORT_DATA],
  crm: [PERMISSIONS.IMPORT_CRM, PERMISSIONS.IMPORT_DATA],
  support: [PERMISSIONS.IMPORT_SUPPORT, PERMISSIONS.IMPORT_DATA],
} as const satisfies Record<string, readonly Permission[]>;

export const ANALYSIS_ACTION_PERMISSIONS = {
  subs: [PERMISSIONS.RUN_SUBS_ANALYSIS, PERMISSIONS.RUN_CALCULATIONS],
  crm: [PERMISSIONS.RUN_CRM_ANALYSIS, PERMISSIONS.RUN_CALCULATIONS],
  support: [PERMISSIONS.RUN_SUPPORT_ANALYSIS, PERMISSIONS.RUN_CALCULATIONS],
} as const satisfies Record<string, readonly Permission[]>;
