/**
 * Página `/catalogos/ventas/`.
 *
 * Coordinadores de unidad de negocio y objetivos comerciales.
 */

import { SalesView } from '@/features/subscriptions/components/catalogs/SalesView';
import type { CatalogsSalesProps } from '@/features/subscriptions/types';

export default function CatalogsSales(props: CatalogsSalesProps) {
  return <SalesView {...props} />;
}
