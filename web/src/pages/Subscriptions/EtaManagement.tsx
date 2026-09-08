import { EtaManagementView } from '@/features/subscriptions/components/etamanagement/EtaView';
import type { SubscriptionEtaManagementProps } from '@/features/subscriptions/types';

export default function EtaManagement(props: SubscriptionEtaManagementProps) {
  return <EtaManagementView {...props} />;
}
