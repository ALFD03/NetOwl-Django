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
import { ChevronRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { useAuth } from '@/shared/auth/AuthContext';
import { resolveLocation } from '@/shared/constants/navigation';
import { AnalysisQueueAlert } from './AnalysisQueueAlert';
import { MobileNavDrawer, MobileTopBar, Sidebar } from './Sidebar';

interface Props {
  children: React.ReactNode;
  /**
   * Encabezado de las pantallas que no están en el registro de navegación (la
   * gestión de usuarios). En un módulo no se usa: el encabezado es la ruta
   * «Módulo › Página», sacada de la URL.
   */
  title?: string;
  /**
   * Tercer tramo de la ruta, para una subruta que cuelga de una página del
   * registro (el maestro de planes, dentro de Reporte ETA).
   */
  subpage?: string;
  /**
   * Filtros (periodo, dimension, dias). Van aqui y no dentro de `children`
   * porque esta zona queda fija arriba (desde `lg`): al bajar por la pantalla
   * se siguen teniendo a mano la dimension y el periodo.
   */
  toolbar?: React.ReactNode;
}

/** Clave del sidebar plegado. Por navegador: es una comodidad, no un ajuste de la cuenta. */
const COLLAPSED_KEY = 'netowl-sidebar-plegado';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppLayout({ children, title, subpage, toolbar }: Props) {
  const { pathname, search } = useLocation();
  const url = pathname + search;
  const username = useAuth().user?.username ?? '';

  // Cada página monta su propio AppLayout: leerlo en el inicializador evita un
  // parpadeo del sidebar ancho.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const newItem = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, newItem ? '1' : '0');
      } catch {
        // Sin almacenamiento (modo privado) el sidebar se pliega igual, solo que no se recuerda.
      }
      return newItem;
    });
  };

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // La ruta de migas sale de la URL, igual que la página marcada en el
  // sidebar: las páginas no declaran dónde están.
  const location = resolveLocation(url);
  const ModuleIcon = location?.item.icon;

  return (
    // El scroll vive en <main>, no en la ventana: es lo que convierte a la
    // barra superior en un `sticky` real y mantiene el sidebar completo.
    // `h-dvh` y no `h-screen`: en el móvil `100vh` incluye la barra de
    // direcciones del navegador y el final de la página quedaba debajo.
    <div className="flex h-dvh overflow-hidden bg-surface-primary text-slate-100">
      <Sidebar url={url} username={username} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <MobileNavDrawer open={menuOpen} onClose={closeMenu} url={url} username={username} />

      {/* `min-w-0`: sin él, una tabla ancha estira <main> más allá de la
          pantalla en vez de hacer scroll dentro de su propio contenedor. */}
      <main data-app-scroll className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <MobileTopBar onOpenMenu={() => setMenuOpen(true)} />

        {(title || toolbar || location) && (
          <div className="bg-surface-primary/95 px-4 pb-4 pt-4 sm:px-6 lg:sticky lg:top-0 lg:z-30 lg:px-8 lg:pt-6 lg:shadow-lg lg:shadow-surface-primary/50 lg:backdrop-blur">
            {/* Si la barra crece demasiado (filtros + barra de dias) hace
                scroll interno en vez de comerse la pantalla. Solo cuando es
                fija: suelta, crece con la pagina como todo lo demas. */}
            <div className="flex flex-col gap-4 lg:max-h-[55vh] lg:overflow-y-auto [&>*]:mb-0">
              {location && ModuleIcon ? (
                <nav
                  aria-label="Ubicación"
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-bold tracking-tight sm:text-xl"
                >
                  <ModuleIcon className="h-5 w-5 shrink-0 text-brand" />
                  <span className="text-slate-400">{location.item.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
                  {subpage ? (
                    <>
                      <span className="text-slate-400">{location.page.label}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
                      <span aria-current="page" className="text-white">{subpage}</span>
                    </>
                  ) : (
                    <span aria-current="page" className="text-white">{location.page.label}</span>
                  )}
                </nav>
              ) : (
                title && <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
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
