import { useMemo } from 'react';
import { calcularProyeccion } from '@/shared/lib/proyeccion';
import type { DayMetrics } from '@/shared/types/domain';

const daysInMonth = (periodoMes: string): number => {
  const match = periodoMes.match(/^(\d{4})-(\d{2})/);
  if (!match) return 31;
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
};

/**
 * Resuelve la barra de dias a partir del mes precalculado que llega en props.
 *
 * Todo el mes viaja en un solo payload, asi que cambiar de dia no dispara
 * ningun recalculo: es una lectura en memoria.
 */
export function useDayMetrics(dayMetrics: DayMetrics | undefined, selectedDay: number) {
  const availableDays = useMemo(
    () =>
      Object.keys(dayMetrics?.dias ?? {})
        .map(Number)
        .filter((day) => Number.isFinite(day))
        .sort((a, b) => a - b),
    [dayMetrics],
  );

  const totalDays = useMemo(
    () => daysInMonth(dayMetrics?.periodo_mes ?? ''),
    [dayMetrics],
  );

  // Sin dia elegido, el ultimo calculado (el corte mas reciente del mes).
  const effectiveDay = useMemo(
    () =>
      availableDays.includes(selectedDay)
        ? selectedDay
        : (availableDays[availableDays.length - 1] ?? 0),
    [availableDays, selectedDay],
  );

  const dayData = useMemo(
    () => (effectiveDay ? dayMetrics?.dias?.[String(effectiveDay)] : undefined),
    [dayMetrics, effectiveDay],
  );

  // Los días laborables del corte, de los que sale la proyección al cierre. Sin
  // un día calculado se cae al cierre del mes y no hay corte que proyectar.
  const proyeccion = useMemo(
    () => (dayData ? calcularProyeccion(dayMetrics?.periodo_mes, effectiveDay) : null),
    [dayData, dayMetrics, effectiveDay],
  );

  return { availableDays, totalDays, effectiveDay, dayData, proyeccion };
}
