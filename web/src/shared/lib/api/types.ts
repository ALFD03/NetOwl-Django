/** La forma común de las respuestas de los endpoints de Django. */

export interface ApiMessageResponse {
  message: string;
  log_output?: string;
  periodo_label?: string;
  dias_calculados?: number;
}

export interface ApiStatusResponse extends ApiMessageResponse {
  status?: string;
}
