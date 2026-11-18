/** Endpoints del módulo de suscripciones: reporte ETA y catálogos. */

import { apiClient } from './client';
import { startAndFollow, type AnalysisJob } from './jobs';
import type {
  ChurnDetailResponse, LifetimeDetailResponse, SubscriptionResultsResponse,
} from '@/shared/types/subscriptions';

export interface EtaReportResponse {
  status?: string;
  period?: string;
  [key: string]: unknown;
}

export interface EtaLockRequest { period: string; lock: boolean; }

export interface EtaRateRequest { period: string; rate: number; }

export interface EtaRateResponse {
  status: string;
  bcv_rate: number;
  bcv_rate_source: string;
  message?: string;
}

export interface EtaSubConfigRequest {
  order?: string;
  client?: string;
  product?: string;
  technology?: string;
  person_type?: string;
  data_mbps?: number;
  has_tv?: boolean;
  report?: boolean;
  is_transport?: boolean;
  is_dedicated?: boolean;
  /**
   * La renta de este contrato, en divisa.
   *
   * El catálogo comercial no puede darla: cada enlace dedicado negocia la
   * suya, y es el único dato con que se declara su renta básica.
   */
  price?: number;
}

export interface DeleteEtaSubRequest { order: string; }

export const subscriptionsApi = {
  getResultsDetails: async (period: string) =>
    (await apiClient.get<SubscriptionResultsResponse>(`/api/subscriptions/results/${period}/`)).data,

  /**
   * Las bajas de un periodo con la ficha de cada cliente.
   *
   * `nodos` (`"Zona - Sucursal"`) acota la exportación a un site, a un
   * coordinador o a un nodo suelto: se mandan los que el grupo ya tiene en
   * pantalla, porque cada reporte agrupa distinto y el backend no repite ese
   * criterio. Va el par completo y no solo la zona, que puede estar repartida
   * entre varias sucursales.
   *
   * No hay variante por día: `analyzer_day_metrics` guarda agregados, no las
   * órdenes que los componen, así que el detalle es siempre el del cierre.
   */
  getChurnsDetail: async (period: string, nodes?: string[]) =>
    (await apiClient.get<ChurnDetailResponse>('/api/subscriptions/churn/detail/', {
      params: { period, node: nodes },
      // Axios serializa un array como `node[]=x`; Django lee `node=x&node=y`.
      paramsSerializer: { indexes: null },
    })).data,

  getEtaReport: async (period: string, force = false) =>
    (await apiClient.get<EtaReportResponse>('/api/subscriptions/eta-report/data/', { params: { period, force } })).data,

  lockEtaReport: async (request: EtaLockRequest) =>
    (await apiClient.post('/api/subscriptions/eta-report/lock/', request)).data,

  /**
   * Fija la tasa del BCV con que se declara la renta básica del periodo.
   *
   * Se guarda por periodo porque la renta se declaró a la tasa de aquel mes.
   * No recalcula nada: los formularios guardan el precio en divisa y la
   * conversión la hace el exportador, así que también vale en un mes bloqueado.
   */
  setEtaRate: async (request: EtaRateRequest) =>
    (await apiClient.post<EtaRateResponse>('/api/subscriptions/eta-report/rate/', request)).data,

  /**
   * Vuelve a pedirle al BCV la tasa del periodo, pisando la guardada.
   *
   * El reporte ya la consulta solo la primera vez que hace falta; esto es para
   * cuando aquello no bastó — el servicio estaba caído, o alguien escribió una
   * tasa a mano y quiere volver a la oficial.
   */
  fetchEtaRate: async (period: string) =>
    (await apiClient.post<EtaRateResponse>('/api/subscriptions/eta-report/rate/fetch/', { period })).data,

  /**
   * La última tasa publicada por el BCV, la de hoy.
   *
   * No es la del periodo y no se guarda en ninguna parte: la declaración va a
   * la tasa del mes, y esta sirve para exportar el mismo formulario valorado
   * a día de hoy. Por eso es un GET y no pisa nada.
   */
  getEtaCurrentRate: async () =>
    (await apiClient.get<EtaRateResponse>('/api/subscriptions/eta-report/rate/current/')).data,

  saveEtaSubConfig: async (request: EtaSubConfigRequest) =>
    (await apiClient.post('/api/subscriptions/eta-report/orders/save/', request)).data,

  deleteEtaSubConfig: async (request: DeleteEtaSubRequest) =>
    (await apiClient.post('/api/subscriptions/eta-report/orders/delete/', request)).data,

  /**
   * Recalcula en el worker el lifetime de todos los meses y espera a que termine.
   *
   * Carga y limpia el log entero como el análisis mensual, así que chocaba con
   * el mismo timeout y va por un job.
   */
  runLifetime: async (onProgress?: (job: AnalysisJob) => void) =>
    startAndFollow('/api/subscriptions/lifetime/run/', {}, onProgress),

  /** Las bajas de un mes con sus duraciones, una por orden, para exportar. */
  getLifetimeDetail: async (period: string) =>
    (await apiClient.get<LifetimeDetailResponse>('/api/subscriptions/lifetime/detail/', {
      params: { period },
    })).data,
};
