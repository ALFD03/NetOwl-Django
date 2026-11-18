/** Sigue la cola de análisis desde cualquier página. */

import { useCallback, useEffect, useRef, useState } from 'react';

import { notifyDataChanged } from '@/shared/lib/api/client';
import { jobsApi, notifyJobQueued, subscribeToQueuedJobs, type AnalysisJob } from '@/shared/lib/api/jobs';

/** Cadencia de sondeo: rápida mientras algo corre, lenta cuando no hay nada. */
const ACTIVE_INTERVAL_MS = 4000;
const IDLE_INTERVAL_MS = 20000;
/** Cuánto se deja a la vista el desenlace de un análisis que acaba de terminar. */
const FINAL_NOTICE_MS = 10000;

export interface JobQueueState {
  /** En ejecución primero, después los que esperan turno. */
  jobs: AnalysisJob[];
  running: number;
  queued: number;
  /** Último análisis terminado, para avisar del desenlace y desaparecer. */
  finished: AnalysisJob | null;
  dismissFinished: () => void;
  /** Pide detener una ejecución y refresca la cola sin esperar al sondeo. */
  cancel: (id: string) => Promise<void>;
  /** Ids con la cancelación pedida y todavía sin reflejar en la cola. */
  cancelling: string[];
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
  // Entre pedir la cancelación y verla en el sondeo pasa un momento; sin esto el
  // botón volvería a ofrecerse como si no se hubiera pulsado.
  const [cancelling, setCancelling] = useState<string[]>([]);

  // Ids vistos en el sondeo anterior: la diferencia con los actuales es lo que
  // acaba de terminar.
  const previousRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissFinished = useCallback(() => setFinished(null), []);

  const cancel = useCallback(async (id: string) => {
    setCancelling((current) => (current.includes(id) ? current : [...current, id]));
    try {
      await jobsApi.cancel(id);
    } catch {
      // No se pudo: se suelta la marca para que el botón se vuelva a ofrecer.
      setCancelling((current) => current.filter((another) => another !== id));
      return;
    }
    // La fila ya está cerrada: se consulta en el acto en vez de esperar al
    // siguiente sondeo, que es lo que hace que el aviso reaccione al clic.
    notifyJobQueued();
  }, []);

  useEffect(() => {
    let alive = true;

    const poll = async () => {
      // Con la pestaña en segundo plano no hay nadie mirando el aviso: se
      // reintenta al volver en vez de seguir pidiendo.
      if (typeof document !== 'undefined' && document.hidden) {
        schedule(IDLE_INTERVAL_MS);
        return;
      }

      try {
        const snapshot = await jobsApi.queue();
        if (!alive) return;

        setJobs(snapshot.jobs);
        setRunning(snapshot.running);
        setQueued(snapshot.queued);

        const currentJobs = snapshot.jobs.map((job) => job.id);
        setCancelling((marked) => marked.filter((id) => currentJobs.includes(id)));
        const gone = previousRef.current.filter((id) => !currentJobs.includes(id));
        previousRef.current = currentJobs;

        if (gone.length > 0) {
          // Terminó algo, también si lo lanzó otra pestaña u otra persona: hay datos nuevos.
          notifyDataChanged();
          const ended = await jobsApi.fetch(gone[0]).catch(() => null);
          if (alive && ended) {
            setFinished(ended);
            setTimeout(() => alive && setFinished(null), FINAL_NOTICE_MS);
          }
        }

        schedule(snapshot.jobs.length > 0 ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);
      } catch {
        // Un fallo de red o un despliegue en curso no deben dejar el aviso
        // sondeando en bucle: se espera el intervalo largo y se reintenta.
        if (alive) schedule(IDLE_INTERVAL_MS);
      }
    };

    const schedule = (ms: number) => {
      if (!alive) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(poll, ms);
    };

    // Lanzar un analisis no espera al siguiente sondeo: la fila del job ya
    // existe cuando la peticion responde, asi que se consulta en el acto y el
    // aviso aparece a la vez que el trabajo, no hasta veinte segundos despues.
    const unsubscribe = subscribeToQueuedJobs(() => {
      if (!alive) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      void poll();
    });

    void poll();

    return () => {
      alive = false;
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { jobs, running, queued, finished, dismissFinished, cancel, cancelling };
}
