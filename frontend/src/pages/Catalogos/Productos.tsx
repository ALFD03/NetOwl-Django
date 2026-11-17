/**
 * Página Inertia `Catalogos/Productos` (`/catalogos/productos/`).
 *
 * Planes y planes reguladores.
 */

import { ProductosView } from '@/features/subscriptions/components/catalogos/ProductosView';
import type { CatalogosProductosProps } from '@/features/subscriptions/types';

export default function CatalogosProductos(props: CatalogosProductosProps) {
  return <ProductosView {...props} />;
}
