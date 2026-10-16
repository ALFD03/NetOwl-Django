/**
 * Página Inertia `Comisiones/Informe` (`/comisiones/`).
 *
 * Lo que cobra cada persona de ventas en un periodo, con su revisión y su cierre.
 */

import { InformeView, type ComisionesInformeProps } from '@/features/comisiones';

export default function ComisionesInforme(props: ComisionesInformeProps) {
  return <InformeView {...props} />;
}
