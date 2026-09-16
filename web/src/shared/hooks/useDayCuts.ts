import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DayCuts } from '@/shared/types/domain';

const daysInMonth = (periodoMes: string): number => {
  const match = periodoMes.match(/^(\d{4})-(\d{2})/);
  if (!match) return 31;
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
};

/**
 * Espera tras soltar el manejador antes de pedir el día al servidor.
 *
 * El slider emite un `onSelect` por cada día calculado que cruza: arrastrar de
 * punta a punta del mes son treinta peticiones de las que sólo importa la
 * última.
 */
const ESPERA_MS = 250;

/**
 * Resuelve la barra de días de un módulo que pide el corte al servidor.
 *
 * CRM y Soporte no reciben el mes entero en los props —el corte de un solo día
 * ya lleva el bloque completo de cada valor dimensional—, así que lo que viaja
 * es la lista de días calculados y cuál se está mirando. Elegir otro es una
 * recarga parcial de Inertia que lee una celda ya calculada: no hay recálculo,
 * pero tampoco hay mes en memoria que reagrupar, que es lo que sí hace
 * `useDayMetrics` en Suscripciones.
 *
 * El día que dibuja la barra es local mientras la petición viaja: sin eso el
 * manejador se quedaría clavado hasta que respondiera el servidor, y el slider
 * volvería a emitir el mismo día una y otra vez.
 */
export function useDayCuts(dayMetrics: DayCuts | undefined, navegar: (dia: number) => void) {
  const availableDays = useMemo(
    () => (dayMetrics?.dias_disponibles ?? []).filter((day) => Number.isFinite(day)),
    [dayMetrics],
  );

  const totalDays = useMemo(
    () => daysInMonth(dayMetrics?.periodo_mes ?? ''),
    [dayMetrics],
  );

  // El servidor ya resolvió a qué día cayó: sin `?dia=`, al último calculado.
  const diaServidor = dayMetrics?.dia ?? 0;
  const [selectedDay, setSelectedDay] = useState(diaServidor);
  const [visto, setVisto] = useState(diaServidor);

  // Ajuste en render, no en efecto: cuando el servidor responde (o se cambia de
  // mes) la barra vuelve a lo que él diga.
  if (diaServidor !== visto) {
    setVisto(diaServidor);
    setSelectedDay(diaServidor);
  }

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  const selectDay = useCallback(
    (dia: number) => {
      setSelectedDay(dia);
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => navegar(dia), ESPERA_MS);
    },
    [navegar],
  );

  return { availableDays, totalDays, selectedDay, selectDay };
}
