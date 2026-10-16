/**
 * Página Inertia `Comisiones/Supervisores` (`/comisiones/supervisores/`).
 *
 * A qué coordinador de unidad de negocio responde cada supervisor.
 */

import { SupervisoresView, type ComisionesSupervisoresProps } from '@/features/comisiones';

export default function ComisionesSupervisores(props: ComisionesSupervisoresProps) {
  return <SupervisoresView {...props} />;
}
