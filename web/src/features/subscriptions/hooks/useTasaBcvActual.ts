/** La última tasa publicada por el BCV, al lado de la del mes que se declara. */

import { useCallback, useEffect, useState } from 'react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';

export interface TasaBcvActual {
  /** `0` mientras no se haya podido leer. */
  tasa: number;
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
export function useTasaBcvActual(): TasaBcvActual {
  const [tasa, setTasa] = useState(0);
  const [fuente, setFuente] = useState('');
  const [aviso, setAviso] = useState('');
  // Arranca cargando: la primera consulta sale en cuanto se monta el hook, y
  // así el efecto no tiene que anunciarlo con un `setState` de más.
  const [cargando, setCargando] = useState(true);

  const consultar = useCallback(async () => {
    try {
      const respuesta = await subscriptionsApi.getEtaTasaActual();
      setTasa(respuesta.tasa_bcv);
      setFuente(respuesta.tasa_bcv_fuente);
      setAviso('');
    } catch (error) {
      setAviso(getApiErrorMessage(error, 'No se pudo consultar la tasa vigente del BCV.'));
    } finally {
      setCargando(false);
    }
  }, []);

  const recargar = useCallback(async () => {
    setCargando(true);
    await consultar();
  }, [consultar]);

  useEffect(() => { void consultar(); }, [consultar]);

  return { tasa, fuente, cargando, aviso, recargar };
}
