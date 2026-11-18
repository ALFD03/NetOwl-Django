/** La última tasa publicada por el BCV, al lado de la del mes que se declara. */

import { useCallback, useEffect, useState } from 'react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';

export interface CurrentBcvRate {
  /** `0` mientras no se haya podido leer. */
  rate: number;
  /** El día que la publicó, tal como lo devuelve el servicio. */
  fuente: string;
  cargando: boolean;
  /** Por qué no hay cifra. Se enseña, no rompe la página. */
  aviso: string;
  /** Vuelve a preguntar. La tasa de hoy sí cambia dentro del día. */
  recargar: () => Promise<void>;
}

/**
 * Se consulta una vez al abrir el reporte, no una vez por periodo.
 *
 * La tasa vigente no depende del mes que se esté mirando —es la de hoy—, así
 * que atarla al selector de periodo solo produciría una llamada al tercero por
 * cada mes que alguien hojee. Cambiar de mes no la invalida; el botón está
 * para el caso en que la página lleve horas abierta.
 *
 * El fallo se guarda como aviso en vez de propagarse, igual que el de la tasa
 * del mes: el servicio de tasas es un tercero, y que esté caído no puede dejar
 * sin reporte a quien solo venía a leerlo.
 */
export function useCurrentBcvRate(): CurrentBcvRate {
  const [tasa, setRate] = useState(0);
  const [fuente, setSource] = useState('');
  const [aviso, setNotice] = useState('');
  // Arranca cargando: la primera consulta sale en cuanto se monta el hook, y
  // así el efecto no tiene que anunciarlo con un `setState` de más.
  const [cargando, setCargando] = useState(true);

  // Con `.then` y no con `await`: el linter no distingue un `setState` que
  // sigue a un `await` de uno síncrono, y esta función se llama desde el efecto.
  const fetchData = useCallback(
    () =>
      subscriptionsApi.getEtaTasaActual()
        .then((response) => {
          setRate(response.bcv_rate);
          setSource(response.bcv_rate_source);
          setNotice('');
        })
        .catch((error: unknown) => {
          setNotice(getApiErrorMessage(error, 'No se pudo consultar la tasa vigente del BCV.'));
        })
        .finally(() => setCargando(false)),
    [],
  );

  const recargar = useCallback(async () => {
    setCargando(true);
    await fetchData();
  }, [fetchData]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  return { rate: tasa, fuente, cargando, aviso, recargar };
}
