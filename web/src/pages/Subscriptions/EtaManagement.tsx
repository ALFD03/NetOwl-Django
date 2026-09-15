/**
 * Página Inertia `Subscriptions/EtaManagement` (`/subscriptions/eta-report/config/`).
 *
 * Parametriza las excepciones por suscripción. La clasificación de un plan se
 * edita en el catálogo, no aquí.
 */

import { EtaManagementView } from '@/features/subscriptions/components/etamanagement/EtaView';
import type { SubscriptionEtaManagementProps } from '@/features/subscriptions/types';

export default function EtaManagement(props: SubscriptionEtaManagementProps) {
  return <EtaManagementView {...props} />;
}
