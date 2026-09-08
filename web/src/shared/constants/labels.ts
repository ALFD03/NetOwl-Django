import { Building2, LayoutGrid, MapPin, Package, Star, type LucideIcon } from 'lucide-react';

export const DIMENSION_LABELS = {
  zona: 'Zona',
  sucursal: 'Sucursal',
  municipio: 'Municipio',
  campanna: 'Campaña',
  producto: 'Producto',
} as const;

export const DIMENSION_CONFIG: Record<string, { label: string; icon: LucideIcon }> = {
  zona: { label: 'Zonas', icon: MapPin },
  sucursal: { label: 'Sucursales', icon: Building2 },
  municipio: { label: 'Municipios', icon: LayoutGrid },
  campanna: { label: 'Campañas', icon: Star },
  producto: { label: 'Productos', icon: Package },
};

/**
 * CRM slices opportunities along its own three axes — they come from
 * `backend/crm/crm_config.py: DIMENSIONES` and must stay in step with it.
 */
export const CRM_DIMENSION_LABELS = {
  sucursal: 'Sucursal',
  campana: 'Campaña',
  vendedor: 'Vendedor',
} as const;

export type CrmDimensionKey = keyof typeof CRM_DIMENSION_LABELS;

/**
 * The funnel's stages, keyed as `backend/crm/crm_config.py: ETAPA_ORDER` names
 * them. Labels lead with the stage number because that is how the sales team
 * refers to them out loud.
 */
export const CRM_ETAPA_LABELS = {
  etapa_1_contacto: '1 · Contacto inicial',
  etapa_2_recepcion: '2 · Recepción de datos',
  etapa_3_factibilidad: '3 · Factibilidad',
  etapa_4_adecuaciones: '4 · Adecuaciones',
  etapa_5_gpi: '5 · GPI',
  etapa_6_contratistas: '6 · Contratistas',
  etapa_7_instalados: '7 · Instalados',
  etapa_8_devueltos: '8 · Devueltos',
  etapa_9_disponibles: '9 · Disponibles',
  etapa_10_proyectos: '10 · Proyectos',
  perdido: 'Perdido',
} as const;

/** Short form for column headers and chips, where the full label will not fit. */
export const CRM_ETAPA_LABELS_CORTAS: Record<string, string> = {
  etapa_1_contacto: 'E1 Contacto',
  etapa_2_recepcion: 'E2 Recepción',
  etapa_3_factibilidad: 'E3 Factibilidad',
  etapa_4_adecuaciones: 'E4 Adecuaciones',
  etapa_5_gpi: 'E5 GPI',
  etapa_6_contratistas: 'E6 Contratistas',
  etapa_7_instalados: 'E7 Instalados',
  etapa_8_devueltos: 'E8 Devueltos',
  etapa_9_disponibles: 'E9 Disponibles',
  etapa_10_proyectos: 'E10 Proyectos',
  perdido: 'Perdido',
};

/**
 * The stages sales steers by — mirrors `ETAPAS_CLAVE_VENTAS` in
 * `crm_config.py`, which also flags each row with `es_clave`.
 */
export const CRM_ETAPAS_CLAVE = [
  'etapa_1_contacto',
  'etapa_2_recepcion',
  'etapa_3_factibilidad',
  'etapa_5_gpi',
  'etapa_8_devueltos',
] as const;

/** `etapa_5_gpi` -> `5 · GPI`, falling back to the raw key for a new stage. */
export const crmEtapaLabel = (etapa: string): string =>
  CRM_ETAPA_LABELS[etapa as keyof typeof CRM_ETAPA_LABELS] ?? etapa;

export const SUBSCRIPTION_DIMENSIONS = Object.entries(DIMENSION_LABELS).map(([key, label]) => ({ key, label }));
