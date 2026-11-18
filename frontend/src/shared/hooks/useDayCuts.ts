import { useCallback, useMemo, useState } from 'react';
import type { DayCuts } from '@/shared/types/domain';

const daysInMonth = (periodoMes: string): number => {
  const match = periodoMes.match(/^(\d{4})-(\d{2})/);
  if (!match) return 31;
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
};

/**
 * Deja `?dia=` escrito en la barra de direcciones sin provocar una visita.
 *
 * El día ya no es un viaje al servidor —`useDayPayload` lo resuelve de su caché—,
 * pero la URL tiene que seguir describiendo lo que se está viendo: recargar o
 * compartir el enlace debe caer en el mismo día. `replaceState` hace justo eso y
 * nada más; pedirlo con la página volvería a calcularla entera.
 */
function writeToUrl(dia: number): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('dia', String(dia));
  window.history.replaceState(window.history.state, '', url.toString());
}

/**
 * La barra de días de CRM y Soporte: qué días hay y cuál se está mirando.
 *
 * El día vive aquí, en el cliente. Moverlo no pide nada: las tarjetas y las
 * líneas de tendencia salen de la serie ligera que ya viajó en los props
 * (`dayMetrics.serie`), y el desglose dimensional lo sirve `useDayPayload` desde
 * su caché. Suscripciones no usa este hook porque recibe el mes entero y le
 * basta `useDayMetrics`.
 */
export function useDayCuts(dayMetrics: DayCuts | undefined) {
  const availableDays = useMemo(
    () => (dayMetrics?.dias_disponibles ?? []).filter((day) => Number.isFinite(day)),
    [dayMetrics],
  );

  const totalDays = useMemo(
    () => daysInMonth(dayMetrics?.periodo_mes ?? ''),
    [dayMetrics],
  );

  // El servidor ya resolvió a qué día cayó: sin `?dia=`, al último calculado.
  const serverDay = dayMetrics?.dia ?? 0;
  const [selectedDay, setSelectedDay] = useState(serverDay);
  const [visto, setVisto] = useState(serverDay);

  // Ajuste en render, no en efecto: al cambiar de mes —que sí es una visita— la
  // barra vuelve a lo que diga el servidor.
  if (serverDay !== visto) {
    setVisto(serverDay);
    setSelectedDay(serverDay);
  }

  const selectDay = useCallback((dia: number) => {
    setSelectedDay(dia);
    writeToUrl(dia);
  }, []);

  return { availableDays, totalDays, selectedDay, selectDay };
}
