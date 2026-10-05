/**
 * El armazón de toda página: navegación, barra superior y contenido.
 *
 * Cambia de forma en `lg` (ver `shared/constants/breakpoints.ts`):
 *
 * - Desde `lg`: sidebar fijo (plegable) y la barra de filtros pegada arriba.
 * - Por debajo: el menú pasa a un cajón detrás de una hamburguesa, y la barra
 *   de filtros deja de ser pegajosa — en un teléfono, filtros más barra de días
 *   fijos dejarían libre un tercio de la pantalla.
 *
 * Monta también el aviso flotante de la cola de análisis, que por eso sigue
 * visible al cambiar de pantalla.
 */

import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { usePage } from '@inertiajs/react';

import type { AuthenticatedPageProps } from '@/shared/types/inertia';
import { AnalysisQueueAlert } from './AnalysisQueueAlert';
import { MobileNavDrawer, MobileTopBar, Sidebar } from './Sidebar';

interface Props {
  children: React.ReactNode;
  title?: string;
  /**
   * Navegacion del modulo y filtros (periodo, dimension, dias). Va aqui y no
   * dentro de `children` porque esta zona queda fija arriba (desde `lg`): al
   * bajar por la pantalla se sigue teniendo a mano el cambio de pagina,
   * dimension y periodo.
   */
  toolbar?: React.ReactNode;
}

/** Clave del sidebar plegado. Por navegador: es una comodidad, no un ajuste de la cuenta. */
const CLAVE_PLEGADO = 'netowl-sidebar-plegado';

function leerPlegado(): boolean {
  try {
    return localStorage.getItem(CLAVE_PLEGADO) === '1';
  } catch {
    return false;
  }
}

export function AppLayout({ children, title, toolbar }: Props) {
  const { url, props } = usePage<AuthenticatedPageProps>();
  const username = props.auth.user.username;

  // Cada página monta su propio AppLayout, así que el estado se relee al
  // navegar; leerlo en el inicializador evita un parpadeo del sidebar ancho.
  const [plegado, setPlegado] = useState(leerPlegado);
  const [menuAbierto, setMenuAbierto] = useState(false);

  const alternarPlegado = () => {
    setPlegado((previo) => {
      const nuevo = !previo;
      try {
        localStorage.setItem(CLAVE_PLEGADO, nuevo ? '1' : '0');
      } catch {
        // Sin almacenamiento (modo privado) el sidebar se pliega igual, solo que no se recuerda.
      }
      return nuevo;
    });
  };

  const cerrarMenu = useCallback(() => setMenuAbierto(false), []);

  return (
    // El scroll vive en <main>, no en la ventana: es lo que convierte a la
    // barra superior en un `sticky` real y mantiene el sidebar completo.
    // `h-dvh` y no `h-screen`: en el móvil `100vh` incluye la barra de
    // direcciones del navegador y el final de la página quedaba debajo.
    <div className="flex h-dvh overflow-hidden bg-surface-primary text-slate-100">
      <Sidebar url={url} username={username} collapsed={plegado} onToggleCollapsed={alternarPlegado} />
      <MobileNavDrawer open={menuAbierto} onClose={cerrarMenu} url={url} username={username} />

      {/* `min-w-0`: sin él, una tabla ancha estira <main> más allá de la
          pantalla en vez de hacer scroll dentro de su propio contenedor. */}
      <main data-app-scroll className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <MobileTopBar onOpenMenu={() => setMenuAbierto(true)} />

        {(title || toolbar) && (
          <div className="bg-surface-primary/95 px-4 pb-4 pt-4 sm:px-6 lg:sticky lg:top-0 lg:z-30 lg:px-8 lg:pt-6 lg:shadow-lg lg:shadow-surface-primary/50 lg:backdrop-blur">
            {/* Si la barra crece demasiado (filtros + barra de dias) hace
                scroll interno en vez de comerse la pantalla. Solo cuando es
                fija: suelta, crece con la pagina como todo lo demas. */}
            <div className="flex flex-col gap-4 lg:max-h-[55vh] lg:overflow-y-auto [&>*]:mb-0">
              {title && (
                <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
              )}
              {toolbar}
            </div>
          </div>
        )}

        <motion.div
          className="px-4 pb-24 pt-4 sm:px-6 sm:pb-8 lg:px-8 lg:pt-6"
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
