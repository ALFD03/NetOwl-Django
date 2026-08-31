export interface ApiMessageResponse {
  message: string;
  log_output?: string;
  periodo_label?: string;
}

export interface ApiStatusResponse extends ApiMessageResponse {
  status?: string;
}
