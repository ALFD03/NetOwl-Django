import { useCallback, useEffect, useRef, useState } from 'react';

import { apiClient } from '@/shared/lib/api';

/**
 * Cuánto se espera antes de pedir un día que no está en caché.
 *
 * El slider emite un día por cada uno que cruza: arrastrar de punta a punta del
 * mes serían treinta peticiones de las que sólo importa la última. Lo que ya
 * está cacheado se pinta al instante igualmente — esta espera sólo retrasa la
 * petición, nunca la lectura.
 */
const ESPERA_MS = 180;

/** Cuántos días calculados a cada lado se adelantan cuando la barra se para. */
const VECINOS = 2;

/**
 * Techo de la caché, en días.
 *
 * Un día de CRM o de soporte son cientos de bloques de métricas; guardar el mes
 * entero es justo lo que no cabe en el navegador. Con doce hay de sobra para
 * moverse por una quincena sin volver a pedir nada, y lo más viejo se suelta.
 */
const TOPE_CACHE = 12;

interface Opciones<T> {
  /** Endpoint que devuelve el corte completo de un día. */
  url: string;
  /** Mes en `YYYY-MM`. Cambiarlo vacía la caché: son otros días. */
  period: string;
  dia: number;
  /** Los días con corte, para no adelantar huecos ni salirse del mes. */
  dias: number[];
  /** El corte que ya llegó en los props, para no volver a pedirlo. */
  inicial?: { dia: number; payload: T } | null;
}

interface Resultado<T> {
  /** El corte del día pedido, o el último que se pudo resolver. */
  payload: T | undefined;
  /** `true` mientras el día en pantalla todavía no está resuelto. */
  cargando: boolean;
}

/**
 * La caché lleva su mes dentro.
 *
 * Es lo que deja que una respuesta que llega tarde se descarte sola: si el mes
 * ya cambió, el día que traía no es de esta página.
 */
interface Cache<T> {
  mes: string;
  dias: Map<number, T>;
}

/** La caché con el día nuevo dentro, soltando lo más viejo si se pasa del tope. */
function conDia<T>(cache: Cache<T>, dia: number, valor: T): Cache<T> {
  const dias = new Map(cache.dias);
  // `Map` conserva el orden de inserción: el primero es el menos reciente.
  dias.delete(dia);
  dias.set(dia, valor);
  while (dias.size > TOPE_CACHE) {
    const masViejo = dias.keys().next().value;
    if (masViejo === undefined) break;
    dias.delete(masViejo);
  }
  return { mes: cache.mes, dias };
}

/** Los `VECINOS` días calculados a cada lado del elegido, por orden de cercanía. */
function vecinosDe(dias: number[], dia: number): number[] {
  const idx = dias.indexOf(dia);
  if (idx < 0) return [];
  const salida: number[] = [];
  for (let salto = 1; salto <= VECINOS; salto += 1) {
    if (dias[idx + salto] !== undefined) salida.push(dias[idx + salto]);
    if (dias[idx - salto] !== undefined) salida.push(dias[idx - salto]);
  }
  return salida;
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
 * - la caché tiene techo, porque guardar el mes entero es el problema original.
 *
 * Las tarjetas y las líneas de tendencia no pasan por aquí: salen de la serie
 * ligera que ya viajó en los props, así que ésas son instantáneas siempre.
 */
export function useDayPayload<T>({ url, period, dia, dias, inicial }: Opciones<T>): Resultado<T> {
  const semilla = (): Cache<T> => ({
    mes: period,
    dias: inicial ? new Map([[inicial.dia, inicial.payload]]) : new Map(),
  });

  const [cache, setCache] = useState<Cache<T>>(semilla);
  // El último día que sí se resolvió: es lo que se sigue pintando mientras viaja
  // el siguiente, para no vaciar la página en cada movimiento de la barra.
  const [ultimo, setUltimo] = useState<{ dia: number; payload: T } | null>(
    inicial ? { dia: inicial.dia, payload: inicial.payload } : null,
  );
  // Clave `mes:dia`, para que un cambio de mes no confunda dos peticiones del
  // mismo número de día.
  const enVuelo = useRef(new Set<string>());
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ajustes en render (el patrón de React para reaccionar a un prop nuevo): otro
  // mes son otros días, y lo cacheado deja de valer.
  if (cache.mes !== period) {
    setCache(semilla());
    setUltimo(inicial ? { dia: inicial.dia, payload: inicial.payload } : null);
  }

  const enCache = cache.mes === period ? cache.dias.get(dia) : undefined;
  if (enCache !== undefined && ultimo?.dia !== dia) {
    setUltimo({ dia, payload: enCache });
  }

  const pedir = useCallback(
    async (objetivo: number) => {
      if (!period || !objetivo) return;
      const clave = `${period}:${objetivo}`;
      if (enVuelo.current.has(clave)) return;

      enVuelo.current.add(clave);
      try {
        const { data } = await apiClient.get<T>(url, { params: { period, dia: objetivo } });
        setCache((actual) =>
          // Llegó tarde y el mes ya cambió: ese día no es de esta página.
          actual.mes !== period || actual.dias.has(objetivo)
            ? actual
            : conDia(actual, objetivo, data),
        );
      } catch {
        // Un día que no responde no rompe la página: se queda el último resuelto
        // y el siguiente movimiento vuelve a intentarlo.
      } finally {
        enVuelo.current.delete(clave);
      }
    },
    [period, url],
  );

  useEffect(() => {
    if (enCache !== undefined) return;
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void pedir(dia), ESPERA_MS);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [dia, enCache, pedir]);

  // Adelanto de vecinos: sólo con el día en pantalla ya resuelto, para no
  // competir con la petición que el usuario sí está esperando.
  useEffect(() => {
    if (enCache === undefined) return;
    const id = setTimeout(() => {
      for (const vecino of vecinosDe(dias, dia)) {
        if (!cache.dias.has(vecino)) void pedir(vecino);
      }
    }, ESPERA_MS * 2);
    return () => clearTimeout(id);
  }, [cache, dia, dias, enCache, pedir]);

  return { payload: enCache ?? ultimo?.payload, cargando: enCache === undefined };
}
