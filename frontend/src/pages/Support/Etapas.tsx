/** Página Inertia `Support/Etapas` (`/support/etapas/`): de qué equipo es cada etapa y qué se hace en ella. */

import { SupportEtapasView } from '@/features/support/components/flujo/SupportEtapasView';
import type { SupportEtapasProps } from '@/features/support/types';

export default function SupportEtapas(props: SupportEtapasProps) {
  return <SupportEtapasView {...props} />;
}
