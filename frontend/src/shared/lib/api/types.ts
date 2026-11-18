/** La forma común de las respuestas de los endpoints de Django. */

export interface ApiMessageResponse {
  message: string;
  log_output?: string;
  period_label?: string;
  computed_days?: number;
}
