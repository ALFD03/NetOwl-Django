/**
 * El registro de auditoría: cada escritura de la aplicación, cada acceso y cada
 * análisis terminado, con quién, cuándo, desde dónde y cómo acabó.
 *
 * Los filtros de fecha, módulo, usuario, resultado y texto se aplican en el
 * servidor (la tabla crece sin límite); dentro de lo que llega, la búsqueda, el
 * orden y la paginación son de la tabla. El `detalle` se pide al abrir un
 * registro.
 */

import { useState } from 'react';
import { router } from '@inertiajs/react';
import { AlertTriangle, Filter, ScrollText, Search, ShieldCheck } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { auditoriaApi } from '@/shared/lib/api/auditoria';
import { cn } from '@/shared/lib/cn';
import {
  Button, ConsoleOutput, DataTable, DatePicker, FILTER_TRIGGER_CLASS, FilterField, LoadingState, Modal,
  NeonContainer, SearchInput, SelectMenu, StatTile, StatusMessage, type Column,
} from '@/shared/ui';
import { formatInteger } from '@/shared/utils/formatters/number';
import type {
  AuditoriaRegistroProps, FiltrosAuditoria, RegistroAuditoria, RegistroAuditoriaDetalle, ResultadoAuditoria,
} from '../types';

const TODOS = '__todos__';

const TONO_RESULTADO: Record<ResultadoAuditoria, string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  rechazado: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  denegado: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
  limitado: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
};

const COLUMNAS: Column<RegistroAuditoria>[] = [
  { header: 'Fecha y hora', accessor: (r) => <span className="tabular-nums">{r.fecha}</span>, sortKey: 'fecha' },
  { header: 'Usuario', accessor: (r) => <span className="font-semibold text-white">{r.username}</span>, sortKey: 'username' },
  { header: 'Módulo', accessor: (r) => <span className="font-bold text-brand">{r.modulo_display}</span>, sortKey: 'modulo_display' },
  { header: 'Acción', accessor: 'accion_display', sortKey: 'accion_display' },
  {
    header: 'Sobre',
    accessor: (r) => <span className="block max-w-[18rem] truncate text-slate-400" title={r.objeto}>{r.objeto || '—'}</span>,
    sortKey: 'objeto',
  },
  {
    header: 'Resultado',
    align: 'center',
    sortKey: 'resultado',
    accessor: (r) => (
      <span className={cn('rounded-full border px-3 py-1 text-[10px] font-black uppercase', TONO_RESULTADO[r.resultado])}>
        {r.resultado_display}
      </span>
    ),
  },
  { header: 'IP', accessor: (r) => <span className="tabular-nums text-slate-400">{r.ip || '—'}</span>, sortKey: 'ip' },
];

export function RegistroView({ registros, total, limite, filtros, opciones }: AuditoriaRegistroProps) {
  const [borrador, setBorrador] = useState<FiltrosAuditoria>(filtros);
  const [abierto, setAbierto] = useState<RegistroAuditoriaDetalle | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aplicar = (siguiente: FiltrosAuditoria) => {
    setBorrador(siguiente);
    const params = Object.fromEntries(Object.entries(siguiente).filter(([, valor]) => valor));
    router.get('/auditoria/', params, { preserveState: true, preserveScroll: true });
  };
  const cambiar = (campo: keyof FiltrosAuditoria, valor: string) =>
    aplicar({ ...borrador, [campo]: valor === TODOS ? '' : valor });

  const abrir = async (fila: RegistroAuditoria) => {
    setError(null);
    setCargando(true);
    setAbierto({ ...fila, metodo: '', ruta: '', detalle: null });
    try {
      setAbierto(await auditoriaApi.detalle<RegistroAuditoriaDetalle>(fila.id));
    } catch {
      setError('No se pudo cargar el detalle del registro.');
    } finally {
      setCargando(false);
    }
  };

  const recortado = total > registros.length;

  return (
    <AppLayout title="Auditoría">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <DatePicker label="Desde" value={borrador.desde} max={borrador.hasta} onChange={(v) => cambiar('desde', v)} />
          <DatePicker label="Hasta" value={borrador.hasta} min={borrador.desde} onChange={(v) => cambiar('hasta', v)} />
          <FilterField label="Módulo" icon={<Filter className="h-4 w-4 text-brand" />}>
            <SelectMenu
              aria-label="Filtrar por módulo"
              className={FILTER_TRIGGER_CLASS}
              panelWidth={240}
              value={borrador.modulo || TODOS}
              options={[{ value: TODOS, label: 'Todos' }, ...opciones.modulos]}
              onChange={(v) => cambiar('modulo', v)}
            />
          </FilterField>
          <FilterField label="Usuario" icon={<Filter className="h-4 w-4 text-brand" />}>
            <SelectMenu
              aria-label="Filtrar por usuario"
              className={FILTER_TRIGGER_CLASS}
              panelWidth={240}
              value={borrador.usuario || TODOS}
              options={[{ value: TODOS, label: 'Todos' }, ...opciones.usuarios.map((u) => ({ value: u, label: u }))]}
              onChange={(v) => cambiar('usuario', v)}
            />
          </FilterField>
          <FilterField label="Resultado" icon={<Filter className="h-4 w-4 text-brand" />}>
            <SelectMenu
              aria-label="Filtrar por resultado"
              className={FILTER_TRIGGER_CLASS}
              panelWidth={200}
              value={borrador.resultado || TODOS}
              options={[{ value: TODOS, label: 'Todos' }, ...opciones.resultados]}
              onChange={(v) => cambiar('resultado', v)}
            />
          </FilterField>
          {/* El texto va al servidor al pulsar Buscar: busca en todo el rango,
              no solo en los registros que llegaron. */}
          <form
            className="flex min-w-[16rem] flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              aplicar(borrador);
            }}
          >
            <FilterField grow icon={<Search className="h-4 w-4" />} title="Busca en la descripción, el objeto, la acción y el usuario">
              <SearchInput
                value={borrador.q}
                placeholder="Buscar en el registro..."
                onChange={(q) => setBorrador({ ...borrador, q })}
                className="w-full bg-transparent px-0"
              />
            </FilterField>
            <Button type="submit" size="sm" icon={<Search className="h-4 w-4" />}>Buscar</Button>
          </form>
        </div>

        {recortado && (
          <StatusMessage
            status={{
              type: 'warning',
              text: `${formatInteger(total)} registros cumplen los filtros; se muestran los ${formatInteger(limite)} más recientes. Acota las fechas o filtra para ver el resto.`,
            }}
            icon={<AlertTriangle />}
          />
        )}

        <NeonContainer
          theme="slate"
          title="Registro de auditoría"
          subtitle={`${formatInteger(total)} registros entre ${filtros.desde} y ${filtros.hasta}. Haz clic en una fila para ver el detalle.`}
          icon={<ScrollText className="h-5 w-5" />}
          noPadding
        >
          <div className="h-[600px]">
            <DataTable
              columns={COLUMNAS}
              data={registros}
              searchable
              searchPlaceholder="Filtrar lo cargado..."
              emptyMessage="Nada registrado con estos filtros."
              onRowClick={(fila) => void abrir(fila)}
            />
          </div>
        </NeonContainer>
      </div>

      <Modal
        isOpen={Boolean(abierto)}
        onClose={() => setAbierto(null)}
        title={abierto?.accion_display ?? ''}
        subtitle={abierto ? `${abierto.username} · ${abierto.fecha} · ${abierto.ip || 'sin IP'}` : ''}
        theme={abierto?.resultado === 'ok' ? 'green' : abierto?.resultado === 'rechazado' ? 'yellow' : 'red'}
        icon={<ShieldCheck className="h-5 w-5" />}
        size="lg"
      >
        {abierto && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <StatTile label="Módulo" value={abierto.modulo_display} variant="boxed" size="sm" />
              <StatTile
                label="Resultado"
                value={`${abierto.resultado_display}${abierto.estado_http ? ` (${abierto.estado_http})` : ''}`}
                variant="boxed"
                size="sm"
              />
              <StatTile label="Sobre" value={abierto.objeto || '—'} variant="boxed" size="sm" />
            </div>
            {abierto.descripcion && <StatTile label="Descripción" value={abierto.descripcion} variant="boxed" size="sm" />}
            {error && <StatusMessage status={{ type: 'error', text: error }} icon={<AlertTriangle />} />}
            {cargando ? (
              <LoadingState message="Cargando detalle..." />
            ) : (
              <ConsoleOutput
                title={abierto.ruta ? `${abierto.metodo} ${abierto.ruta}` : 'Detalle'}
                output={abierto.detalle ? JSON.stringify(abierto.detalle, null, 2) : ''}
                emptyText="Sin detalle adicional."
                maxHeight="max-h-80"
              />
            )}
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
