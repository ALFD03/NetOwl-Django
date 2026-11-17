/** Tipos del usuario autenticado y del catálogo de permisos. */

/**
 * Las unidades de negocio que ve una cuenta o un grupo sin el permiso de verlas
 * todas: ids de `Coordinador` y el bloque RF (ver `services/config/units.py`).
 */
export interface UnidadesSeleccion {
  ids: number[];
  rf: boolean;
}

export type Permission =
  | 'can_view_subscriptions'
  | 'can_view_crm'
  | 'can_view_imports'
  | 'can_view_support'
  | 'can_view_subs_dashboard'
  | 'can_view_crm_dashboard'
  | 'can_view_support_dashboard'
  | 'can_view_subs_analytics'
  | 'can_view_subs_results'
  | 'can_view_subs_lifetime'
  | 'can_view_subs_sales'
  | 'can_view_subs_business_units'
  | 'can_view_eta'
  | 'can_view_crm_analytics'
  | 'can_view_crm_results'
  | 'can_view_support_analytics'
  | 'can_view_support_results'
  | 'can_view_support_abiertos'
  | 'can_view_imports_subs'
  | 'can_view_imports_crm'
  | 'can_view_imports_support'
  | 'can_view_import_history'
  | 'can_view_comisiones'
  | 'can_view_all_periods'
  | 'can_view_all_business_units'
  | 'can_view_users'
  | 'can_view_auditoria'
  | 'can_use_api'
  | 'can_import_data'
  | 'can_run_calculations'
  | 'can_run_lifetime'
  | 'can_manage_eta'
  | 'can_manage_catalogo_comercial'
  | 'can_manage_catalogo_operacional'
  | 'can_manage_catalogo_ventas'
  | 'can_manage_support_users'
  | 'can_manage_comisiones'
  | 'can_reopen_comisiones'
  | 'can_delete_comisiones'
  | 'can_create_users'
  | 'can_edit_user_permissions'
  | 'can_change_passwords'
  | 'can_delete_users'
  | 'can_manage_groups'
  | 'can_manage_api_tokens'
  | 'can_import_subs'
  | 'can_import_crm'
  | 'can_import_support'
  | 'can_run_subs_analysis'
  | 'can_run_crm_analysis'
  | 'can_run_support_analysis';

/** La cuenta actual tal y como la devuelve `GET /api/auth/me/`. */
export interface CurrentUser {
  id: number;
  username: string;
  is_superuser: boolean;
  role: string | null;
  group: string | null;
  /** Matriz efectiva: la del grupo si tiene uno, todo para superusuarios. */
  permissions: Record<Permission, boolean>;
  /** Primera página que puede abrir, o null si no tiene ninguna. */
  landing: string | null;
  auth: 'session' | 'token';
}
