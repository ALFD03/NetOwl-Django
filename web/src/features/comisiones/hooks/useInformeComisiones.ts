import { useCallback, useState } from 'react';
import { router } from '@inertiajs/react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { comisionesApi } from '@/shared/lib/api/comisiones';
import type { VentaComision } from '../types';

/**
 * Estado del informe de comisiones.
 *
 * El detalle venta a venta no llega en los props (un mes son miles de filas):
 * se pide la primera vez que hace falta —el desglose de una persona, la
 * pestaña de ventas o la exportación— y se guarda mientras la página viva.
 *
 * Tras cada escritura se recarga la página: el informe de un borrador se
 * recalcula en el servidor y cualquier decisión mueve los totales.
 */
export function useInformeComisiones(periodo: string, existe: boolean) {
  // Guardadas con su periodo: Inertia reutiliza el componente al cambiar de
  // mes, y el detalle de otro periodo no vale para este.
  const [cache, setCache] = useState<{ periodo: string; filas: VentaComision[] } | null>(null);
  const ventas = cache?.periodo === periodo ? cache.filas : null;
  const [cargandoVentas, setCargandoVentas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarVentas = useCallback(async () => {
    if (!existe || ventas || cargandoVentas) return ventas;
    setCargandoVentas(true);
    try {
      const filas = await comisionesApi.ventas<VentaComision>(periodo);
      setCache({ periodo, filas });
      return filas;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo cargar el detalle de ventas.'));
      return null;
    } finally {
      setCargandoVentas(false);
    }
  }, [existe, ventas, cargandoVentas, periodo]);

  /** Ejecuta una escritura y recarga el informe si sale bien. */
  const escribir = async (accion: () => Promise<unknown>, mensaje: string) => {
    setGuardando(true);
    setError(null);
    try {
      await accion();
      setCache(null);
      router.reload();
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, mensaje));
      return false;
    } finally {
      setGuardando(false);
    }
  };

  return {
    ventas, cargandoVentas, cargarVentas,
    guardando, error, setError,
    guardarPeriodo: (body: { periodo: string; inicio_promo: string; inicio?: string }) =>
      escribir(() => comisionesApi.guardarPeriodo(body), 'No se pudo guardar el periodo.'),
    cerrar: () => escribir(() => comisionesApi.cerrar(periodo), 'No se pudo cerrar el periodo.'),
    reabrir: () => escribir(() => comisionesApi.reabrir(periodo), 'No se pudo reabrir el periodo.'),
    decidir: (ordenes: string[], decision: '' | 'contar' | 'no_contar') =>
      escribir(
        () => comisionesApi.guardarRevision({ periodo, ordenes, decision }),
        'No se pudo guardar la decisión.',
      ),
    guardarCumplimiento: (persona_id: number, valor: number | null) =>
      escribir(
        () => comisionesApi.guardarIndicador({ periodo, persona_id, cumplimiento_pct: valor }),
        'No se pudo guardar el cumplimiento.',
      ),
    guardarCrecimiento: (persona_id: number, valor: number | null) =>
      escribir(
        () => comisionesApi.guardarIndicador({ periodo, persona_id, crecimiento_pct: valor }),
        'No se pudo guardar el crecimiento.',
      ),
  };
}
