import { useCallback, useMemo, useState } from 'react';
import type { DayCuts } from '@/shared/types/domain';

const daysInMonth = (month: string): number => {
  const match = month.match(/^(\d{4})-(\d{2})/);
  if (!match) return 31;
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
};

/**
 * Deja `?day=` escrito en la barra de direcciones sin provocar una visita.
 *
 * El día ya no es un viaje al servidor —`useDayPayload` lo resuelve de su caché—,
 * pero la URL tiene que seguir describiendo lo que se está viendo: recargar o
 * compartir el enlace debe caer en el mismo día. `replaceState` hace justo eso y
 * nada más; pedirlo con la página volvería a calcularla entera.
 */
function writeToUrl(day: number): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('day', String(day));
  window.history.replaceState(window.history.state, '', url.toString());
}

/**
 * La barra de días de CRM y Soporte: qué días hay y cuál se está mirando.
 *
 * El día vive aquí, en el cliente. Moverlo no pide nada: las tarjetas y las
 * líneas de tendencia salen de la serie ligera que ya viajó en los props
 * (`dayMetrics.series`), y el desglose dimensional lo sirve `useDayPayload` desde
 * su caché. Suscripciones no usa este hook porque recibe el mes entero y le
 * basta `useDayMetrics`.
 */
export function useDayCuts(dayMetrics: DayCuts | undefined) {
  const availableDays = useMemo(
    () => (dayMetrics?.available_days ?? []).filter((day) => Number.isFinite(day)),
    [dayMetrics],
  );

  const totalDays = useMemo(
    () => daysInMonth(dayMetrics?.month ?? ''),
    [dayMetrics],
  );

  // El servidor ya resolvió a qué día cayó: sin `?day=`, al último calculado.
  const serverDay = dayMetrics?.day ?? 0;
  const [selectedDay, setSelectedDay] = useState(serverDay);
  const [seen, setSeen] = useState(serverDay);

  // Ajuste en render, no en efecto: al cambiar de mes —que sí es una visita— la
  // barra vuelve a lo que diga el servidor.
  if (serverDay !== seen) {
    setSeen(serverDay);
    setSelectedDay(serverDay);
  }

  const selectDay = useCallback((day: number) => {
    setSelectedDay(day);
    writeToUrl(day);
  }, []);

  return { availableDays, totalDays, selectedDay, selectDay };
}
