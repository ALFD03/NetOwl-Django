/**
 * El registro de auditoría: cada escritura de la aplicación, cada acceso y cada
 * análisis terminado, con quién, cuándo, desde dónde y cómo acabó.
 *
 * Los filtros de fecha, módulo, usuario, resultado y texto se aplican en el
 * servidor (la tabla crece sin límite); dentro de lo que llega, la búsqueda, el
 * orden y la paginación son de la tabla. El `detail` se pide al abrir un
 * registro.
 */

import { useState } from 'react';
import { AlertTriangle, Filter, ScrollText, Search, ShieldCheck } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { auditApi } from '@/shared/lib/api/audit';
import { cn } from '@/shared/lib/cn';
import {
  Button, ConsoleOutput, DataTable, DatePicker, FILTER_TRIGGER_CLASS, FilterField, LoadingState, Modal,
  NeonContainer, SearchInput, SelectMenu, StatTile, StatusMessage, type Column,
} from '@/shared/ui';
import { formatInteger } from '@/shared/utils/formatters/number';
import type {
  AuditLogPageProps, AuditFilters, AuditEntry, AuditEntryDetail, AuditResult,
} from '../types';
import { useVisit } from '@/shared/page/PageData';

const ALL = '__all__';

const OUTCOME_TONE: Record<AuditResult, string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  rechazado: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  denegado: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
  limitado: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
};

const COLUMNS: Column<AuditEntry>[] = [
  { header: 'Fecha y hora', accessor: (r) => <span className="tabular-nums">{r.date}</span>, sortKey: 'date' },
  { header: 'Usuario', accessor: (r) => <span className="font-semibold text-white">{r.username}</span>, sortKey: 'username' },
  { header: 'Módulo', accessor: (r) => <span className="font-bold text-brand">{r.module_label}</span>, sortKey: 'module_label' },
  { header: 'Acción', accessor: 'action_label', sortKey: 'action_label' },
  {
    header: 'Sobre',
    accessor: (r) => <span className="block max-w-[18rem] truncate text-slate-400" title={r.target}>{r.target || '—'}</span>,
    sortKey: 'target',
  },
  {
    header: 'Resultado',
    align: 'center',
    sortKey: 'outcome',
    accessor: (r) => (
      <span className={cn('rounded-full border px-3 py-1 text-[10px] font-black uppercase', OUTCOME_TONE[r.outcome])}>
        {r.outcome_label}
      </span>
    ),
  },
  { header: 'IP', accessor: (r) => <span className="tabular-nums text-slate-400">{r.ip || '—'}</span>, sortKey: 'ip' },
];

export function LogView({ logs, total, limit, filters, options }: AuditLogPageProps) {
  const visit = useVisit();
  const [draft, setDraft] = useState<AuditFilters>(filters);
  const [opened, setOpen] = useState<AuditEntryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (next: AuditFilters) => {
    setDraft(next);
    visit({ ...next });
  };
  const change = (field: keyof AuditFilters, value: string) =>
    apply({ ...draft, [field]: value === ALL ? '' : value });

  const openEntry = async (row: AuditEntry) => {
    setError(null);
    setLoading(true);
    setOpen({ ...row, method: '', path: '', detail: null });
    try {
      setOpen(await auditApi.detail<AuditEntryDetail>(row.id));
    } catch {
      setError('No se pudo cargar el detalle del registro.');
    } finally {
      setLoading(false);
    }
  };

  const truncated = total > logs.length;

  return (
    <AppLayout title="Auditoría">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <DatePicker label="Desde" value={draft.since} max={draft.until} onChange={(v) => change('since', v)} />
          <DatePicker label="Hasta" value={draft.until} min={draft.since} onChange={(v) => change('until', v)} />
          <FilterField label="Módulo" icon={<Filter className="h-4 w-4 text-brand" />}>
            <SelectMenu
              aria-label="Filtrar por módulo"
              className={FILTER_TRIGGER_CLASS}
              panelWidth={240}
              value={draft.module || ALL}
              options={[{ value: ALL, label: 'Todos' }, ...options.modules]}
              onChange={(v) => change('module', v)}
            />
          </FilterField>
          <FilterField label="Usuario" icon={<Filter className="h-4 w-4 text-brand" />}>
            <SelectMenu
              aria-label="Filtrar por usuario"
              className={FILTER_TRIGGER_CLASS}
              panelWidth={240}
              value={draft.user || ALL}
              options={[{ value: ALL, label: 'Todos' }, ...options.users.map((u) => ({ value: u, label: u }))]}
              onChange={(v) => change('user', v)}
            />
          </FilterField>
          <FilterField label="Resultado" icon={<Filter className="h-4 w-4 text-brand" />}>
            <SelectMenu
              aria-label="Filtrar por resultado"
              className={FILTER_TRIGGER_CLASS}
              panelWidth={200}
              value={draft.outcome || ALL}
              options={[{ value: ALL, label: 'Todos' }, ...options.outcomes]}
              onChange={(v) => change('outcome', v)}
            />
          </FilterField>
          {/* El texto va al servidor al pulsar Buscar: busca en todo el rango,
              no solo en los registros que llegaron. */}
          <form
            className="flex min-w-[16rem] flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              apply(draft);
            }}
          >
            <FilterField grow icon={<Search className="h-4 w-4" />} title="Busca en la descripción, el objeto, la acción y el usuario">
              <SearchInput
                value={draft.q}
                placeholder="Buscar en el registro..."
                onChange={(q) => setDraft({ ...draft, q })}
                className="w-full bg-transparent px-0"
              />
            </FilterField>
            <Button type="submit" size="sm" icon={<Search className="h-4 w-4" />}>Buscar</Button>
          </form>
        </div>

        {truncated && (
          <StatusMessage
            status={{
              type: 'warning',
              text: `${formatInteger(total)} registros cumplen los filtros; se muestran los ${formatInteger(limit)} más recientes. Acota las fechas o filtra para ver el resto.`,
            }}
            icon={<AlertTriangle />}
          />
        )}

        <NeonContainer
          theme="slate"
          title="Registro de auditoría"
          subtitle={`${formatInteger(total)} registros entre ${filters.since} y ${filters.until}. Haz clic en una fila para ver el detalle.`}
          icon={<ScrollText className="h-5 w-5" />}
          noPadding
        >
          <div className="h-[600px]">
            <DataTable
              columns={COLUMNS}
              data={logs}
              searchable
              searchPlaceholder="Filtrar lo cargado..."
              emptyMessage="Nada registrado con estos filtros."
              onRowClick={(row) => void openEntry(row)}
            />
          </div>
        </NeonContainer>
      </div>

      <Modal
        isOpen={Boolean(opened)}
        onClose={() => setOpen(null)}
        title={opened?.action_label ?? ''}
        subtitle={opened ? `${opened.username} · ${opened.date} · ${opened.ip || 'sin IP'}` : ''}
        theme={opened?.outcome === 'ok' ? 'green' : opened?.outcome === 'rechazado' ? 'yellow' : 'red'}
        icon={<ShieldCheck className="h-5 w-5" />}
        size="lg"
      >
        {opened && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <StatTile label="Módulo" value={opened.module_label} variant="boxed" size="sm" />
              <StatTile
                label="Resultado"
                value={`${opened.outcome_label}${opened.status_code ? ` (${opened.status_code})` : ''}`}
                variant="boxed"
                size="sm"
              />
              <StatTile label="Sobre" value={opened.target || '—'} variant="boxed" size="sm" />
            </div>
            {opened.description && <StatTile label="Descripción" value={opened.description} variant="boxed" size="sm" />}
            {error && <StatusMessage status={{ type: 'error', text: error }} icon={<AlertTriangle />} />}
            {loading ? (
              <LoadingState message="Cargando detalle..." />
            ) : (
              <ConsoleOutput
                title={opened.path ? `${opened.method} ${opened.path}` : 'Detalle'}
                output={opened.detail ? JSON.stringify(opened.detail, null, 2) : ''}
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
