/** Página Inertia `Auditoria/Registro` (`/auditoria/`): quién hizo qué, cuándo y desde dónde. */

import { RegistroView } from '@/features/auditoria/components/RegistroView';
import type { AuditoriaRegistroProps } from '@/features/auditoria/types';

export default function AuditoriaRegistro(props: AuditoriaRegistroProps) {
  return <RegistroView {...props} />;
}
