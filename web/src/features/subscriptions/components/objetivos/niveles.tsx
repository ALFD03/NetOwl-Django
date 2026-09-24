/**
 * Cómo se presenta cada nivel de objetivo: nombre, icono, tono y qué alcanza.
 *
 * Lo comparten la pestaña de objetivos del catálogo y los reportes (la insignia
 * de objetivo de cada nodo y el formulario rápido), para que un nivel se vea
 * igual en todas partes.
 */

import type { ReactNode } from 'react';
import { Building2, Globe2, MapPin, Network, Store, UserCheck, Waypoints } from 'lucide-react';

import type { FormTone } from '@/features/subscriptions/components/FormControls';
import type { NivelObjetivoCatalogo } from '@/features/subscriptions/types';

export interface NivelObjetivoUi {
  label: string;
  /** Nombre corto para la insignia de un nodo. */
  corto: string;
  icon: ReactNode;
  tone: FormTone;
  /** Clases de la insignia: texto, fondo y borde en el tono del nivel. */
  chip: string;
  description: string;
}

/** Tailwind no ve clases interpoladas: cada tono de insignia va escrito entero. */
export const NIVEL_OBJETIVO_UI: Record<NivelObjetivoCatalogo, NivelObjetivoUi> = {
  general: {
    label: 'General',
    corto: 'general',
    icon: <Globe2 />,
    tone: 'slate',
    chip: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
    description: 'Lo que rige cuando nadie más fija un objetivo.',
  },
  sucursal: {
    label: 'Sucursal',
    corto: 'sucursal',
    icon: <Store />,
    tone: 'purple',
    chip: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300',
    description: 'Manda sobre todos sus nodos, por encima de estados, sites, coordinadores y zonas.',
  },
  estado: {
    label: 'Estado',
    corto: 'estado',
    icon: <MapPin />,
    tone: 'purple',
    chip: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
    description: 'Manda sobre todos sus sites, coordinadores y zonas.',
  },
  site: {
    label: 'Site',
    corto: 'site',
    icon: <Building2 />,
    tone: 'blue',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    description: 'Manda sobre sus zonas, también en el total de sus coordinadores.',
  },
  coordinador: {
    label: 'Coordinador',
    corto: 'coord.',
    icon: <UserCheck />,
    tone: 'emerald',
    chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    description: 'Manda sobre sus zonas y su total en Business Units. No mueve el total del site.',
  },
  zona: {
    label: 'Zona',
    corto: 'zona',
    icon: <Network />,
    tone: 'amber',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    description: 'Todas sus sucursales. Solo rige si nada por encima fija un objetivo.',
  },
  zona_sucursal: {
    label: 'Zona - sucursal',
    corto: 'nodo',
    icon: <Waypoints />,
    tone: 'sky',
    chip: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
    description: 'Un solo nodo (p. ej. Guacara - NYC). Solo rige si nada por encima fija un objetivo.',
  },
};

/** Los niveles de más alto a más bajo, sin el general. */
export const NIVELES_ENTIDAD: NivelObjetivoCatalogo[] = [
  'sucursal', 'estado', 'site', 'coordinador', 'zona', 'zona_sucursal',
];
