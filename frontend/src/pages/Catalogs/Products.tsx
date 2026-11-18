/**
 * Página `/catalogos/productos/`.
 *
 * Planes y planes reguladores.
 */

import { ProductsView } from '@/features/subscriptions/components/catalogs/ProductsView';
import type { CatalogsProductsProps } from '@/features/subscriptions/types';

export default function CatalogsProducts(props: CatalogsProductsProps) {
  return <ProductsView {...props} />;
}
