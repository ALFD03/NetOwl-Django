/**
 * Página Inertia `Catalogos/Ventas` (`/catalogos/ventas/`).
 *
 * Coordinadores de unidad de negocio y objetivos comerciales.
 */

import { VentasView } from '@/features/subscriptions/components/catalogos/VentasView';
import type { CatalogosVentasProps } from '@/features/subscriptions/types';

export default function CatalogosVentas(props: CatalogosVentasProps) {
  return <VentasView {...props} />;
}
