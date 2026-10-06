/**
 * La navegación de la app: un árbol de módulos y sus páginas, el único camino
 * entre pantallas (ya no hay pestañas por módulo).
 *
 * Un solo contenido (`SidebarContent`) en dos marcos, según el ancho:
 *
 * - Desde `lg`, `Sidebar`: la columna fija de siempre, que se puede plegar a una
 *   tira de iconos para dar el ancho a los reportes; plegada, cada icono abre
 *   sus páginas en un panel al pasar por encima. El estado se recuerda.
 * - Por debajo, `MobileNavDrawer`: el mismo contenido en un cajón que abre la
 *   hamburguesa de `MobileTopBar`. En un teléfono una columna fija de 256px es
 *   dos tercios de la pantalla.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from '@inertiajs/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Menu, X } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { useScrollLock } from '@/shared/hooks/useScrollLock';
import { groupBySection, resolveLocation, visibleNavigation } from '@/shared/constants/navigation';
import { PERMISSIONS } from '@/shared/constants/permissions';
import type { AppNavigationItem, NavigationPage } from '@/shared/types/navigation';
import { UserMenu } from './UserMenu';

/** Clave de los módulos desplegados. Por navegador, como el sidebar plegado. */
const CLAVE_ABIERTOS = 'netowl-sidebar-abiertos';

function leerAbiertos(): Set<string> {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_ABIERTOS) ?? '[]');
    return new Set(Array.isArray(guardado) ? guardado.filter((m) => typeof m === 'string') : []);
  } catch {
    return new Set();
  }
}

function guardarAbiertos(abiertos: Set<string>) {
  try {
    localStorage.setItem(CLAVE_ABIERTOS, JSON.stringify([...abiertos]));
  } catch {
    // Sin almacenamiento el árbol funciona igual, solo que no se recuerda.
  }
}

interface PaginasProps {
  item: AppNavigationItem;
  activeHref?: string;
  onNavigate?: () => void;
}

/** Las páginas de un módulo, agrupadas por sección. Lo comparten el árbol y el panel flotante. */
function Paginas({ item, activeHref, onNavigate }: PaginasProps) {
  return (
    <>
      {groupBySection(item.pages).map((section) => (
        <div key={section.title ?? ''} className={cn('space-y-0.5', section.title && 'pt-2')}>
          {section.title && (
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {section.title}
            </p>
          )}
          {section.pages.map((page) => (
            <EnlacePagina key={page.id} page={page} active={page.href === activeHref} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </>
  );
}

interface EnlacePaginaProps {
  page: NavigationPage;
  active: boolean;
  onNavigate?: () => void;
}

function EnlacePagina({ page, active, onNavigate }: EnlacePaginaProps) {
  const Icon = page.icon;
  return (
    <Link
      href={page.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-brand text-white shadow-md shadow-brand/20'
          : 'text-slate-400 hover:bg-surface-hover hover:text-white',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{page.label}</span>
    </Link>
  );
}

interface RamaProps extends PaginasProps {
  abierto: boolean;
  active: boolean;
  onToggle: () => void;
}

/** Un módulo en el sidebar ancho: su nombre despliega o recoge sus páginas. */
function Rama({ item, abierto, active, onToggle, activeHref, onNavigate }: RamaProps) {
  const Icon = item.icon;
  const idPaginas = `nav-${item.module}`;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        aria-controls={idPaginas}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
          active ? 'text-white' : 'text-slate-400 hover:bg-surface-hover hover:text-white',
        )}
      >
        <Icon className={cn('h-5 w-5 shrink-0', active && 'text-brand')} />
        <span className="flex-1 truncate text-left">{item.name}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', !abierto && '-rotate-90')} />
      </button>

      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            id={idPaginas}
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="mb-2 ml-5 mt-1 border-l border-slate-800 pl-3">
              <Paginas item={item} activeHref={activeHref} onNavigate={onNavigate} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface IconoModuloProps {
  item: AppNavigationItem;
  active: boolean;
  activeHref?: string;
}

/**
 * Un módulo en el sidebar plegado: el icono, y al pasar por encima (o al
 * llegar con el teclado) un panel con sus páginas.
 *
 * El panel es `fixed` y no `absolute` porque el `<aside>` hace scroll y lo
 * recortaría. Sigue siendo hijo del contenedor en el DOM, así que pasar del
 * icono al panel no cuenta como salir; el `pl-2` del panel cubre el hueco
 * entre los dos para que el puntero no lo cruce en vacío.
 */
function IconoModulo({ item, active, activeHref }: IconoModuloProps) {
  const Icon = item.icon;
  const ref = useRef<HTMLDivElement>(null);
  const cierre = useRef<number | undefined>(undefined);
  const [posicion, setPosicion] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useEffect(() => () => window.clearTimeout(cierre.current), []);

  const abrir = () => {
    window.clearTimeout(cierre.current);
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPosicion({ top: rect.top, left: rect.right, maxHeight: window.innerHeight - rect.top - 8 });
  };
  // Un margen breve: sin él, rozar el borde al ir hacia el panel lo cerraba.
  const cerrar = () => {
    window.clearTimeout(cierre.current);
    cierre.current = window.setTimeout(() => setPosicion(null), 120);
  };

  return (
    <div
      ref={ref}
      onMouseEnter={abrir}
      onMouseLeave={cerrar}
      onFocus={abrir}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) cerrar();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setPosicion(null);
      }}
    >
      <Link
        href={item.pages[0].href}
        aria-label={item.name}
        aria-haspopup="true"
        aria-expanded={posicion !== null}
        className={cn(
          'flex items-center justify-center rounded-lg py-2.5 transition-colors',
          active
            ? 'bg-brand text-white shadow-md shadow-brand/20'
            : 'text-slate-400 hover:bg-surface-hover hover:text-white',
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
      </Link>

      {posicion && (
        <div className="fixed z-50 pl-2" style={{ top: posicion.top, left: posicion.left }}>
          <div
            className="w-56 overflow-y-auto rounded-xl border border-slate-800 bg-surface-secondary p-2 shadow-2xl"
            style={{ maxHeight: posicion.maxHeight }}
          >
            <p className="px-2 pb-2 pt-1 text-xs font-bold uppercase tracking-wider text-slate-300">{item.name}</p>
            <Paginas item={item} activeHref={activeHref} onNavigate={() => setPosicion(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

interface SidebarContentProps {
  url: string;
  username: string;
  /** Solo iconos: el sidebar de escritorio plegado. */
  compact?: boolean;
  /** Se llama al elegir un destino; el cajón lo usa para cerrarse. */
  onNavigate?: () => void;
  /** Pliega o despliega el sidebar. Solo el de escritorio; el cajón no se pliega. */
  onToggleCollapsed?: () => void;
}

function SidebarContent({ url, username, compact = false, onNavigate, onToggleCollapsed }: SidebarContentProps) {
  const { can } = usePermissions();
  const canManageUsers = can(PERMISSIONS.MANAGE_USERS);

  const modulos = visibleNavigation(can);
  const ubicacion = resolveLocation(url);
  const moduloActivo = ubicacion?.item.module;
  const activeHref = ubicacion?.page.href;

  // Cada página monta su propio AppLayout, así que esto se relee al navegar:
  // el módulo de la página actual siempre llega desplegado, aunque se hubiera
  // recogido antes, y los demás quedan como el usuario los dejó.
  const [abiertos, setAbiertos] = useState(() => {
    const iniciales = leerAbiertos();
    if (moduloActivo) iniciales.add(moduloActivo);
    return iniciales;
  });

  const alternar = (modulo: string) => {
    setAbiertos((previos) => {
      const nuevos = new Set(previos);
      if (nuevos.has(modulo)) nuevos.delete(modulo);
      else nuevos.add(modulo);
      guardarAbiertos(nuevos);
      return nuevos;
    });
  };

  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        {/* Imágenes propias del sidebar, recortadas al contenido y reducidas
            con Lanczos (ver `web/static/img/`): los PNG originales son lienzos
            de 1024px con mucho aire transparente, y el búho quedaba diminuto y
            con los bordes dentados al reducirlo el navegador. */}
        <div
          className={cn(
            'mb-6 flex items-center border-b border-slate-800 pb-4',
            compact ? 'justify-center' : 'justify-start',
          )}
        >
          <Link href="/" onClick={onNavigate} className={cn('flex items-center', !compact && 'w-full')}>
            <img
              src={compact ? '/static/img/isotipo_sidebar.png' : '/static/img/logo_sidebar.png'}
              alt="NetOwl"
              className={compact ? 'h-14 w-auto' : 'h-auto w-full'}
            />
          </Link>
        </div>

        <nav className="space-y-1" aria-label="Navegación principal">
          {modulos.map((item) =>
            compact ? (
              <IconoModulo
                key={item.module}
                item={item}
                active={item.module === moduloActivo}
                activeHref={activeHref}
              />
            ) : (
              <Rama
                key={item.module}
                item={item}
                abierto={abiertos.has(item.module)}
                active={item.module === moduloActivo}
                onToggle={() => alternar(item.module)}
                activeHref={activeHref}
                onNavigate={onNavigate}
              />
            ),
          )}
        </nav>
      </div>

      <UserMenu
        username={username}
        canManageUsers={canManageUsers}
        isUsersPageActive={url.startsWith('/auth/users')}
        compact={compact}
        onNavigate={onNavigate}
        onToggleCollapsed={onToggleCollapsed}
      />
    </div>
  );
}

interface SidebarProps {
  url: string;
  username: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/** La columna fija de escritorio. No existe por debajo de `lg`. */
export function Sidebar({ url, username, collapsed, onToggleCollapsed }: SidebarProps) {
  return (
    <aside
      className={cn(
        'relative z-40 hidden h-full shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-surface-secondary p-4 transition-[width] duration-200 lg:flex',
        collapsed ? 'w-20 px-3' : 'w-64',
      )}
    >
      <SidebarContent
        url={url}
        username={username}
        compact={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
    </aside>
  );
}

interface MobileTopBarProps {
  onOpenMenu: () => void;
}

/** Barra superior del teléfono: la hamburguesa y el logo. Desaparece desde `lg`. */
export function MobileTopBar({ onOpenMenu }: MobileTopBarProps) {
  return (
    <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-800 bg-surface-secondary/95 px-3 backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir el menú"
        className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-surface-hover hover:text-white"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Link href="/" className="flex items-center">
        <img src="/static/img/logo_sidebar.png" alt="NetOwl" className="h-8 w-auto" />
      </Link>
    </div>
  );
}

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  url: string;
  username: string;
}

/** El menú en un cajón lateral, para pantallas sin sidebar. */
export function MobileNavDrawer({ open, onClose, url, username }: MobileNavDrawerProps) {
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-slate-800 bg-surface-secondary p-4 shadow-2xl"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar el menú"
              className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 transition-colors hover:bg-surface-hover hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent url={url} username={username} onNavigate={onClose} />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
