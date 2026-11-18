/** Barra del reporte ETA: periodo, tasas del BCV, exportación y bloqueo del mes. */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Calendar, DollarSign, Loader2, Lock, RefreshCw, Settings, TrendingUp, Unlock,
} from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { FilterField, PeriodSelector, StatusMessage } from '@/shared/ui';
import { EtaFormsExportButton } from './EtaFormsExportButton';
import { useCurrentBcvRate } from '../../hooks/useCurrentBcvRate';
import type { EtaForms } from '@/shared/types/subscriptions';

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
  forms?: EtaForms;
  /** Planes que cuentan en el reporte pero todavía no se declaran. */
  withoutRegulatory?: string[];
  /** Tasa guardada para el periodo. `0` = todavía sin fijar. */
  rate: number;
  /** De dónde salió: el día que publicó el BCV, o «Escrita a mano». */
  rateSource?: string;
  /** Por qué no hay tasa, cuando la consulta automática falló. */
  rateNotice?: string;
  onRateChange: (tasa: number) => void;
  /** Vuelve a pedirle la tasa al BCV, pisando la guardada. */
  onRateFetch: () => Promise<void>;
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
function BcvRateField({
  rate,
  rateSource: tasaFuente,
  onRateChange: onTasaChange,
  onRateFetch: onTasaConsultar,
}: {
  rate: number;
  rateSource?: string;
  onRateChange: (tasa: number) => void;
  onRateFetch: () => Promise<void>;
}) {
  const [texto, setText] = useState(rate ? String(rate) : '');
  const [consultando, setConsultando] = useState(false);

  // El periodo cambia y con él su tasa: el campo tiene que seguir al reporte,
  // no quedarse con lo que se tecleó para el mes anterior. Se ajusta durante
  // el renderizado y no en un efecto, que provocaría una pintada de más con el
  // valor viejo antes de corregirse.
  const [viewedRate, setViewedRate] = useState(rate);
  if (rate !== viewedRate) {
    setViewedRate(rate);
    setText(rate ? String(rate) : '');
  }

  const confirmar = () => {
    // La coma es lo que se teclea en español y `Number` no la entiende.
    const valor = Number(texto.replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 0) {
      setText(rate ? String(rate) : '');
      return;
    }
    if (valor !== rate) onTasaChange(valor);
  };

  const fetchData = async () => {
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
        onChange={(event) => setText(event.target.value)}
        onBlur={confirmar}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        className="w-24 min-w-0 flex-1 bg-transparent px-4 py-2.5 text-xs font-bold text-white placeholder-slate-500 outline-none sm:flex-none"
      />
      <button
        type="button"
        onClick={fetchData}
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

/**
 * La tasa de hoy, al lado de la del mes.
 *
 * Se enseña sin poder editarla, y es la diferencia con la del mes: aquella es
 * un dato del periodo que se declara y se puede corregir a mano; esta es lo
 * que el BCV publica hoy, y escribirla a mano no querría decir nada. Solo sirve
 * para dos cosas: comparar de un vistazo cuánto se ha movido desde que se
 * declaró, y exportar el formulario valorado a día de hoy.
 */
function CurrentRateField({
  rate,
  fuente,
  cargando,
  onRecargar,
}: {
  rate: number;
  fuente: string;
  cargando: boolean;
  onRecargar: () => Promise<void>;
}) {
  return (
    <FilterField
      label="Tasa hoy"
      icon={<TrendingUp className="h-4 w-4 text-brand" />}
      title={[
        'Última tasa publicada por el BCV. No es la que declara el periodo:',
        'sirve para exportar el formulario valorado a día de hoy.',
        fuente ? `Origen: ${fuente}.` : '',
      ].filter(Boolean).join(' ')}
    >
      <span className="flex-1 px-4 py-2.5 text-xs font-bold text-white sm:flex-none">
        {rate > 0 ? rate.toLocaleString('es-VE', { maximumFractionDigits: 4 }) : '—'}
      </span>
      <button
        type="button"
        onClick={() => { void onRecargar(); }}
        disabled={cargando}
        title="Volver a consultar la tasa vigente del BCV"
        aria-label="Volver a consultar la tasa vigente del BCV"
        className="border-l border-slate-700/50 px-3 py-2.5 text-slate-400 transition-colors hover:text-white disabled:opacity-50"
      >
        <RefreshCw className={cn('h-4 w-4', cargando && 'animate-spin')} />
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
  forms,
  withoutRegulatory: sinRegulador,
  rate,
  rateSource: tasaFuente,
  rateNotice: tasaAviso,
  onRateChange: onTasaChange,
  onRateFetch: onTasaConsultar,
}: EtaReportToolbarProps) {
  // La tasa vigente no se guarda en ninguna parte: no es un dato del periodo,
  // cambia cada día y su sitio es la pantalla, no la tabla del reporte.
  const tasaActual = useCurrentBcvRate();

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

        <BcvRateField
          rate={rate}
          rateSource={tasaFuente}
          onRateChange={onTasaChange}
          onRateFetch={onTasaConsultar}
        />

        <CurrentRateField
          rate={tasaActual.rate}
          fuente={tasaActual.fuente}
          cargando={tasaActual.cargando}
          onRecargar={tasaActual.recargar}
        />

        <Link
          to={`/subscriptions/eta-report/config/?period=${period}`}
          className="flex items-center gap-2 rounded-2xl border border-slate-700/50 bg-surface-secondary px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-300 shadow-2xl transition-colors hover:text-white"
        >
          <Settings className="h-4 w-4 text-brand" /> Gestionar Maestro
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {showLockToggle && (
          <EtaFormsExportButton
            forms={forms}
            period={period}
            rate={rate}
            currentRate={tasaActual.rate}
            currentRateSource={tasaActual.fuente}
            withoutRegulatory={sinRegulador}
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
        status={
          tasaAviso || tasaActual.aviso
            ? { type: 'warning', text: [tasaAviso, tasaActual.aviso].filter(Boolean).join(' ') }
            : null
        }
        icon={<AlertTriangle />}
        className="w-full"
      />
    </div>
  );
}
