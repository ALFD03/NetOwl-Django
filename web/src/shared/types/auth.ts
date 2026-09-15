/** Tipos del usuario autenticado y del catálogo de permisos. */

export type Permission =
  | 'can_view_subscriptions'
  | 'can_view_crm'
  | 'can_view_imports'
  | 'can_view_support'
  | 'can_view_subs_analytics'
  | 'can_view_subs_results'
  | 'can_view_subs_lifetime'
  | 'can_view_subs_sales'
  | 'can_view_eta'
  | 'can_view_crm_analytics'
  | 'can_view_crm_results'
  | 'can_view_support_analytics'
  | 'can_view_support_results'
  | 'can_view_imports_subs'
  | 'can_view_imports_crm'
  | 'can_view_imports_support'
  | 'can_view_import_history'
  | 'can_import_data'
  | 'can_run_calculations'
  | 'can_run_lifetime'
  | 'can_manage_eta'
  | 'can_manage_users'
  | 'can_manage_catalogos'
  | 'can_import_subs'
  | 'can_import_crm'
  | 'can_import_support'
  | 'can_run_subs_analysis'
  | 'can_run_crm_analysis'
  | 'can_run_support_analysis';

export interface UserProfile {
  role: string;
  can_view_subscriptions: boolean;
  can_view_crm: boolean;
  can_view_imports: boolean;
  can_view_support: boolean;
  can_view_subs_analytics: boolean;
  can_view_subs_results: boolean;
  can_view_subs_lifetime: boolean;
  can_view_subs_sales: boolean;
  can_view_eta: boolean;
  can_view_crm_analytics: boolean;
  can_view_crm_results: boolean;
  can_view_support_analytics: boolean;
  can_view_support_results: boolean;
  can_view_imports_subs: boolean;
  can_view_imports_crm: boolean;
  can_view_imports_support: boolean;
  can_view_import_history: boolean;
  can_import_data: boolean;
  can_run_calculations: boolean;
  can_run_lifetime: boolean;
  can_manage_eta: boolean;
  can_manage_users: boolean;
  can_manage_catalogos: boolean;
  can_import_subs: boolean;
  can_import_crm: boolean;
  can_import_support: boolean;
  can_run_subs_analysis: boolean;
  can_run_crm_analysis: boolean;
  can_run_support_analysis: boolean;
}

export interface AuthUser {
  id: number;
  username: string;
  is_superuser: boolean;
  profile: UserProfile;
}

export interface AuthProps {
  user: AuthUser;
}
