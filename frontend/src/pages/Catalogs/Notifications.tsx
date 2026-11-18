/**
 * Página `/catalogos/notificaciones/`.
 *
 * Lo pendiente de cada área del catálogo y lo que se decidió ignorar.
 */

import { NotificationsView } from '@/features/subscriptions/components/catalogs/NotificationsView';
import type { CatalogsNotificationsProps } from '@/features/subscriptions/types';

export default function CatalogsNotifications(props: CatalogsNotificationsProps) {
  return <NotificationsView {...props} />;
}
