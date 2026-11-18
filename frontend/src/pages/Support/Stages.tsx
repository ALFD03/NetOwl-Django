/** `/support/etapas/`: de qué equipo es cada etapa y qué se hace en ella. */

import { SupportStagesView } from '@/features/support/components/flow/SupportStagesView';
import type { SupportStagesProps } from '@/features/support/types';

export default function SupportStages(props: SupportStagesProps) {
  return <SupportStagesView {...props} />;
}
