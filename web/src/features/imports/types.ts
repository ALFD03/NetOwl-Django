/** Tipos del feature de importaciones. */

export type ImportKind = 'subscriptions' | 'logs' | 'crm' | 'support';

export interface ImportOperationResult {
  message: string;
  log_output?: string;
  periodo_label?: string;
  /** Dias calculados por el runner de metricas diarias. */
  dias_calculados?: number;
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
export interface CampoOdoo {
  nombre: string;
  /** Se valida antes de cargar; sin ella el fichero se rechaza. */
  requerido: boolean;
  /** Otras formas en que Odoo escribe la misma columna y que también se aceptan. */
  alias?: string[];
}

/** Los campos de un tipo de export, para listarlos junto a sus requisitos. */
export interface GrupoCamposOdoo {
  key: string;
  label: string;
  campos: CampoOdoo[];
}
