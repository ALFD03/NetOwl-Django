/**
 * Página Inertia `Catalogos/Notificaciones` (`/catalogos/notificaciones/`).
 *
 * Lo pendiente de cada área del catálogo y lo que se decidió ignorar.
 */

import { NotificacionesView } from '@/features/subscriptions/components/catalogos/NotificacionesView';
import type { CatalogosNotificacionesProps } from '@/features/subscriptions/types';

export default function CatalogosNotificaciones(props: CatalogosNotificacionesProps) {
  return <NotificacionesView {...props} />;
}
