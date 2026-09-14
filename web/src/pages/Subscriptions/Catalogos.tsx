/**
 * Página Inertia `Subscriptions/Catalogos` (`/subscriptions/config/`).
 *
 * Mantiene los catálogos de referencia y, en su primera pestaña, lo que falta:
 * productos ya importados que ningún plan reconoce.
 */

import { CatalogosView } from '@/features/subscriptions/components/catalogos/CatalogosView';
import type { SubscriptionCatalogosProps } from '@/features/subscriptions/types';

export default function SubscriptionsCatalogos(props: SubscriptionCatalogosProps) {
  return <CatalogosView {...props} />;
}
