/** Endpoints del módulo de suscripciones: reporte ETA y catálogos. */

import { apiClient } from './client';
import { startAndFollow, type AnalysisJob } from './jobs';
import type {
  BajasDetalleResponse, CatalogoTipo, SubscriptionResultsResponse,
} from '@/shared/types/subscriptions';

export interface EtaReportResponse {
  status?: string;
  periodo?: string;
  [key: string]: unknown;
}

export interface EtaLockRequest { period: string; lock: boolean; }

export interface EtaTasaRequest { period: string; tasa: number; }

export interface EtaTasaResponse {
  status: string;
  tasa_bcv: number;
  tasa_bcv_fuente: string;
  message?: string;
}

export interface EtaSubConfigRequest {
  orden?: string;
  cliente?: string;
  producto?: string;
  tecnologia?: string;
  tipo_persona?: string;
  datas_mbps?: number;
  tiene_tv?: boolean;
  reportar?: boolean;
  es_transporte?: boolean;
  es_dedicado?: boolean;
  /**
   * La renta de este contrato, en divisa.
   *
   * El catálogo comercial no puede darla: cada enlace dedicado negocia la
   * suya, y es el único dato con que se declara su renta básica.
   */
  precio?: number;
}

export interface DeleteEtaSubRequest { orden: string; }

/** Una fila de cualquier catálogo. Sin `id` es un alta. */
export interface CatalogoPayload extends Record<string, unknown> {
  id?: number | null;
}

export const subscriptionsApi = {
  getResultsDetails: async (period: string) =>
    (await apiClient.get<SubscriptionResultsResponse>(`/subscriptions/api/results/${period}/`)).data,

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
  getBajasDetalle: async (period: string, nodos?: string[]) =>
    (await apiClient.get<BajasDetalleResponse>('/subscriptions/api/bajas/detalle/', {
      params: { period, nodo: nodos },
      // Axios serializa un array como `nodo[]=x`; Django lee `nodo=x&nodo=y`.
      paramsSerializer: { indexes: null },
    })).data,

  getEtaReport: async (period: string, force = false) =>
    (await apiClient.get<EtaReportResponse>('/subscriptions/api/eta-report/data/', { params: { period, force } })).data,

  lockEtaReport: async (request: EtaLockRequest) =>
    (await apiClient.post('/subscriptions/api/eta-report/lock/', request)).data,

  /**
   * Fija la tasa del BCV con que se declara la renta básica del periodo.
   *
   * Se guarda por periodo porque la renta se declaró a la tasa de aquel mes.
   * No recalcula nada: los formularios guardan el precio en divisa y la
   * conversión la hace el exportador, así que también vale en un mes bloqueado.
   */
  setEtaTasa: async (request: EtaTasaRequest) =>
    (await apiClient.post<EtaTasaResponse>('/subscriptions/api/eta-report/tasa/', request)).data,

  /**
   * Vuelve a pedirle al BCV la tasa del periodo, pisando la guardada.
   *
   * El reporte ya la consulta solo la primera vez que hace falta; esto es para
   * cuando aquello no bastó — el servicio estaba caído, o alguien escribió una
   * tasa a mano y quiere volver a la oficial.
   */
  consultarEtaTasa: async (period: string) =>
    (await apiClient.post<EtaTasaResponse>('/subscriptions/api/eta-report/tasa/consultar/', { period })).data,

  /**
   * La última tasa publicada por el BCV, la de hoy.
   *
   * No es la del periodo y no se guarda en ninguna parte: la declaración va a
   * la tasa del mes, y esta sirve para exportar el mismo formulario valorado
   * a día de hoy. Por eso es un GET y no pisa nada.
   */
  getEtaTasaActual: async () =>
    (await apiClient.get<EtaTasaResponse>('/subscriptions/api/eta-report/tasa/actual/')).data,

  saveEtaSubConfig: async (request: EtaSubConfigRequest) =>
    (await apiClient.post('/subscriptions/api/eta-report/save-sub-config/', request)).data,

  deleteEtaSubConfig: async (request: DeleteEtaSubRequest) =>
    (await apiClient.post('/subscriptions/api/eta-report/delete-sub-config/', request)).data,

  /**
   * Alta o edición de una fila de catálogo.
   *
   * Un solo endpoint para todos los catálogos: lo que cambia entre ellos son
   * los campos del cuerpo, no la forma de la petición.
   */
  saveCatalogo: async (tipo: CatalogoTipo, payload: CatalogoPayload) =>
    (await apiClient.post('/subscriptions/api/catalogos/guardar/', { tipo, ...payload })).data,

  deleteCatalogo: async (tipo: CatalogoTipo, id: number) =>
    (await apiClient.post('/subscriptions/api/catalogos/eliminar/', { tipo, id })).data,

  /**
   * Runs the survival analysis in the Celery worker and waits for it.
   *
   * It walks the whole subscription history with `lifelines`, so it hit the
   * same request timeout as the monthly analysis and now goes through a job.
   */
  runLifetime: async (onProgress?: (job: AnalysisJob) => void) =>
    startAndFollow('/subscriptions/api/lifecycle/run/', {}, onProgress),
};
