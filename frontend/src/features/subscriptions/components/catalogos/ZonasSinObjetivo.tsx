/**
 * Catálogos › Ventas › Objetivos: las zonas que no se miden contra ningún objetivo.
 *
 * Es para las zonas nuevas: sin base al empezar el mes su meta es cero, pero
 * sus instalaciones y su crecimiento entraban en el total de su site o de su
 * coordinador e inflaban su cumplimiento. Mientras están apartadas siguen en la
 * tabla de su grupo, pero no suman a su resumen (`lib/objetivos.ts`).
 *
 * El alta deja elegir varias zonas a la vez y las guarda en un solo lote; cada
 * una queda con su propio tramo, que luego se edita por separado (lo normal es
 * ponerle «hasta» cuando ya tenga base para medirse).
 */

import { useMemo, useState, type FormEvent } from 'react';
import { router } from '@inertiajs/react';
import { Check, MapPinOff, Plus, X } from 'lucide-react';

import { Button, DataTable, EmptyState, Modal, MonthPicker, NeonContainer, SearchInput, type Column } from '@/shared/ui';
import { Field, FormBanner, FormColumns, FormFooter, ModalForm } from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import { catalogosApi } from '@/shared/lib/api/catalogos';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { cn } from '@/shared/lib/cn';
import type { CatalogoZona, CatalogoZonaSinObjetivo } from '@/features/subscriptions/types';
import { columnaAcciones } from './CatalogoComun';

interface Borrador {
  id?: number;
  /** Solo al crear: las zonas elegidas. */
  zonas: number[];
  /** Al editar: el nombre de la zona, que ya no cambia. */
  etiqueta?: string;
  desde: string;
  hasta: string;
  nota: string;
}

const mesActual = () => new Date().toISOString().slice(0, 7);

/** Si el tramo rige en `mes`. */
const vigente = (fila: CatalogoZonaSinObjetivo, mes: string) =>
  (!fila.desde || fila.desde <= mes) && (!fila.hasta || mes <= fila.hasta);

export function ZonasSinObjetivoPanel({
  filas,
  zonas,
  onBorrar,
}: {
  filas: CatalogoZonaSinObjetivo[];
  zonas: CatalogoZona[];
  onBorrar: (fila: CatalogoZonaSinObjetivo) => void;
}) {
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoy = mesActual();

  const cerrar = () => {
    setBorrador(null);
    setError(null);
  };

  const guardar = async (event: FormEvent) => {
    event.preventDefault();
    if (!borrador) return;
    const { desde, hasta, nota } = borrador;
    setGuardando(true);
    setError(null);
    try {
      if (borrador.id) {
        await catalogosApi.guardar('zonas_sin_objetivo', { id: borrador.id, desde, hasta, nota });
      } else {
        if (borrador.zonas.length === 0) {
          setError('Elige al menos una zona.');
          return;
        }
        const porId = new Map(zonas.map((z) => [z.id, z.nombre]));
        const respuesta = await catalogosApi.guardarLote(
          'zonas_sin_objetivo',
          borrador.zonas.map((id) => ({ zona_id: id, nombre: porId.get(id) ?? '', desde, hasta, nota })),
        );
        if (respuesta.errores.length) {
          setError(`${respuesta.message} No entraron: ${respuesta.errores.map((e) => `${e.nombre}: ${e.message}`).join(' · ')}`);
          if (respuesta.registrados.length) router.reload();
          return;
        }
      }
      cerrar();
      router.reload();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  };

  const columnas: Column<CatalogoZonaSinObjetivo>[] = [
    { header: 'Zona', accessor: 'zona', sortKey: 'zona' },
    { header: 'Site', accessor: 'site', sortKey: 'site', filterable: true },
    { header: 'Unidad de negocio', accessor: (row) => row.coordinador || <span className="text-slate-600">—</span>, sortKey: 'coordinador' },
    { header: 'Desde', accessor: (row) => row.desde || 'siempre', sortKey: 'desde' },
    { header: 'Hasta', accessor: (row) => row.hasta || 'sin fin', sortKey: 'hasta' },
    {
      header: `Rige ${hoy}`,
      accessor: (row) => (vigente(row, hoy)
        ? <span className="font-semibold text-amber-300">Sin objetivo</span>
        : <span className="text-slate-500">No: se mide</span>),
    },
    { header: 'Nota', accessor: (row) => row.nota || <span className="text-slate-600">—</span> },
    {
      header: 'Actualizado',
      accessor: (row) => `${row.actualizado_en}${row.actualizado_por ? ` · ${row.actualizado_por}` : ''}`,
      sortKey: 'actualizado_en',
    },
    columnaAcciones<CatalogoZonaSinObjetivo>(
      (row) => setBorrador({ id: row.id, zonas: [row.zona_id], etiqueta: row.zona, desde: row.desde, hasta: row.hasta, nota: row.nota }),
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
            onClick={() => setBorrador({ zonas: [], desde: hoy, hasta: '', nota: '' })}
          >
            Apartar zonas
          </Button>
        }
      >
        {filas.length === 0 ? (
          <EmptyState
            title="Todas las zonas se miden"
            description="Aparta aquí las zonas nuevas para que no muevan el cumplimiento de su grupo hasta que tengan base."
            icon={<MapPinOff />}
          />
        ) : (
          <DataTable columns={columnas} data={filas} searchable searchPlaceholder="Buscar zona..." />
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
        {borrador && (
          <ModalForm onSubmit={guardar}>
            <FormBanner
              title="Zonas sin objetivo"
              description="Mientras rija el tramo, la zona sale «Sin objetivo» en la tabla de su grupo y no suma a su resumen. Ponle «Hasta» cuando ya deba medirse: los meses anteriores no cambian."
              action={<MapPinOff className="h-8 w-8 flex-shrink-0 text-slate-600" />}
            />

            {borrador.id ? (
              <Field label="Zona">
                <div className="py-2 text-sm font-semibold text-white">{borrador.etiqueta}</div>
              </Field>
            ) : (
              <SelectorZonas
                zonas={zonas.filter((z) => !filas.some((f) => f.zona_id === z.id))}
                elegidas={borrador.zonas}
                onChange={(ids) => setBorrador({ ...borrador, zonas: ids })}
              />
            )}

            <FormColumns>
              <Field label="Desde" hint="Vacío: desde siempre.">
                <MonthPicker value={borrador.desde} onChange={(desde) => setBorrador({ ...borrador, desde })} placeholder="Desde siempre" />
              </Field>
              <Field
                label="Hasta (incluido)"
                hint="Vacío: hasta que se le ponga fin."
                action={borrador.hasta ? (
                  <button
                    type="button"
                    onClick={() => setBorrador({ ...borrador, hasta: '' })}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white"
                  >
                    <X className="h-3 w-3" /> Quitar
                  </button>
                ) : undefined}
              >
                <MonthPicker value={borrador.hasta} onChange={(hasta) => setBorrador({ ...borrador, hasta })} placeholder="Sin fin" />
              </Field>
            </FormColumns>

            <Field label="Nota" hint="Opcional: p. ej. «zona inaugurada en noviembre».">
              <input
                type="text"
                className={modalInputClass}
                value={borrador.nota}
                onChange={(e) => setBorrador({ ...borrador, nota: e.target.value })}
              />
            </Field>

            {error && <p className="text-sm font-semibold text-rose-400">{error}</p>}

            <FormFooter
              saving={guardando}
              onClose={cerrar}
              submitLabel={borrador.id
                ? 'Guardar cambios'
                : `Apartar ${borrador.zonas.length || ''} ${borrador.zonas.length === 1 ? 'zona' : 'zonas'}`.replace(/\s+/g, ' ')}
            />
          </ModalForm>
        )}
      </Modal>
    </>
  );
}

/** Lista con búsqueda para marcar varias zonas; las ya apartadas no salen. */
function SelectorZonas({
  zonas,
  elegidas,
  onChange,
}: {
  zonas: CatalogoZona[];
  elegidas: number[];
  onChange: (ids: number[]) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return zonas.filter((z) => !q || `${z.nombre} ${z.site} ${z.coordinador}`.toLowerCase().includes(q));
  }, [zonas, busqueda]);
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
                <span className="font-semibold text-white">{z.nombre}</span>
                <span className="ml-auto text-slate-500">{z.site}{z.coordinador ? ` · ${z.coordinador}` : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Field>
  );
}
