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
  archivos: ArchivedClose[];
  roleLabel: (rol: SalesRole) => string;
}

export function ArchivedCloses({ archivos, roleLabel: etiquetaCargo }: Props) {
  const [estados, setStates] = useState<Record<number, ExportState>>({});

  /** La nómina del cierre archivado, en el mismo Excel que el informe vivo. */
  const descargar = async (archivo: ArchivedClose) => {
    setStates((previos) => ({ ...previos, [archivo.id]: 'busy' }));
    try {
      const copia = await commissionsApi.archivo<CloseSnapshot>(archivo.id);
      const tasa = copia.resumen.tasa_conatel?.tasa
        ?? (copia.periodo.tasa_conatel !== null ? Number(copia.periodo.tasa_conatel) : null);
      await exportReport(
        copia.resumen,
        copia.ventas.map((venta) => venta.datos),
        copia.condiciones,
        tasa,
        etiquetaCargo,
        `Comisiones ${copia.periodo.periodo} - cierre archivado v${archivo.version}`,
      );
      setStates((previos) => ({ ...previos, [archivo.id]: 'idle' }));
    } catch (err) {
      console.error('No se pudo descargar el cierre archivado:', err);
      setStates((previos) => ({ ...previos, [archivo.id]: 'error' }));
    }
  };

  if (!archivos.length) return null;

  const columns: Column<ArchivedClose>[] = [
    { header: 'Versión', accessor: (a) => <span className="font-bold text-white">v{a.version}</span>, sortKey: 'version' },
    { header: 'Cerrado', accessor: (a) => `${a.cerrado_en ?? '—'} · ${a.cerrado_por || '—'}`, sortKey: 'cerrado_en' },
    { header: 'Reabierto', accessor: (a) => `${a.reabierto_en} · ${a.reabierto_por || '—'}`, sortKey: 'reabierto_en' },
    { header: 'Motivo', accessor: (a) => <span className="whitespace-normal text-slate-300">{a.motivo}</span> },
    { header: 'Pagado', accessor: (a) => formatAmount(a.total_neto), align: 'right', sortKey: 'total_neto' },
    { header: 'Personas', accessor: 'pagos', align: 'right', sortKey: 'pagos' },
    {
      header: 'Excel',
      align: 'center',
      accessor: (a) => (
        <ExportButton
          iconOnly
          label={`Descargar la nómina de la versión ${a.version}`}
          icon={<FileSpreadsheet className="h-4 w-4 text-brand" />}
          estado={estados[a.id] ?? 'idle'}
          onClick={() => void descargar(a)}
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
      <DataTable columns={columns} data={archivos} pageSize={0} />
    </section>
  );
}
