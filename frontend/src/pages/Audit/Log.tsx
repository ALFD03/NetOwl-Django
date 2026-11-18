/** `/auditoria/`: quién hizo qué, cuándo y desde dónde. */

import { LogView } from '@/features/audit/components/LogView';
import type { AuditLogPageProps } from '@/features/audit/types';

export default function AuditLogPage(props: AuditLogPageProps) {
  return <LogView {...props} />;
}
