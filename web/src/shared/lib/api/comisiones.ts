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

  guardarPeriodo: async (body: { periodo: string; inicio_promo: string; inicio?: string }) =>
    (await apiClient.post<Respuesta>('/comisiones/api/periodo/guardar/', body)).data,

  cerrar: async (periodo: string) =>
    (await apiClient.post<Respuesta>('/comisiones/api/periodo/cerrar/', { periodo })).data,

  reabrir: async (periodo: string) =>
    (await apiClient.post<Respuesta>('/comisiones/api/periodo/reabrir/', { periodo })).data,

  /**
   * Decide una o varias ventas de una vez. `decision` vacía deshace la
   * decisión y las ventas vuelven a Revisión.
   */
  guardarRevision: async (body: {
    periodo: string; ordenes: string[]; decision: '' | 'contar' | 'diferir'; periodo_destino?: string; nota?: string;
  }) => (await apiClient.post<Respuesta>('/comisiones/api/revision/guardar/', body)).data,

  /** Solo se manda el campo que cambia; vacío lo borra. */
  guardarIndicador: async (body: {
    periodo: string; persona_id: number; cumplimiento_pct?: number | null; crecimiento_pct?: number | null;
  }) => (await apiClient.post<Respuesta>('/comisiones/api/indicador/guardar/', body)).data,

  guardarJerarquia: async (persona_id: number, superior_id: number | null) =>
    (await apiClient.post<Respuesta>('/comisiones/api/jerarquia/guardar/', { persona_id, superior_id })).data,

  guardarCondiciones: async (body: Record<string, unknown>) =>
    (await apiClient.post<Respuesta>('/comisiones/api/condiciones/guardar/', body)).data,
};
