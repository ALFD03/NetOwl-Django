/** Barra del reporte ETA: periodo, tasa del BCV, exportación y bloqueo del mes. */

import { useState } from 'react';
import { Link } from '@inertiajs/react';
import {
  AlertTriangle, Calendar, DollarSign, Loader2, Lock, RefreshCw, Settings, Unlock,
} from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { FilterField, PeriodSelector, StatusMessage } from '@/shared/ui';
import { EtaFormsExportButton } from './EtaFormsExportButton';
import type { EtaFormularios } from '@/shared/types/subscriptions';

interface EtaReportToolbarProps {
  period: string;
  periods: string[];
  onPeriodChange: (period: string) => void;
  /** Only shown once a report has been successfully computed. */
  showLockToggle: boolean;
  isLocked: boolean;
  isSaving: boolean;
  onToggleLock: () => void;
  /** Las tres hojas del formulario de la reguladora, si el periodo las trae. */
  formularios?: EtaFormularios;
  /** Planes que cuentan en el reporte pero todavía no se declaran. */
  sinRegulador?: string[];
  /** Tasa guardada para el periodo. `0` = todavía sin fijar. */
  tasa: number;
  /** De dónde salió: el día que publicó el BCV, o «Escrita a mano». */
  tasaFuente?: string;
  /** Por qué no hay tasa, cuando la consulta automática falló. */
  tasaAviso?: string;
  onTasaChange: (tasa: number) => void;
  /** Vuelve a pedirle la tasa al BCV, pisando la guardada. */
  onTasaConsultar: () => Promise<void>;
}

/**
 * La tasa del mes: la que trae el BCV, corregible a mano.
 *
 * El reporte la consulta solo la primera vez que hace falta —la tasa del
 * primer día publicado de un mes pasado ya no cambia—, así que aquí solo se
 * enseña, con dos escapes: teclearla, cuando hay que declarar y el servicio no
 * responde, y volver a consultarla, cuando se tecleó de más o el servicio ya
 * responde.
 *
 * Se guarda al salir del campo y no en cada pulsación: cada guardado es una
 * escritura, y guardar «3», «36», «36,5» de camino a «36,50» dejaría en la base
 * de datos tres tasas que nadie quiso.
 */
function TasaBcvField({
  tasa,
  tasaFuente,
  onTasaChange,
  onTasaConsultar,
}: {
  tasa: number;
  tasaFuente?: string;
  onTasaChange: (tasa: number) => void;
  onTasaConsultar: () => Promise<void>;
}) {
  const [texto, setTexto] = useState(tasa ? String(tasa) : '');
  const [consultando, setConsultando] = useState(false);

  // El periodo cambia y con él su tasa: el campo tiene que seguir al reporte,
  // no quedarse con lo que se tecleó para el mes anterior. Se ajusta durante
  // el renderizado y no en un efecto, que provocaría una pintada de más con el
  // valor viejo antes de corregirse.
  const [tasaVista, setTasaVista] = useState(tasa);
  if (tasa !== tasaVista) {
    setTasaVista(tasa);
    setTexto(tasa ? String(tasa) : '');
  }

  const confirmar = () => {
    // La coma es lo que se teclea en español y `Number` no la entiende.
    const valor = Number(texto.replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 0) {
      setTexto(tasa ? String(tasa) : '');
      return;
    }
    if (valor !== tasa) onTasaChange(valor);
  };

  const consultar = async () => {
    setConsultando(true);
    try {
      await onTasaConsultar();
    } finally {
      setConsultando(false);
    }
  };

  return (
    <FilterField
      label="Tasa BCV"
      icon={<DollarSign className="h-4 w-4 text-brand" />}
      title={[
        'Tasa del BCV con la que se declara la renta básica de este mes.',
        tasaFuente ? `Origen: ${tasaFuente}.` : 'Sin fijar: las rentas se exportan vacías.',
      ].join(' ')}
    >
      <input
        type="text"
        inputMode="decimal"
        aria-label="Tasa del BCV"
        value={texto}
        placeholder="Sin fijar"
        onChange={(event) => setTexto(event.target.value)}
        onBlur={confirmar}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        className="w-24 bg-transparent px-4 py-2.5 text-xs font-bold text-white placeholder-slate-500 outline-none"
      />
      <button
        type="button"
        onClick={consultar}
        disabled={consultando}
        title="Volver a consultar la tasa del BCV para este mes"
        aria-label="Volver a consultar la tasa del BCV"
        className="border-l border-slate-700/50 px-3 py-2.5 text-slate-400 transition-colors hover:text-white disabled:opacity-50"
      >
        <RefreshCw className={cn('h-4 w-4', consultando && 'animate-spin')} />
      </button>
    </FilterField>
  );
}

export function EtaReportToolbar({
  period,
  periods,
  onPeriodChange,
  showLockToggle,
  isLocked,
  isSaving,
  onToggleLock,
  formularios,
  sinRegulador,
  tasa,
  tasaFuente,
  tasaAviso,
  onTasaChange,
  onTasaConsultar,
}: EtaReportToolbarProps) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <PeriodSelector
          label="Mes Reporte"
          icon={<Calendar className="h-4 w-4 text-brand" />}
          value={period}
          options={periods}
          onChange={onPeriodChange}
        />

        <TasaBcvField
          tasa={tasa}
          tasaFuente={tasaFuente}
          onTasaChange={onTasaChange}
          onTasaConsultar={onTasaConsultar}
        />

        <Link
          href={`/subscriptions/eta-report/config/?period=${period}`}
          className="flex items-center gap-2 rounded-2xl border border-slate-700/50 bg-surface-secondary px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-300 shadow-2xl transition-colors hover:text-white"
        >
          <Settings className="h-4 w-4 text-brand" /> Gestionar Maestro
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {showLockToggle && (
          <EtaFormsExportButton
            formularios={formularios}
            period={period}
            tasa={tasa}
            sinRegulador={sinRegulador}
          />
        )}

        {showLockToggle && (
          <button
            type="button"
            onClick={onToggleLock}
            disabled={isSaving}
            className={cn(
              'flex items-center gap-2 rounded-2xl px-6 py-2.5 text-[10px] font-black uppercase tracking-widest shadow-xl transition-all',
              isLocked
                ? 'border border-rose-500/30 bg-rose-500/20 text-rose-400'
                : 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-400',
            )}
          >
            {isSaving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            {isLocked ? 'Reporte Bloqueado' : 'Cerrar y Bloquear Mes'}
          </button>
        )}
      </div>

      {/* A ancho completo y no en el `title` del campo: si la consulta falló,
          las rentas del libro saldrán vacías y eso hay que verlo sin pasar el
          ratón por encima. */}
      <StatusMessage
        status={tasaAviso ? { type: 'warning', text: tasaAviso } : null}
        icon={<AlertTriangle />}
        className="w-full"
      />
    </div>
  );
}
