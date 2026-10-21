/** Cliente del módulo de Comisiones. */

import { apiClient } from './client';

/** Lo que responden las escrituras del módulo. */
interface Respuesta {
  status: string;
  message: string;
}

export const comisionesApi = {
  /** El detalle venta a venta de un periodo: no viaja en los props por su tamaño. */
  ventas: async <T>(periodo: string) =>
    (await apiClient.get<{ ventas: T[] }>('/comisiones/api/ventas/', { params: { periodo } })).data.ventas,

  guardarPeriodo: async (body: { periodo: string; inicio_promo: string; inicio?: string; corte_adelantos?: string }) =>
    (await apiClient.post<Respuesta>('/comisiones/api/periodo/guardar/', body)).data,

  cerrar: async (periodo: string) =>
    (await apiClient.post<Respuesta>('/comisiones/api/periodo/cerrar/', { periodo })).data,

  reabrir: async (periodo: string) =>
    (await apiClient.post<Respuesta>('/comisiones/api/periodo/reabrir/', { periodo })).data,

  /**
   * Decide una o varias ventas de una vez. `decision` vacía deshace la
   * decisión y las ventas vuelven a Revisión. `ya_pagada` y `normal` solo
   * en el primer periodo, para los días promocionales del mes anterior.
   */
  guardarRevision: async (body: {
    periodo: string; ordenes: string[]; decision: '' | 'contar' | 'no_contar' | 'ya_pagada' | 'normal'; nota?: string;
  }) => (await apiClient.post<Respuesta>('/comisiones/api/revision/guardar/', body)).data,

  /** Agrega ventas a mano al periodo: cuentan en él. La nota es obligatoria. */
  agregarManual: async (body: { periodo: string; ordenes: string[]; nota: string }) =>
    (await apiClient.post<Respuesta>('/comisiones/api/manual/agregar/', body)).data,

  quitarManual: async (periodo: string, orden: string) =>
    (await apiClient.post<Respuesta>('/comisiones/api/manual/quitar/', { periodo, orden })).data,

  /** Solo se manda el campo que cambia; vacío lo borra. */
  guardarIndicador: async (body: {
    periodo: string; persona_id: number; cumplimiento_pct?: number | null; crecimiento_pct?: number | null;
  }) => (await apiClient.post<Respuesta>('/comisiones/api/indicador/guardar/', body)).data,

  /** La tasa oficial del BCV de hoy: una referencia, no la de pago. */
  tasaActual: async () =>
    (await apiClient.get<{ tasa: number; fuente: string }>('/comisiones/api/tasa-actual/')).data,

  /** El cumplimiento de todos los supervisores y coordinadores de oficina sin uno propio; `null` lo borra. */
  guardarCumplimientoGeneral: async (periodo: string, cumplimiento_pct: number | null) =>
    (await apiClient.post<Respuesta>('/comisiones/api/cumplimiento-general/', { periodo, cumplimiento_pct })).data,

  /** El coordinador de UN de uno o varios supervisores; `null` se lo quita. */
  asignarUnidad: async (supervisor_ids: number[], coord_un_id: number | null) =>
    (await apiClient.post<Respuesta>('/comisiones/api/supervisores/unidad/', { supervisor_ids, coord_un_id })).data,

  guardarCondiciones: async (body: Record<string, unknown>) =>
    (await apiClient.post<Respuesta>('/comisiones/api/condiciones/guardar/', body)).data,
};
