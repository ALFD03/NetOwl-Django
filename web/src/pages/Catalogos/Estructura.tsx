/**
 * Página Inertia `Catalogos/Estructura` (`/catalogos/estructura/`).
 *
 * Zonas, sites y estados.
 */

import { EstructuraView } from '@/features/subscriptions/components/catalogos/EstructuraView';
import type { CatalogosEstructuraProps } from '@/features/subscriptions/types';

export default function CatalogosEstructura(props: CatalogosEstructuraProps) {
  return <EstructuraView {...props} />;
}
