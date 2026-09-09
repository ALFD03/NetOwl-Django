import { useCallback, useEffect, useRef, useState } from 'react';

import { jobsApi, type AnalysisJob } from '@/shared/lib/api/jobs';

/** Cadencia de sondeo: rápida mientras algo corre, lenta cuando no hay nada. */
const INTERVALO_ACTIVO_MS = 4000;
const INTERVALO_INACTIVO_MS = 20000;
/** Cuánto se deja a la vista el desenlace de un análisis que acaba de terminar. */
const AVISO_FINAL_MS = 10000;

export interface JobQueueState {
  /** En ejecución primero, después los que esperan turno. */
  jobs: AnalysisJob[];
  running: number;
  queued: number;
  /** Último análisis terminado, para avisar del desenlace y desaparecer. */
  finished: AnalysisJob | null;
  dismissFinished: () => void;
}

/**
 * Sigue lo que el worker está calculando y lo que espera en la cola.
 *
 * Los análisis duran minutos y siguen corriendo aunque se cambie de página, así
 * que el estado no puede vivir en la pantalla que los lanzó: este hook lo
 * consulta desde cualquier sitio y alimenta el aviso flotante.
 *
 * Detecta también el final: cuando un id que veníamos siguiendo desaparece de
 * la cola, se pide su ficha una vez para saber si terminó bien o mal. Sin eso
 * el aviso solo podría decir que "ya no está", que no es lo que interesa saber.
 */
export function useJobQueue(): JobQueueState {
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [running, setRunning] = useState(0);
  const [queued, setQueued] = useState(0);
  const [finished, setFinished] = useState<AnalysisJob | null>(null);

  // Ids vistos en el sondeo anterior: la diferencia con los actuales es lo que
  // acaba de terminar.
  const previosRef = useRef<string[]>([]);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissFinished = useCallback(() => setFinished(null), []);

  useEffect(() => {
    let vivo = true;

    const sondear = async () => {
      // Con la pestaña en segundo plano no hay nadie mirando el aviso: se
      // reintenta al volver en vez de seguir pidiendo.
      if (typeof document !== 'undefined' && document.hidden) {
        programar(INTERVALO_INACTIVO_MS);
        return;
      }

      try {
        const cola = await jobsApi.queue();
        if (!vivo) return;

        setJobs(cola.jobs);
        setRunning(cola.en_ejecucion);
        setQueued(cola.en_cola);

        const actuales = cola.jobs.map((job) => job.id);
        const desaparecidos = previosRef.current.filter((id) => !actuales.includes(id));
        previosRef.current = actuales;

        if (desaparecidos.length > 0) {
          const terminado = await jobsApi.fetch(desaparecidos[0]).catch(() => null);
          if (vivo && terminado) {
            setFinished(terminado);
            setTimeout(() => vivo && setFinished(null), AVISO_FINAL_MS);
          }
        }

        programar(cola.jobs.length > 0 ? INTERVALO_ACTIVO_MS : INTERVALO_INACTIVO_MS);
      } catch {
        // Un fallo de red o un despliegue en curso no deben dejar el aviso
        // sondeando en bucle: se espera el intervalo largo y se reintenta.
        if (vivo) programar(INTERVALO_INACTIVO_MS);
      }
    };

    const programar = (ms: number) => {
      if (!vivo) return;
      temporizadorRef.current = setTimeout(sondear, ms);
    };

    void sondear();

    return () => {
      vivo = false;
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    };
  }, []);

  return { jobs, running, queued, finished, dismissFinished };
}
