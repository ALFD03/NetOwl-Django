export type ImportKind = 'subscriptions' | 'logs' | 'crm' | 'support';

export interface ImportOperationResult {
  message: string;
  log_output?: string;
  periodo_label?: string;
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
