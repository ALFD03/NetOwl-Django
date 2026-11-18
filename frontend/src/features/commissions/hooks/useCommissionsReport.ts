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
export function useCommissionsReport(period: string, exists: boolean) {
  const visit = useVisit();
  // Guardadas con su periodo: la página reutiliza el componente al cambiar de
  // mes, y el detalle de otro periodo no vale para este.
  const [cache, setCache] = useState<{ period: string; rows: CommissionSale[] } | null>(null);
  const sales = cache?.period === period ? cache.rows : null;
  const [loadingSales, setLoadingSales] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La tasa de hoy no viaja en los props: es de un tercero y no debe frenar la
  // página. Se pide una vez; si falla, se dice en `fuente`.
  const [todayRate, setTodayRate] = useState<BolivarRate | null>(null);
  useEffect(() => {
    let current = true;
    commissionsApi
      .currentRate()
      .then((r) => current && setTodayRate({ rate: r.rate, source: r.source }))
      .catch((err: unknown) => current && setTodayRate({ rate: null, source: getApiErrorMessage(err, 'No se pudo consultar.') }));
    return () => {
      current = false;
    };
  }, []);

  const loadSales = useCallback(async () => {
    if (!exists || sales || loadingSales) return sales;
    setLoadingSales(true);
    try {
      const rows = await commissionsApi.sales<CommissionSale>(period);
      setCache({ period, rows });
      return rows;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo cargar el detalle de ventas.'));
      return null;
    } finally {
      setLoadingSales(false);
    }
  }, [exists, sales, loadingSales, period]);

  /** Ejecuta una escritura; si sale bien, el informe llega solo y el detalle se vuelve a pedir. */
  const write = async (action: () => Promise<unknown>, message: string) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      setCache(null);
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, message));
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    sales, loadingSales, loadSales,
    todayRate,
    saving, error, setError,
    savePeriod: (body: { period: string; promo_start: string; start?: string; advance_cutoff?: string }) =>
      write(() => commissionsApi.savePeriod(body), 'No se pudo guardar el periodo.'),
    closePeriod: () => write(() => commissionsApi.closePeriod(period), 'No se pudo cerrar el periodo.'),
    reopen: (reason: string, confirmation: string) =>
      write(() => commissionsApi.reopen(period, reason, confirmation), 'No se pudo reabrir el periodo.'),
    /** Tras borrarlo, el periodo ya no existe: se vuelve a la página sin él, no se recarga. */
    deleteDraft: async (confirmation: string) => {
      setSaving(true);
      setError(null);
      try {
        await commissionsApi.deleteDraft(period, confirmation);
        setCache(null);
        visit({}, { remount: true });
        return true;
      } catch (err: unknown) {
        setError(getApiErrorMessage(err, 'No se pudo borrar el informe.'));
        return false;
      } finally {
        setSaving(false);
      }
    },
    decide: (orders: string[], decision: '' | ReviewDecision) =>
      write(
        () => commissionsApi.saveReview({ period, orders, decision }),
        'No se pudo guardar la decisión.',
      ),
    addManual: (orders: string[], note: string) =>
      write(() => commissionsApi.addManual({ period, orders, note }), 'No se pudo agregar la venta.'),
    removeManual: (order: string) =>
      write(() => commissionsApi.removeManual(period, order), 'No se pudo quitar la venta.'),
    saveCompliance: (personId: number, value: number | null) =>
      write(
        () => commissionsApi.saveIndicator({ period, person_id: personId, compliance_pct: value }),
        'No se pudo guardar el cumplimiento.',
      ),
    saveGrowth: (personId: number, value: number | null) =>
      write(
        () => commissionsApi.saveIndicator({ period, person_id: personId, growth_pct: value }),
        'No se pudo guardar el crecimiento.',
      ),
  };
}
