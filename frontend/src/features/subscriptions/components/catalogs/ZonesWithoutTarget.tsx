/**
 * Catálogos › Ventas › Objetivos: las zonas que no se miden contra ningún objetivo.
 *
 * Es para las zonas nuevas: sin base al empezar el mes su meta es cero, pero
 * sus instalaciones y su crecimiento entraban en el total de su site o de su
 * coordinador e inflaban su cumplimiento. Mientras están apartadas siguen en la
 * tabla de su grupo, pero no suman a su resumen (`lib/targets.ts`).
 *
 * El alta deja elegir varias zonas a la vez y las guarda en un solo lote; cada
 * una queda con su propio tramo, que luego se edita por separado (lo normal es
 * ponerle «hasta» cuando ya tenga base para medirse).
 */

import { useMemo, useState, type FormEvent } from 'react';
import { Check, MapPinOff, Plus, X } from 'lucide-react';

import { ActionMessage, Button, DataTable, EmptyState, Modal, MonthPicker, NeonContainer, SearchInput, type Column } from '@/shared/ui';
import { Field, FormBanner, FormColumns, FormFooter, ModalForm } from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import { catalogsApi } from '@/shared/lib/api/catalogs';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { cn } from '@/shared/lib/cn';
import type { CatalogZone, CatalogZoneWithoutTarget } from '@/features/subscriptions/types';
import { actionsColumn } from './CatalogCommon';

interface Borrador {
  id?: number;
  /** Solo al crear: las zonas elegidas. */
  zones: number[];
  /** Al editar: el nombre de la zona, que ya no cambia. */
  role_label?: string;
  since: string;
  until: string;
  note: string;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

/** Si el tramo rige en `mes`. */
const current = (row: CatalogZoneWithoutTarget, mes: string) =>
  (!row.since || row.since <= mes) && (!row.until || mes <= row.until);

export function ZonesWithoutTargetPanel({
  rows,
  zones,
  onDelete: onBorrar,
}: {
  rows: CatalogZoneWithoutTarget[];
  zones: CatalogZone[];
  onDelete: (row: CatalogZoneWithoutTarget) => void;
}) {
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = currentMonth();

  const cerrar = () => {
    setBorrador(null);
    setError(null);
  };

  const guardar = async (event: FormEvent) => {
    event.preventDefault();
    if (!borrador) return;
    const { since, until, note } = borrador;
    setGuardando(true);
    setError(null);
    try {
      if (borrador.id) {
        await catalogsApi.guardar('zonas_sin_objetivo', { id: borrador.id, since, until, note });
      } else {
        if (borrador.zones.length === 0) {
          setError('Elige al menos una zona.');
          return;
        }
        const byId = new Map(zones.map((z) => [z.id, z.name]));
        const response = await catalogsApi.guardarLote(
          'zonas_sin_objetivo',
          borrador.zones.map((id) => ({ zone_id: id, name: byId.get(id) ?? '', since, until, note })),
        );
        if (response.errors.length) {
          setError(`${response.message} No entraron: ${response.errors.map((e) => `${e.name}: ${e.message}`).join(' · ')}`);
          return;
        }
      }
      cerrar();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  };

  const columns: Column<CatalogZoneWithoutTarget>[] = [
    { header: 'Zona', accessor: 'zona', sortKey: 'zona' },
    { header: 'Site', accessor: 'site', sortKey: 'site', filterable: true },
    { header: 'Unidad de negocio', accessor: (row) => row.coordinator || <span className="text-slate-600">—</span>, sortKey: 'coordinator' },
    { header: 'Desde', accessor: (row) => row.since || 'siempre', sortKey: 'since' },
    { header: 'Hasta', accessor: (row) => row.until || 'sin fin', sortKey: 'until' },
    {
      header: `Rige ${today}`,
      accessor: (row) => (current(row, today)
        ? <span className="font-semibold text-amber-300">Sin objetivo</span>
        : <span className="text-slate-500">No: se mide</span>),
    },
    { header: 'Nota', accessor: (row) => row.note || <span className="text-slate-600">—</span> },
    {
      header: 'Actualizado',
      accessor: (row) => `${row.updated_at}${row.updated_by ? ` · ${row.updated_by}` : ''}`,
      sortKey: 'updated_at',
    },
    actionsColumn<CatalogZoneWithoutTarget>(
      (row) => setBorrador({ id: row.id, zones: [row.zone_id], role_label: row.zona, since: row.since, until: row.until, note: row.note }),
      onBorrar,
    ),
  ];

  return (
    <>
      <NeonContainer
        className="mt-8"
        title="Zonas sin objetivo"
        subtitle="Zonas nuevas que no se miden: siguen en la tabla de su site o su unidad de negocio, pero no suman a su resumen (base, ventas, bajas, objetivo ni cumplimiento)"
        icon={<MapPinOff className="h-5 w-5" />}
        theme="yellow"
        noPadding
        headerAction={
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setBorrador({ zones: [], since: today, until: '', note: '' })}
          >
            Apartar zonas
          </Button>
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            title="Todas las zonas se miden"
            description="Aparta aquí las zonas nuevas para que no muevan el cumplimiento de su grupo hasta que tengan base."
            icon={<MapPinOff />}
          />
        ) : (
          <DataTable columns={columns} data={rows} searchable searchPlaceholder="Buscar zona..." />
        )}
      </NeonContainer>

      <Modal
        isOpen={Boolean(borrador)}
        onClose={cerrar}
        title={borrador?.id ? 'Editar zona sin objetivo' : 'Apartar zonas del objetivo'}
        subtitle="No cambia ningún análisis: solo qué cuenta para el cumplimiento"
        icon={<MapPinOff className="h-5 w-5 text-amber-400" />}
        theme="yellow"
        size="md"
      >
        <ActionMessage status={error ? { type: 'error', text: error } : null} />
        {borrador && (
          <ModalForm onSubmit={guardar}>
            <FormBanner
              title="Zonas sin objetivo"
              description="Mientras rija el tramo, la zona sale «Sin objetivo» en la tabla de su grupo y no suma a su resumen. Ponle «Hasta» cuando ya deba medirse: los meses anteriores no cambian."
              action={<MapPinOff className="h-8 w-8 flex-shrink-0 text-slate-600" />}
            />

            {borrador.id ? (
              <Field label="Zona">
                <div className="py-2 text-sm font-semibold text-white">{borrador.role_label}</div>
              </Field>
            ) : (
              <ZoneSelector
                zones={zones.filter((z) => !rows.some((f) => f.zone_id === z.id))}
                elegidas={borrador.zones}
                onChange={(ids) => setBorrador({ ...borrador, zones: ids })}
              />
            )}

            <FormColumns>
              <Field label="Desde" hint="Vacío: desde siempre.">
                <MonthPicker value={borrador.since} onChange={(desde) => setBorrador({ ...borrador, since: desde })} placeholder="Desde siempre" />
              </Field>
              <Field
                label="Hasta (incluido)"
                hint="Vacío: hasta que se le ponga fin."
                action={borrador.until ? (
                  <button
                    type="button"
                    onClick={() => setBorrador({ ...borrador, until: '' })}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white"
                  >
                    <X className="h-3 w-3" /> Quitar
                  </button>
                ) : undefined}
              >
                <MonthPicker value={borrador.until} onChange={(hasta) => setBorrador({ ...borrador, until: hasta })} placeholder="Sin fin" />
              </Field>
            </FormColumns>

            <Field label="Nota" hint="Opcional: p. ej. «zona inaugurada en noviembre».">
              <input
                type="text"
                className={modalInputClass}
                value={borrador.note}
                onChange={(e) => setBorrador({ ...borrador, note: e.target.value })}
              />
            </Field>


            <FormFooter
              saving={guardando}
              onClose={cerrar}
              submitLabel={borrador.id
                ? 'Guardar cambios'
                : `Apartar ${borrador.zones.length || ''} ${borrador.zones.length === 1 ? 'zona' : 'zonas'}`.replace(/\s+/g, ' ')}
            />
          </ModalForm>
        )}
      </Modal>
    </>
  );
}

/** Lista con búsqueda para marcar varias zonas; las ya apartadas no salen. */
function ZoneSelector({
  zones,
  elegidas,
  onChange,
}: {
  zones: CatalogZone[];
  elegidas: number[];
  onChange: (ids: number[]) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return zones.filter((z) => !q || `${z.name} ${z.site} ${z.coordinator}`.toLowerCase().includes(q));
  }, [zones, busqueda]);
  const marcadas = new Set(elegidas);
  const alternar = (id: number) =>
    onChange(marcadas.has(id) ? elegidas.filter((e) => e !== id) : [...elegidas, id]);

  return (
    <Field label={`Zonas (${elegidas.length} elegidas)`} hint="Marca todas las que no deban medirse.">
      <div className="space-y-2">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar zona, site o unidad..." />
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-700/60 bg-slate-900/40">
          {visibles.length === 0 ? (
            <p className="p-3 text-xs text-slate-500">Ninguna zona coincide.</p>
          ) : visibles.map((z) => {
            const marcada = marcadas.has(z.id);
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => alternar(z.id)}
                aria-pressed={marcada}
                className={cn(
                  'flex w-full items-center gap-3 border-b border-slate-800/60 px-3 py-2 text-left text-xs last:border-0 hover:bg-white/5',
                  marcada && 'bg-amber-500/10',
                )}
              >
                <span className={cn(
                  'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
                  marcada ? 'border-amber-400 bg-amber-400 text-slate-900' : 'border-slate-600',
                )}>
                  {marcada && <Check className="h-3 w-3" />}
                </span>
                <span className="font-semibold text-white">{z.name}</span>
                <span className="ml-auto text-slate-500">{z.site}{z.coordinator ? ` · ${z.coordinator}` : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Field>
  );
}
