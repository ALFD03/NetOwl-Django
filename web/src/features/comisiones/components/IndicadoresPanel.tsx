/** Comisiones › Informe › Indicadores: todo lo que se escribe a mano antes de leer la nómina. */

import type { ReactNode } from 'react';
import { Building2, Network, Users } from 'lucide-react';

import { formatoMonto, formatoPct } from '../lib/formato';
import type { InformeComision, PagoComision } from '../types';
import { ValorEditable } from './ValorEditable';

interface IndicadoresPanelProps {
  informe: InformeComision;
  editable: boolean;
  onGeneral: (valor: number | null) => void;
  onCumplimiento: (personaId: number, valor: number | null) => void;
  onCrecimiento: (personaId: number, valor: number | null) => void;
}

const porNombre = (a: PagoComision, b: PagoComision) => a.nombre.localeCompare(b.nombre);

function Columna({
  titulo, icono, tono, pendientes, children, vacio,
}: { titulo: string; icono: ReactNode; tono: string; pendientes: number; children: ReactNode[]; vacio: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-slate-800 bg-surface-primary/50">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <span className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-wider ${tono}`}>{icono}{titulo}</span>
        {pendientes > 0
          ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">{pendientes} sin definir</span>
          : <span className="text-[10px] text-slate-500">completo</span>}
      </div>
      {children.length ? <div className="divide-y divide-slate-800/60">{children}</div> : <p className="px-4 py-6 text-center text-xs text-slate-500">{vacio}</p>}
    </div>
  );
}

function Fila({ nombre, nota, children }: { nombre: string; nota?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-sm text-white">{nombre}</span>
        {nota && <span className="block text-[11px] text-slate-500">{nota}</span>}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{children}</span>
    </div>
  );
}

/**
 * Los % que mueven el pago, en una sola pantalla: el cumplimiento general, el
 * propio de quien lo tenga distinto y el crecimiento de cada coordinador de UN.
 * Juntos se comparan entre sí, y un 9 que debía ser 90 salta a la vista.
 */
export function IndicadoresPanel({ informe, editable, onGeneral, onCumplimiento, onCrecimiento }: IndicadoresPanelProps) {
  const general = informe.cumplimiento_general_pct;
  const de = (cargo: PagoComision['cargo']) => informe.pagos.filter((p) => p.cargo === cargo).sort(porNombre);
  const coordinadores = de('coord_un');
  const supervisores = de('supervisor');
  const oficinas = de('coord_oficina');

  const cumplimiento = (p: PagoComision) => (
    <Fila key={p.persona_id} nombre={p.nombre} nota={`${p.ventas_propias + p.ventas_equipo} ventas · ${formatoMonto(p.bruto)} antes del %`}>
      <ValorEditable
        key={`cump-${p.persona_id}-${p.cumplimiento_propio}`}
        valor={p.cumplimiento_propio}
        vacio={general === null ? 'sin definir' : `${formatoPct(general)} general`}
        vacioPendiente={general === null}
        editable={editable}
        onGuardar={(v) => onCumplimiento(p.persona_id, v)}
      />
    </Fila>
  );
  // Lo mismo que impide cerrar: quien cobra algo sin ningún % que aplicarle.
  const sinCumplimiento = (lista: PagoComision[]) =>
    (general === null ? lista.filter((p) => p.cumplimiento_propio === null && p.bruto).length : 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-surface-primary/50 px-5 py-4">
        <div className="max-w-2xl">
          <p className="text-sm font-bold text-white">Cumplimiento general del periodo</p>
          <p className="text-xs text-slate-400">
            Vale para todos los supervisores y coordinadores de oficina. Quien tenga uno distinto lo lleva abajo; borrarlo lo devuelve al general.
            Tope en 100 %.
          </p>
        </div>
        <span className="rounded-xl border border-slate-700 bg-surface-primary px-3 py-2 text-base font-black">
          <ValorEditable key={`general-${general}`} valor={general} vacio="sin definir" editable={editable} onGuardar={onGeneral} />
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Columna
          titulo="Crecimiento · coord. de UN"
          icono={<Network className="h-4 w-4" />}
          tono="text-violet-300"
          pendientes={coordinadores.filter((p) => p.crecimiento_pct === null && p.ventas_equipo).length}
          vacio="Ningún coordinador de UN cobra este periodo."
        >
          {coordinadores.map((p) => (
            <Fila
              key={p.persona_id}
              nombre={p.nombre}
              nota={
                p.crecimiento_fuente === 'manual'
                  ? `escrito a mano${p.crecimiento_calculado !== null ? ` · calculado ${formatoPct(p.crecimiento_calculado)}` : ''}`
                  : p.crecimiento_fuente === 'unidades de negocio'
                    ? `de Unidades de negocio → ${formatoMonto(p.detalle.monto_por_venta_equipo ?? 0)}/venta`
                    : 'el mes no está analizado: escríbelo'
              }
            >
              <ValorEditable
                key={`crec-${p.persona_id}-${p.crecimiento_pct}`}
                valor={p.crecimiento_pct}
                vacio="desconocido"
                editable={editable}
                onGuardar={(v) => onCrecimiento(p.persona_id, v)}
              />
            </Fila>
          ))}
        </Columna>
        <Columna
          titulo="Cumplimiento · supervisores"
          icono={<Users className="h-4 w-4" />}
          tono="text-emerald-300"
          pendientes={sinCumplimiento(supervisores)}
          vacio="Ningún supervisor cobra este periodo."
        >
          {supervisores.map(cumplimiento)}
        </Columna>
        <Columna
          titulo="Cumplimiento · oficinas"
          icono={<Building2 className="h-4 w-4" />}
          tono="text-sky-300"
          pendientes={sinCumplimiento(oficinas)}
          vacio="Ninguna oficina cobra este periodo."
        >
          {oficinas.map(cumplimiento)}
        </Columna>
      </div>
    </div>
  );
}
