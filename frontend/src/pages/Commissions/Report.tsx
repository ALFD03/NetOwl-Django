/**
 * Página `/comisiones/`.
 *
 * Lo que cobra cada persona de ventas en un periodo, con su revisión y su cierre.
 */

import { ReportView, type CommissionsReportProps } from '@/features/commissions';

export default function CommissionsReport(props: CommissionsReportProps) {
  return <ReportView {...props} />;
}
