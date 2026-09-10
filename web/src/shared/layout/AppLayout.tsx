import React from 'react';
import { motion } from 'framer-motion';
import { usePage } from '@inertiajs/react';

import type { AuthenticatedPageProps } from '@/shared/types/inertia';
import { AnalysisQueueAlert } from './AnalysisQueueAlert';
import { Sidebar } from './Sidebar';

interface Props {
  children: React.ReactNode;
  title?: string;
  /**
   * Navegacion del modulo y filtros (periodo, dimension, dias). Va aqui y no
   * dentro de `children` porque esta zona queda fija arriba: al bajar por la
   * pantalla se sigue teniendo a mano el cambio de pagina, dimension y periodo.
   */
  toolbar?: React.ReactNode;
}

export function AppLayout({ children, title, toolbar }: Props) {
  const { url, props } = usePage<AuthenticatedPageProps>();
  const username = props.auth.user.username;

  return (
    // El scroll vive en <main>, no en la ventana: es lo que convierte a la
    // barra superior en un `sticky` real y mantiene el sidebar completo.
    <div className="flex h-screen overflow-hidden bg-surface-primary text-slate-100">
      <Sidebar url={url} username={username} />

      <main data-app-scroll className="flex-1 overflow-y-auto">
        {(title || toolbar) && (
          <div className="sticky top-0 z-30  bg-surface-primary/95 px-8 pb-4 pt-6 shadow-lg shadow-surface-primary/50 backdrop-blur">
            {/* Si la barra crece demasiado (filtros + barra de dias) hace
                scroll interno en vez de comerse la pantalla. */}
            <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto [&>*]:mb-0">
              {title && (
                <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
              )}
              {toolbar}
            </div>
          </div>
        )}

        <motion.div
          className="px-8 pb-8 pt-6"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </main>

      {/* Los analisis corren en el worker y sobreviven al cambio de pagina:
          este aviso los sigue desde cualquier pantalla. No pinta nada cuando
          no hay ninguno. */}
      <AnalysisQueueAlert />
    </div>
  );
}
