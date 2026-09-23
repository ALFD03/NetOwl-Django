/**
 * Los nombres de los permisos, **espejo manual** de `PERMISSION_FIELDS` en
 * `services/config/models.py`.
 *
 * Nada comprueba que las dos listas estén en paso: al añadir un permiso en el
 * backend hay que añadirlo también aquí.
 */

import { CloudDownload, Headset, KeyRound, Layers, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { Permission } from '@/shared/types/auth';
import type { MetricColor } from '@/shared/ui/theme/types';

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
  MANAGE_CATALOGO_COMERCIAL: 'can_manage_catalogo_comercial',
  MANAGE_CATALOGO_OPERACIONAL: 'can_manage_catalogo_operacional',
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

/**
 * El catálogo tal y como se ve en el editor: **una categoría por módulo**, con
 * su icono, su tono y una línea que dice qué concede.
 *
 * Están agrupados por *a qué módulo afectan* y no por tipo de acción, que es
 * como estaban antes. Conceder el acceso a CRM significaba entonces marcar en
 * cuatro categorías distintas —el módulo, sus páginas, su carga de CSV y su
 * análisis— y nada en la pantalla decía que esas cuatro casillas eran el mismo
 * encargo. Dentro de la tarjeta, `section` vuelve a separar ver / cargar y
 * calcular / administrar, que es la escalada de riesgo dentro de un módulo.
 *
 * Es metadato de presentación, no normativo —quien manda sobre qué permisos
 * existen sigue siendo `PERMISSIONS`, espejo del modelo—, pero vive aquí porque
 * es la misma lista, y separarla obligaría a mantener dos órdenes de acuerdo.
 */
export interface PermissionCategory {
  category: string;
  /** Una línea que explica qué abre la categoría, bajo el título. */
  hint: string;
  icon: LucideIcon;
  tone: MetricColor;
  /**
   * Los permisos, en plano y cada uno con el bloque al que pertenece. Plano y
   * no anidado para que contar y filtrar sigan siendo una línea; el editor los
   * agrupa por `section` al pintarlos.
   */
  perms: readonly { key: Permission; label: string; section: string }[];
}

/** Los bloques dentro de una tarjeta, en orden de riesgo creciente. */
export const PERMISSION_SECTIONS = ['Ver', 'Cargar y calcular', 'Administrar'] as const;

export const PERMISSION_GROUPS: readonly PermissionCategory[] = [
  {
    category: 'Subscriptions',
    hint: 'Churn, ciclo de vida, ventas y el reporte regulatorio ETA.',
    icon: Layers,
    tone: 'blue',
    perms: [
      { key: PERMISSIONS.VIEW_SUBSCRIPTIONS, label: 'Entrar al módulo', section: 'Ver' },
      { key: PERMISSIONS.VIEW_SUBS_ANALYTICS, label: 'Subscriptions Analytics', section: 'Ver' },
      { key: PERMISSIONS.VIEW_SUBS_RESULTS, label: 'Subscriptions Results', section: 'Ver' },
      { key: PERMISSIONS.VIEW_SUBS_LIFETIME, label: 'Life Time Cycle', section: 'Ver' },
      { key: PERMISSIONS.VIEW_SUBS_SALES, label: 'Sales Report & Business Units', section: 'Ver' },
      { key: PERMISSIONS.VIEW_ETA, label: 'Reporte Regulatorio ETA', section: 'Ver' },
      { key: PERMISSIONS.VIEW_IMPORTS_SUBS, label: 'Página de importación', section: 'Ver' },
      { key: PERMISSIONS.IMPORT_SUBS, label: 'Cargar el CSV de suscripciones', section: 'Cargar y calcular' },
      { key: PERMISSIONS.RUN_SUBS_ANALYSIS, label: 'Ejecutar el análisis de churn', section: 'Cargar y calcular' },
      { key: PERMISSIONS.RUN_LIFETIME, label: 'Ejecutar el motor Kaplan-Meier', section: 'Cargar y calcular' },
      { key: PERMISSIONS.MANAGE_ETA, label: 'Administrar el Maestro ETA', section: 'Administrar' },
      { key: PERMISSIONS.MANAGE_CATALOGO_COMERCIAL, label: 'Catálogo comercial (planes, reguladores, ignorados, por registrar)', section: 'Administrar' },
      { key: PERMISSIONS.MANAGE_CATALOGO_OPERACIONAL, label: 'Catálogo operacional (zonas, sites, estados, coordinadores)', section: 'Administrar' },
    ],
  },
  {
    category: 'CRM Analytics',
    hint: 'Oportunidades, efectividad y tiempos de la fuerza comercial.',
    icon: Users,
    tone: 'purple',
    perms: [
      { key: PERMISSIONS.VIEW_CRM, label: 'Entrar al módulo', section: 'Ver' },
      { key: PERMISSIONS.VIEW_CRM_ANALYTICS, label: 'CRM Analytics', section: 'Ver' },
      { key: PERMISSIONS.VIEW_CRM_RESULTS, label: 'CRM Results', section: 'Ver' },
      { key: PERMISSIONS.VIEW_IMPORTS_CRM, label: 'Página de importación', section: 'Ver' },
      { key: PERMISSIONS.IMPORT_CRM, label: 'Cargar el CSV de CRM', section: 'Cargar y calcular' },
      { key: PERMISSIONS.RUN_CRM_ANALYSIS, label: 'Ejecutar el análisis de CRM', section: 'Cargar y calcular' },
    ],
  },
  {
    category: 'Technical Support',
    hint: 'Tickets, grupos de trabajo y el directorio de técnicos.',
    icon: Headset,
    tone: 'green',
    perms: [
      { key: PERMISSIONS.VIEW_SUPPORT, label: 'Entrar al módulo', section: 'Ver' },
      { key: PERMISSIONS.VIEW_SUPPORT_ANALYTICS, label: 'Support Analytics', section: 'Ver' },
      { key: PERMISSIONS.VIEW_SUPPORT_RESULTS, label: 'Support Results', section: 'Ver' },
      { key: PERMISSIONS.VIEW_IMPORTS_SUPPORT, label: 'Página de importación', section: 'Ver' },
      { key: PERMISSIONS.IMPORT_SUPPORT, label: 'Cargar el CSV de soporte', section: 'Cargar y calcular' },
      { key: PERMISSIONS.RUN_SUPPORT_ANALYSIS, label: 'Ejecutar el análisis de soporte', section: 'Cargar y calcular' },
      { key: PERMISSIONS.MANAGE_SUPPORT_USERS, label: 'Administrar el directorio de soporte', section: 'Administrar' },
    ],
  },
  {
    category: 'Importaciones',
    hint: 'El módulo en sí. Lo que se carga en él va en cada módulo de arriba.',
    icon: CloudDownload,
    tone: 'slate',
    perms: [
      { key: PERMISSIONS.VIEW_IMPORTS, label: 'Entrar al módulo', section: 'Ver' },
      { key: PERMISSIONS.VIEW_IMPORT_HISTORY, label: 'Historial de acciones', section: 'Ver' },
    ],
  },
  {
    category: 'Transversales y Administración',
    hint: 'No son de un módulo: valen para los tres. Concede solo lo que haga falta.',
    icon: KeyRound,
    tone: 'red',
    perms: [
      { key: PERMISSIONS.IMPORT_DATA, label: 'Cargar cualquier CSV (comodín de los tres módulos)', section: 'Cargar y calcular' },
      { key: PERMISSIONS.RUN_CALCULATIONS, label: 'Ejecutar cualquier análisis (comodín de los tres módulos)', section: 'Cargar y calcular' },
      { key: PERMISSIONS.MANAGE_USERS, label: 'Administrar usuarios, grupos y permisos', section: 'Administrar' },
    ],
  },
];

/** Cuántos permisos hay en total, para el contador del editor. */
export const TOTAL_PERMISSIONS = PERMISSION_GROUPS.reduce(
  (total, group) => total + group.perms.length,
  0,
);

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
