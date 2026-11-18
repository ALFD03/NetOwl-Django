/**
 * Página `/comisiones/condiciones/`.
 *
 * Tramos, tarifas, días promocionales y los % de los planes PYME.
 */

import { ConditionsView, type CommissionsConditionsProps } from '@/features/commissions';

export default function CommissionsConditions(props: CommissionsConditionsProps) {
  return <ConditionsView {...props} />;
}
