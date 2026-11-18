import { useCallback, useEffect, useState } from 'react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { commissionsApi } from '@/shared/lib/api/commissions';
import type { ReviewDecision, BolivarRate, CommissionSale } from '../types';
import { useVisit } from '@/shared/page/PageData';

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
export function useCommissionsReport(periodo: string, exists: boolean) {
  const visit = useVisit();
  // Guardadas con su periodo: la página reutiliza el componente al cambiar de
  // mes, y el detalle de otro periodo no vale para este.
  const [cache, setCache] = useState<{ period: string; filas: CommissionSale[] } | null>(null);
  const ventas = cache?.period === periodo ? cache.filas : null;
  const [cargandoVentas, setLoadingSales] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La tasa de hoy no viaja en los props: es de un tercero y no debe frenar la
  // página. Se pide una vez; si falla, se dice en `fuente`.
  const [tasaHoy, setTodayRate] = useState<BolivarRate | null>(null);
  useEffect(() => {
    let current = true;
    commissionsApi
      .tasaActual()
      .then((r) => current && setTodayRate({ rate: r.rate, source: r.source }))
      .catch((err: unknown) => current && setTodayRate({ rate: null, source: getApiErrorMessage(err, 'No se pudo consultar.') }));
    return () => {
      current = false;
    };
  }, []);

  const cargarVentas = useCallback(async () => {
    if (!exists || ventas || cargandoVentas) return ventas;
    setLoadingSales(true);
    try {
      const filas = await commissionsApi.ventas<CommissionSale>(periodo);
      setCache({ period: periodo, filas });
      return filas;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo cargar el detalle de ventas.'));
      return null;
    } finally {
      setLoadingSales(false);
    }
  }, [exists, ventas, cargandoVentas, periodo]);

  /** Ejecuta una escritura; si sale bien, el informe llega solo y el detalle se vuelve a pedir. */
  const escribir = async (accion: () => Promise<unknown>, message: string) => {
    setGuardando(true);
    setError(null);
    try {
      await accion();
      setCache(null);
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, message));
      return false;
    } finally {
      setGuardando(false);
    }
  };

  return {
    ventas, cargandoVentas, cargarVentas,
    tasaHoy,
    guardando, error, setError,
    guardarPeriodo: (body: { period: string; promo_start: string; start?: string; advance_cutoff?: string }) =>
      escribir(() => commissionsApi.guardarPeriodo(body), 'No se pudo guardar el periodo.'),
    cerrar: () => escribir(() => commissionsApi.cerrar(periodo), 'No se pudo cerrar el periodo.'),
    reabrir: (motivo: string, confirmacion: string) =>
      escribir(() => commissionsApi.reabrir(periodo, motivo, confirmacion), 'No se pudo reabrir el periodo.'),
    /** Tras borrarlo, el periodo ya no existe: se vuelve a la página sin él, no se recarga. */
    borrar: async (confirmacion: string) => {
      setGuardando(true);
      setError(null);
      try {
        await commissionsApi.borrar(periodo, confirmacion);
        setCache(null);
        visit({}, { remount: true });
        return true;
      } catch (err: unknown) {
        setError(getApiErrorMessage(err, 'No se pudo borrar el informe.'));
        return false;
      } finally {
        setGuardando(false);
      }
    },
    decidir: (ordenes: string[], decision: '' | ReviewDecision) =>
      escribir(
        () => commissionsApi.guardarRevision({ period: periodo, orders: ordenes, decision }),
        'No se pudo guardar la decisión.',
      ),
    agregarManual: (ordenes: string[], nota: string) =>
      escribir(() => commissionsApi.agregarManual({ period: periodo, orders: ordenes, note: nota }), 'No se pudo agregar la venta.'),
    quitarManual: (orden: string) =>
      escribir(() => commissionsApi.quitarManual(periodo, orden), 'No se pudo quitar la venta.'),
    guardarCumplimiento: (personId: number, valor: number | null) =>
      escribir(
        () => commissionsApi.guardarIndicador({ period: periodo, person_id: personId, compliance_pct: valor }),
        'No se pudo guardar el cumplimiento.',
      ),
    guardarCrecimiento: (personId: number, valor: number | null) =>
      escribir(
        () => commissionsApi.guardarIndicador({ period: periodo, person_id: personId, growth_pct: valor }),
        'No se pudo guardar el crecimiento.',
      ),
  };
}
