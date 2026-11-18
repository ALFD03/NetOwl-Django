/** Tipos del feature de importaciones. */

export interface ImportOperationResult {
  message: string;
  log_output?: string;
  period_label?: string;
  /** Dias calculados por el runner de metricas diarias. */
  computed_days?: number;
}

/** One row in the import/calculation audit log. */
export interface ImportHistoryItem {
  id: number;
  timestamp: string;
  username: string;
  module_display: string;
  file_name: string;
  rows_processed: number;
  status_display: string;
  status: string;
  message: string;
  details: string;
}

/** Una cabecera del export de Odoo que lee una importación. */
export interface OdooField {
  name: string;
  /** Se valida antes de cargar; sin ella el fichero se rechaza. */
  required: boolean;
  /** Otras formas en que Odoo escribe la misma columna y que también se aceptan. */
  alias?: string[];
}

/** Los campos de un tipo de export, para listarlos junto a sus requisitos. */
export interface OdooFieldGroup {
  key: string;
  label: string;
  fields: OdooField[];
}

/** Los logs de etapa de soporte ya cargados, por mes. */
export interface LoadedLogs {
  logs: number;
  tickets: number;
  since: string | null;
  until: string | null;
  by_month: { month: string; logs: number }[];
}
