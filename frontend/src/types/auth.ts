//! ---------- Matriz de Permisos de los usuarios ----------
export interface UserProfile {
    //* Rol del usuario 
    role: string;

    //* Modulos principales 
    can_view_subscriptions: boolean;
    can_view_crm: boolean;
    can_view_imports: boolean;
    can_view_support: boolean;

    //? Permisos de Visualizacion de modulo de Subs  
    can_view_subs_analytics: boolean;
    can_view_subs_results: boolean;
    can_view_subs_lifetime: boolean;
    can_view_subs_sales: boolean;
    can_view_eta: boolean;

    //? Permisos de Visualizacion de modulo de CRM
    can_view_crm_analytics: boolean;
    can_view_crm_results: boolean;

    //? Permisos de Visualizacion de modulo de support
    can_view_support_analytics: boolean;
    can_view_support_results: boolean;

//! ---------- Permisos de Ejecucion ----------
    //? Importacion de Datos
    can_import_data: boolean;
    
    //? Ejecucion de Calculos
    can_run_calculations: boolean;
    
    //? Ejecucion del analisis de tiempo de vida
    can_run_lifetime: boolean;

    //? Gestionar y controlar el eta
    can_manage_eta: boolean;

    //? Gestionar usuarios y grupos
    can_manage_users: boolean;
}

//! ---------- Definicion del usuario y permisios ----------
export interface AuthUser {
  id: number;
  username: string;
  is_superuser: boolean;
  profile: UserProfile;
}

export interface AuthProps {
  user: AuthUser;
}