/** Comisiones › Estructura jerárquica: a qué equipo pertenece cada persona de ventas. */

import { useState } from 'react';
import { router } from '@inertiajs/react';
import { AlertTriangle, GitFork, Network } from 'lucide-react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { comisionesApi } from '@/shared/lib/api/comisiones';
import { AppLayout } from '@/shared/layout/AppLayout';
import {
  DataTable, EmptyState, NeonContainer, SelectMenu, StatusMessage, ToggleGroup, type Column,
} from '@/shared/ui';
import { CARGO_CORTO } from '../lib/formato';
import type { CargoVentas, ComisionesJerarquiaProps, PersonaJerarquia } from '../types';

const SIN_SUPERIOR = '';
const NIVELES: CargoVentas[] = ['asesor', 'supervisor', 'coord_oficina'];

type Vista = 'arbol' | CargoVentas;

const nombre = (p: PersonaJerarquia) => `${p.nombre} ${p.apellido}`;

/**
 * Quién responde a quién: asesor → supervisor → coordinador de oficina →
 * coordinador de unidad de negocio.
 *
 * **Solo rellena huecos.** El supervisor y el coordinador de oficina de una
 * venta salen de la propia suscripción (`Medio/Supervisor` y `Vendedor`);
 * esto se usa cuando la venta no los trae y, siempre, para el coordinador de
 * UN, que Odoo no tiene. Por eso cambiar a alguien de equipo no reescribe con
 * quién se hicieron sus ventas.
 */
export function JerarquiaView({ personas, cargos, superiorDe }: ComisionesJerarquiaProps) {
  const [vista, setVista] = useState<Vista>('arbol');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const etiquetaCargo = (cargo: CargoVentas) => cargos.find((o) => o.value === cargo)?.label ?? cargo;
  const porCargo = (cargo: CargoVentas) => personas.filter((p) => p.cargo === cargo);
  const hijos = (id: number) => personas.filter((p) => p.superior_id === id);

  const asignar = async (persona: PersonaJerarquia, superior: string) => {
    setGuardando(true);
    setError(null);
    try {
      await comisionesApi.guardarJerarquia(persona.id, superior ? Number(superior) : null);
      router.reload({ only: ['personas'] });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo guardar el superior.'));
    } finally {
      setGuardando(false);
    }
  };

  const columnas = (cargo: CargoVentas): Column<PersonaJerarquia>[] => {
    const cargoSuperior = superiorDe[cargo]!;
    const opciones = [
      { value: SIN_SUPERIOR, label: 'Sin asignar' },
      ...porCargo(cargoSuperior).map((p) => ({ value: String(p.id), label: nombre(p) })),
    ];
    return [
      { header: 'Nombre', accessor: (row) => nombre(row), sortKey: 'nombre', sticky: true },
      { header: 'Medio', accessor: 'medio', sortKey: 'medio' },
      {
        header: `Responde a (${etiquetaCargo(cargoSuperior).toLowerCase()})`,
        accessor: (row) => (
          <SelectMenu
            aria-label="Superior"
            className="w-64"
            searchable
            disabled={guardando}
            value={String(row.superior_id ?? SIN_SUPERIOR)}
            options={opciones}
            onChange={(valor) => void asignar(row, valor)}
          />
        ),
        filterable: true,
        filterValue: (row) => {
          const superior = personas.find((p) => p.id === row.superior_id);
          return superior ? nombre(superior) : 'Sin asignar';
        },
      },
    ];
  };

  /** Una rama del árbol: la persona y, debajo, quienes responden a ella. */
  const rama = (persona: PersonaJerarquia, nivel: number) => (
    <li key={persona.id} className="space-y-1">
      <div className="flex items-baseline gap-2" style={{ paddingLeft: `${nivel * 1.25}rem` }}>
        <span className="text-sm text-white">{nombre(persona)}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{etiquetaCargo(persona.cargo)}</span>
      </div>
      {hijos(persona.id).length > 0 && <ul className="space-y-1">{hijos(persona.id).map((h) => rama(h, nivel + 1))}</ul>}
    </li>
  );

  // Las ramas que cuelgan de alguien que no está arriba del todo y no tiene
  // superior: equipos sueltos que el árbol no alcanzaría desde un coord. de UN.
  const sueltos = personas.filter((p) => p.cargo !== 'coord_un' && p.superior_id === null);

  return (
    <AppLayout
      toolbar={
        <div className="mb-6 rounded-3xl border border-slate-800 bg-surface-secondary p-4 shadow-xl">
          <ToggleGroup
            activeKey={vista}
            onChange={(key) => setVista(key as Vista)}
            options={[
              { key: 'arbol', label: 'Árbol', icon: Network },
              ...NIVELES.map((cargo) => ({
                key: cargo,
                label: `${CARGO_CORTO[cargo]} (${porCargo(cargo).filter((p) => p.superior_id === null).length} sin asignar)`,
                icon: GitFork,
              })),
            ]}
          />
        </div>
      }
    >
      <StatusMessage status={error ? { type: 'error', text: error } : null} className="mb-4" icon={<AlertTriangle />} />

      {vista === 'arbol' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <NeonContainer title="Equipos" subtitle="Desde cada coordinador de unidad de negocio" icon={<Network className="h-5 w-5" />} theme="green">
            {porCargo('coord_un').length === 0 ? (
              <EmptyState title="Sin coordinadores de UN" description="Regístralos en Catálogos › Ventas." icon={<Network />} />
            ) : (
              <ul className="space-y-3">{porCargo('coord_un').map((p) => rama(p, 0))}</ul>
            )}
          </NeonContainer>
          <NeonContainer title="Sin superior" subtitle="Equipos sueltos: sus ventas no llegan a ningún coordinador de UN si Odoo no los trae" icon={<AlertTriangle className="h-5 w-5" />} theme="yellow">
            {sueltos.length === 0 ? (
              <EmptyState title="Todos asignados" icon={<GitFork />} />
            ) : (
              <ul className="space-y-3">{sueltos.map((p) => rama(p, 0))}</ul>
            )}
          </NeonContainer>
        </div>
      )}

      {vista !== 'arbol' && (
        <NeonContainer
          title={etiquetaCargo(vista)}
          subtitle={`A qué ${etiquetaCargo(superiorDe[vista]!).toLowerCase()} responde cada uno`}
          icon={<GitFork className="h-5 w-5" />}
          theme="blue"
          noPadding
        >
          <DataTable
            columns={columnas(vista)}
            data={porCargo(vista)}
            searchable
            searchPlaceholder="Buscar persona..."
            emptyMessage="Nadie con este cargo en el directorio de ventas."
          />
        </NeonContainer>
      )}
    </AppLayout>
  );
}
