/** Comisiones › Informe › Indicadores: todo lo que se escribe a mano antes de leer la nómina. */

import type { ReactNode } from 'react';
import { Building2, Network, Users } from 'lucide-react';

import { Paginacion, usePaginacion } from '@/shared/ui';
import { detalleCumplimiento, formatoMonto, formatoPct, origenCumplimiento } from '../lib/formato';
import type { InformeComision, PagoComision } from '../types';
import { ValorEditable } from './ValorEditable';

interface IndicadoresPanelProps {
  informe: InformeComision;
  editable: boolean;
  onCumplimiento: (personaId: number, valor: number | null) => void;
  onCrecimiento: (personaId: number, valor: number | null) => void;
}

const porNombre = (a: PagoComision, b: PagoComision) => a.nombre.localeCompare(b.nombre);

/**
 * Filas por página de cada lista. Las tres muestran siempre las mismas —las que
 * faltan se rellenan con huecos— y las que tienen más se paginan: así las tres
 * columnas miden lo mismo y una fila de una queda a la altura de la de al lado.
 */
const FILAS = 8;

/** Lo que mide una fila (`h-14`): nombre, nota y el valor editable. */
const ALTO_FILA = 'h-14';

/** El pie de la lista, con o sin botones: la misma altura en las tres columnas. */
const ALTO_PIE = 'min-h-[2.875rem]';

function Columna({
  titulo, icono, tono, pendientes, children, vacio,
}: { titulo: string; icono: ReactNode; tono: string; pendientes: number; children: ReactNode[]; vacio: string }) {
  const paginas = usePaginacion(children, FILAS);
  const huecos = FILAS - paginas.visibles.length;
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-surface-primary/50">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <span className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-wider ${tono}`}>{icono}{titulo}</span>
        {pendientes > 0
          ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">{pendientes} sin definir</span>
          : <span className="text-[10px] text-slate-500">completo</span>}
      </div>
      <div className="relative divide-y divide-slate-800/60">
        {paginas.visibles}
        {Array.from({ length: huecos }, (_, i) => (
          <div key={`hueco-${i}`} aria-hidden className={`${ALTO_FILA} !border-transparent`} />
        ))}
        {!children.length && (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-slate-500">{vacio}</p>
        )}
      </div>
      {paginas.totalPaginas > 1 ? (
        <Paginacion estado={paginas} className={`mt-auto ${ALTO_PIE}`} />
      ) : (
        <div className={`mt-auto flex items-center border-t border-slate-800 bg-surface-secondary/50 px-3 py-2 ${ALTO_PIE}`}>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            {children.length === 1 ? '1 persona' : `${children.length} personas`}
          </span>
        </div>
      )}
    </div>
  );
}

function Fila({ nombre, nota, titulo, children }: { nombre: string; nota?: ReactNode; titulo?: string; children: ReactNode }) {
  return (
    <div className={`flex ${ALTO_FILA} items-center justify-between gap-3 px-4`} title={titulo}>
      <span className="min-w-0">
        <span className="block truncate text-sm text-white">{nombre}</span>
        {nota && <span className="block truncate text-[11px] text-slate-500">{nota}</span>}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{children}</span>
    </div>
  );
}

/**
 * Los % que mueven el pago, en una sola pantalla: el cumplimiento de cada
 * supervisor y coordinadora de oficina —calculado del % Ventas de su site, o
 * escrito a mano para quien no tenga cálculo— y el crecimiento de cada
 * coordinador de UN. No hay un cumplimiento general del periodo. Juntos se comparan entre sí, y un 9 que debía ser 90
 * salta a la vista.
 *
 * Lo calculado sale como valor por defecto de cada fila; escribir uno lo
 * sustituye para esa persona, y borrarlo vuelve al calculado.
 */
export function IndicadoresPanel({ informe, editable, onCumplimiento, onCrecimiento }: IndicadoresPanelProps) {
  const de = (cargo: PagoComision['cargo']) => informe.pagos.filter((p) => p.cargo === cargo).sort(porNombre);
  const coordinadores = de('coord_un');
  const supervisores = de('supervisor');
  const oficinas = de('coord_oficina');

  const cumplimiento = (p: PagoComision) => {
    const calculado = p.cumplimiento?.calculado ?? null;
    const detalle = detalleCumplimiento(p);
    // Lo que rige si no se escribe nada: el calculado.
    const porDefecto = calculado !== null
      ? `${formatoPct(calculado)} · ${p.cumplimiento?.fuente_calculo === 'unidad' && (p.cumplimiento?.sites.length ?? 0) > 1 ? 'promedio UN' : 'site'}`
      : 'sin definir';
    return (
      <Fila
        key={p.persona_id}
        nombre={p.nombre}
        nota={`${origenCumplimiento(p)} · ${p.ventas_propias + p.ventas_equipo} ventas · ${formatoMonto(p.bruto)} antes del %`}
        titulo={detalle || undefined}
      >
        <ValorEditable
          key={`cump-${p.persona_id}-${p.cumplimiento_propio}`}
          valor={p.cumplimiento_propio}
          vacio={porDefecto}
          vacioPendiente={calculado === null}
          editable={editable}
          onGuardar={(v) => onCumplimiento(p.persona_id, v)}
        />
      </Fila>
    );
  };
  // Lo mismo que impide cerrar: quien cobra algo sin ningún % que aplicarle.
  const sinCumplimiento = (lista: PagoComision[]) =>
    lista.filter((p) => p.cumplimiento_pct === null && p.bruto).length;

  return (
    <div className="space-y-5">
      <p className="max-w-4xl rounded-2xl border border-slate-800 bg-surface-primary/50 px-5 py-4 text-xs text-slate-400">
        Cada coordinadora de oficina toma el % Ventas de su site, y cada supervisor el de los sites de su coordinador de UN
        (promediados si son varios); nada se deduce de las ventas. Quien no tenga site o UN asignada se escribe a mano en su fila;
        lo escrito manda sobre lo calculado, y borrarlo vuelve al calculado. Pasa el ratón por una fila para ver el cálculo.
        Tope en 100 %.
      </p>

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
