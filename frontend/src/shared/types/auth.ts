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
  | 'can_import_data'
  | 'can_run_calculations'
  | 'can_run_lifetime'
  | 'can_manage_eta'
  | 'can_manage_users';

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
  can_import_data: boolean;
  can_run_calculations: boolean;
  can_run_lifetime: boolean;
  can_manage_eta: boolean;
  can_manage_users: boolean;
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
