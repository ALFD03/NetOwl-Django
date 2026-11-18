/**
 * Las versiones archivadas de los cierres de un periodo: lo que había
 * congelado cada vez que se reabrió, con quién, cuándo y por qué.
 */

import { useState } from 'react';
import { Archive, FileSpreadsheet } from 'lucide-react';

import { commissionsApi } from '@/shared/lib/api/commissions';
import { DataTable, ExportButton, SectionHeading, type Column, type ExportState } from '@/shared/ui';
import { exportReport } from '../lib/export';
import { formatAmount } from '../lib/format';
import type { ArchivedClose, CloseSnapshot, SalesRole } from '../types';

interface Props {
  archives: ArchivedClose[];
  roleLabel: (role: SalesRole) => string;
}

export function ArchivedCloses({ archives, roleLabel: titleLabel }: Props) {
  const [states, setStates] = useState<Record<number, ExportState>>({});

  /** La nómina del cierre archivado, en el mismo Excel que el informe vivo. */
  const download = async (archive: ArchivedClose) => {
    setStates((prev) => ({ ...prev, [archive.id]: 'busy' }));
    try {
      const copy = await commissionsApi.archive<CloseSnapshot>(archive.id);
      const rate = copy.summary.conatel_rate?.rate
        ?? (copy.period.conatel_rate !== null ? Number(copy.period.conatel_rate) : null);
      await exportReport(
        copy.summary,
        copy.sales.map((sale) => sale.data),
        copy.conditions,
        rate,
        titleLabel,
        `Comisiones ${copy.period.period} - cierre archivado v${archive.version}`,
      );
      setStates((prev) => ({ ...prev, [archive.id]: 'idle' }));
    } catch (err) {
      console.error('No se pudo descargar el cierre archivado:', err);
      setStates((prev) => ({ ...prev, [archive.id]: 'error' }));
    }
  };

  if (!archives.length) return null;

  const columns: Column<ArchivedClose>[] = [
    { header: 'Versión', accessor: (a) => <span className="font-bold text-white">v{a.version}</span>, sortKey: 'version' },
    { header: 'Cerrado', accessor: (a) => `${a.closed_at ?? '—'} · ${a.closed_by || '—'}`, sortKey: 'closed_at' },
    { header: 'Reabierto', accessor: (a) => `${a.reopened_at} · ${a.reopened_by || '—'}`, sortKey: 'reopened_at' },
    { header: 'Motivo', accessor: (a) => <span className="whitespace-normal text-slate-300">{a.reason}</span> },
    { header: 'Pagado', accessor: (a) => formatAmount(a.net_total), align: 'right', sortKey: 'net_total' },
    { header: 'Personas', accessor: 'payments', align: 'right', sortKey: 'payments' },
    {
      header: 'Excel',
      align: 'center',
      accessor: (a) => (
        <ExportButton
          iconOnly
          label={`Descargar la nómina de la versión ${a.version}`}
          icon={<FileSpreadsheet className="h-4 w-4 text-brand" />}
          state={states[a.id] ?? 'idle'}
          onClick={() => void download(a)}
        />
      ),
    },
  ];

  return (
    <section className="space-y-3">
      <SectionHeading
        title="Cierres archivados"
        subtitle="Cada reapertura guarda aquí el cierre que deshizo. No se pueden editar ni borrar."
        icon={<Archive />}
        accent="yellow"
      />
      <DataTable columns={columns} data={archives} pageSize={0} />
    </section>
  );
}
