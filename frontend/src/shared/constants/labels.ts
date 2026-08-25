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

export const SUBSCRIPTION_DIMENSIONS = Object.entries(DIMENSION_LABELS).map(([key, label]) => ({ key, label }));
