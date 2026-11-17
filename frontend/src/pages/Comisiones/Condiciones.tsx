/**
 * Página Inertia `Comisiones/Condiciones` (`/comisiones/condiciones/`).
 *
 * Tramos, tarifas, días promocionales y los % de los planes PYME.
 */

import { CondicionesView, type ComisionesCondicionesProps } from '@/features/comisiones';

export default function ComisionesCondiciones(props: ComisionesCondicionesProps) {
  return <CondicionesView {...props} />;
}
