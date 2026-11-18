import { useCallback, useEffect, useRef, useState } from 'react';

import { apiClient, onDataChanged } from '@/shared/lib/api';

/**
 * Cuánto se espera antes de pedir un día que no está en caché.
 *
 * El slider emite un día por cada uno que cruza: arrastrar de punta a punta del
 * mes serían treinta peticiones de las que sólo importa la última. Lo que ya
 * está cacheado se pinta al instante igualmente — esta espera sólo retrasa la
 * petición, nunca la lectura.
 */
const DELAY_MS = 180;

/** Cuántos días calculados a cada lado se adelantan cuando la barra se para. */
const NEIGHBORS = 2;

/**
 * Techo de la caché, en días.
 *
 * Un día de CRM o de soporte son cientos de bloques de métricas; guardar el mes
 * entero es justo lo que no cabe en el navegador. Con doce hay de sobra para
 * moverse por una quincena sin volver a pedir nada, y lo más viejo se suelta.
 */
const CACHE_LIMIT = 12;

interface Options<T> {
  /** Endpoint que devuelve el corte completo de un día. */
  url: string;
  /** Mes en `YYYY-MM`. Cambiarlo vacía la caché: son otros días. */
  period: string;
  day: number;
  /** Los días con corte, para no adelantar huecos ni salirse del mes. */
  days: number[];
  /** El corte que ya llegó en los props, para no volver a pedirlo. */
  initial?: { day: number; payload: T } | null;
}

interface Result<T> {
  /** El corte del día pedido, o el último que se pudo resolver. */
  payload: T | undefined;
  /**
   * El día al que pertenece `payload`, que mientras viaja el pedido es el
   * anterior y no `dia`. 0 si todavía no hay ninguno.
   */
  resolvedDay: number;
  /** `true` mientras el día en pantalla todavía no está resuelto. */
  loading: boolean;
}

/**
 * La caché lleva su mes dentro.
 *
 * Es lo que deja que una respuesta que llega tarde se descarte sola: si el mes
 * ya cambió, el día que traía no es de esta página.
 */
interface Cache<T> {
  month: string;
  days: Map<number, T>;
}

/** La caché con el día nuevo dentro, soltando lo más viejo si se pasa del tope. */
function withDay<T>(cache: Cache<T>, day: number, value: T): Cache<T> {
  const days = new Map(cache.days);
  // `Map` conserva el orden de inserción: el primero es el menos reciente.
  days.delete(day);
  days.set(day, value);
  while (days.size > CACHE_LIMIT) {
    const oldest = days.keys().next().value;
    if (oldest === undefined) break;
    days.delete(oldest);
  }
  return { month: cache.month, days };
}

/** Los `VECINOS` días calculados a cada lado del elegido, por orden de cercanía. */
function neighborsOf(available: number[], target: number): number[] {
  const idx = available.indexOf(target);
  if (idx < 0) return [];
  const exit: number[] = [];
  for (let step = 1; step <= NEIGHBORS; step += 1) {
    if (available[idx + step] !== undefined) exit.push(available[idx + step]);
    if (available[idx - step] !== undefined) exit.push(available[idx - step]);
  }
  return exit;
}

/**
 * Sirve el desglose de un día desde una caché en memoria.
 *
 * CRM y Soporte no pueden mandar el mes entero en los props —un solo día ya
 * lleva el bloque de métricas de cada vendedor, zona o grupo de trabajo—, así
 * que el desglose se pide por día. Para que eso no se note al mover la barra:
 *
 * - lo ya visitado se pinta **sin pedir nada**, de la caché;
 * - al quedarse quieto se adelantan los días vecinos, que es hacia donde se
 *   mueve una barra;
 * - mientras un día nuevo viaja se mantiene en pantalla el último resuelto, en
 *   vez de vaciar la página;
 * - la caché tiene techo, porque guardar el mes entero es el problema original;
 * - un cambio en el servidor (un análisis que termina) la vacía y el día en
 *   pantalla se vuelve a pedir.
 *
 * Las tarjetas y las líneas de tendencia no pasan por aquí: salen de la serie
 * ligera que ya viajó en los props, así que ésas son instantáneas siempre.
 */
export function useDayPayload<T>({ url, period, day, days, initial }: Options<T>): Result<T> {
  const seed = (): Cache<T> => ({
    month: period,
    days: initial ? new Map([[initial.day, initial.payload]]) : new Map(),
  });

  const [cache, setCache] = useState<Cache<T>>(seed);
  // El último día que sí se resolvió: es lo que se sigue pintando mientras viaja
  // el siguiente, para no vaciar la página en cada movimiento de la barra.
  const [last, setLast] = useState<{ day: number; payload: T } | null>(
    initial ? { day: initial.day, payload: initial.payload } : null,
  );
  // Clave `mes:dia`, para que un cambio de mes no confunda dos peticiones del
  // mismo número de día.
  const inFlight = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ajustes en render (el patrón de React para reaccionar a un prop nuevo): otro
  // mes son otros días, y lo cacheado deja de valer.
  if (cache.month !== period) {
    setCache(seed());
    setLast(initial ? { day: initial.day, payload: initial.payload } : null);
  }

  const cached = cache.month === period ? cache.days.get(day) : undefined;
  if (cached !== undefined && last?.day !== day) {
    setLast({ day, payload: cached });
  }

  useEffect(() => onDataChanged(() => setCache((current) => ({ month: current.month, days: new Map() }))), []);

  const request = useCallback(
    async (wanted: number) => {
      if (!period || !wanted) return;
      const key = `${period}:${wanted}`;
      if (inFlight.current.has(key)) return;

      inFlight.current.add(key);
      try {
        const { data } = await apiClient.get<T>(url, { params: { period, day: wanted } });
        setCache((current) =>
          // Llegó tarde y el mes ya cambió: ese día no es de esta página.
          current.month !== period || current.days.has(wanted)
            ? current
            : withDay(current, wanted, data),
        );
      } catch {
        // Un día que no responde no rompe la página: se queda el último resuelto
        // y el siguiente movimiento vuelve a intentarlo.
      } finally {
        inFlight.current.delete(key);
      }
    },
    [period, url],
  );

  useEffect(() => {
    if (cached !== undefined) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void request(day), DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [day, cached, request]);

  // Adelanto de vecinos: sólo con el día en pantalla ya resuelto, para no
  // competir con la petición que el usuario sí está esperando.
  useEffect(() => {
    if (cached === undefined) return;
    const id = setTimeout(() => {
      for (const neighbor of neighborsOf(days, day)) {
        if (!cache.days.has(neighbor)) void request(neighbor);
      }
    }, DELAY_MS * 2);
    return () => clearTimeout(id);
  }, [cache, day, days, cached, request]);

  return {
    payload: cached ?? last?.payload,
    resolvedDay: cached !== undefined ? day : (last?.day ?? 0),
    loading: cached === undefined,
  };
}
