/** Las ventas «por facturar» que siguen en progreso, y lo que se decidió con cada una. */

import { useState } from 'react';
import { CalendarClock, CheckCircle2, Undo2 } from 'lucide-react';

import { Button, DataTable, MonthPicker, type Column } from '@/shared/ui';
import { formatoFecha, mesSiguiente } from '../lib/formato';
import type { VentaComision } from '../types';

interface RevisionTablaProps {
  periodo: string;
  ventas: VentaComision[];
  editable: boolean;
  guardando: boolean;
  onDecidir: (ordenes: string[], decision: '' | 'contar' | 'diferir', destino?: string) => void;
}

/**
 * Sin primera factura no se sabe si la campaña exoneró un mes o si algo falló,
 * así que se decide a mano: **contarla** en este periodo o **diferirla** a uno
 * posterior, donde vuelve a aparecer y se clasifica con lo que diga entonces
 * su factura. Las que llegaron diferidas de otro periodo se marcan como tales.
 *
 * Un mes puede traer cientos, así que las pendientes también se deciden en
 * bloque; lo filtrado en la tabla no cuenta, el bloque son todas.
 */
export function RevisionTabla({ periodo, ventas, editable, guardando, onDecidir }: RevisionTablaProps) {
  const [destinos, setDestinos] = useState<Record<string, string>>({});
  const destino = (orden: string) => destinos[orden] ?? mesSiguiente(periodo);
  const [destinoBloque, setDestinoBloque] = useState(mesSiguiente(periodo));
  const pendientes = ventas.filter((v) => !v.decision && !v.diferida_desde).map((v) => v.orden);

  const columnas: Column<VentaComision>[] = [
    { header: 'Orden', accessor: 'orden', sortKey: 'orden', sticky: true },
    { header: 'Cliente', accessor: 'cliente', sortKey: 'cliente' },
    { header: 'Instalada', accessor: (row) => formatoFecha(row.fecha_inicio), sortKey: 'fecha_inicio' },
    { header: 'Plan', accessor: 'producto', sortKey: 'producto' },
    { header: 'Medio', accessor: (row) => row.medio || '—' },
    {
      header: 'Situación',
      accessor: (row) => {
        if (row.diferida_desde) return `Diferida desde ${row.diferida_desde}`;
        if (row.decision === 'contar') return 'Se cuenta en este periodo';
        if (row.decision === 'diferir') return `Diferida a ${row.periodo_destino}`;
        return <span className="text-amber-400">Por decidir</span>;
      },
      filterable: true,
      filterValue: (row) => (row.diferida_desde ? 'Diferida aquí' : row.decision ?? 'Por decidir'),
    },
    {
      header: 'Decisión',
      align: 'right',
      accessor: (row) => {
        if (!editable || row.diferida_desde) return null;
        if (row.decision) {
          return (
            <Button size="sm" variant="outline" icon={<Undo2 className="h-4 w-4" />} disabled={guardando} onClick={() => onDecidir([row.orden], '')}>
              Deshacer
            </Button>
          );
        }
        return (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={guardando} onClick={() => onDecidir([row.orden], 'contar')}>
              Contar
            </Button>
            <MonthPicker
              className="w-32"
              value={destino(row.orden)}
              onChange={(mes) => setDestinos((d) => ({ ...d, [row.orden]: mes }))}
            />
            <Button
              size="sm"
              variant="outline"
              icon={<CalendarClock className="h-4 w-4" />}
              disabled={guardando}
              onClick={() => onDecidir([row.orden], 'diferir', destino(row.orden))}
            >
              Diferir
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      {editable && pendientes.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-800 p-4">
          <span className="mr-auto text-xs text-slate-400">{pendientes.length} por decidir</span>
          <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={guardando} onClick={() => onDecidir(pendientes, 'contar')}>
            Contar todas
          </Button>
          <MonthPicker className="w-32" value={destinoBloque} onChange={setDestinoBloque} />
          <Button
            size="sm"
            variant="outline"
            icon={<CalendarClock className="h-4 w-4" />}
            disabled={guardando}
            onClick={() => onDecidir(pendientes, 'diferir', destinoBloque)}
          >
            Diferir todas
          </Button>
        </div>
      )}
      <DataTable
        columns={columnas}
        data={ventas}
        searchable
        searchPlaceholder="Buscar orden o cliente..."
        emptyMessage="No hay ventas por facturar que sigan en progreso."
      />
    </>
  );
}
