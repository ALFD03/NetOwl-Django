/** Tipos del registro de auditoría (`/auditoria/`). */

export type AuditResult = 'ok' | 'rechazado' | 'denegado' | 'limitado' | 'error';

/** Una fila del registro, sin su `detail`. */
export interface AuditEntry {
  id: number;
  date: string;
  username: string;
  ip: string;
  module: string;
  module_label: string;
  action: string;
  action_label: string;
  outcome: AuditResult;
  outcome_label: string;
  status_code: number | null;
  target: string;
  description: string;
}

/** Un registro abierto: con lo enviado, y el antes y el después si los hay. */
export interface AuditEntryDetail extends AuditEntry {
  method: string;
  path: string;
  detail: unknown;
}

export interface AuditFilters {
  since: string;
  until: string;
  module: string;
  user: string;
  outcome: string;
  q: string;
}

export interface AuditLogPageProps {
  logs: AuditEntry[];
  /** Cuántos cumplen los filtros: puede ser más que los `limite` que se envían. */
  total: number;
  limit: number;
  filters: AuditFilters;
  options: {
    modules: { value: string; label: string }[];
    users: string[];
    outcomes: { value: string; label: string }[];
  };
}
