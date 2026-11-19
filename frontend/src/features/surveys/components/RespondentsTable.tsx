/** La lista de clientes del mes con su estado; una fila abre su formulario. */

import { cn } from '@/shared/lib/cn';
import { DataTable, type Column } from '@/shared/ui';

import { CARD_FIELDS, STATUS_CHIP, STATUS_LABEL } from '../lib/format';
import type { Respondent } from '../types';

const MONO = new Set(['order', 'ci', 'phone1', 'phone2']);
const FILTERABLE = new Set(['branch', 'zone', 'service_type']);

const COLUMNS: Column<Respondent>[] = [
  ...CARD_FIELDS.map(({ key, label }) => ({
    header: label,
    accessor: (r: Respondent) => r[key] || <span className="text-slate-600">—</span>,
    sortKey: key,
    filterable: FILTERABLE.has(key),
    filterValue: (r: Respondent) => r[key],
    className: cn('whitespace-nowrap', MONO.has(key) && 'font-mono'),
    sticky: key === 'order',
  })),
  {
    header: 'Estado',
    accessor: (r) => (
      <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase', STATUS_CHIP[r.status])}>
        {STATUS_LABEL[r.status]}
      </span>
    ),
    sortValue: (r) => STATUS_LABEL[r.status],
    filterable: true,
    filterValue: (r) => STATUS_LABEL[r.status],
  },
];

export function RespondentsTable({ rows, onOpen }: { rows: Respondent[]; onOpen: (r: Respondent) => void }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      searchable
      searchPlaceholder="Buscar por nombre, CI, Id, teléfono…"
      emptyMessage="Ningún cliente coincide."
      onRowClick={onOpen}
    />
  );
}
