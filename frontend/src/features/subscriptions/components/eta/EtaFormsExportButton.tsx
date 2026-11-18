/** Descarga las tres hojas del formulario que se declara a la reguladora. */

import { useState } from 'react';
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { downloadSheetsAsExcel } from '@/shared/lib/excel';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { ExportButton, SelectMenu, StatusMessage, type ExportState } from '@/shared/ui';
import {
  etaFormFileName,
  etaFormSheets,
  formRowCount,
} from '../../lib/etaFormsExport';
import type { EtaForms } from '@/shared/types/subscriptions';

interface EtaFormsExportButtonProps {
  /** Las tres hojas ya calculadas. Ausentes hasta que el periodo se recalcule. */
  forms?: EtaForms;
  period: string;
  /** Tasa del BCV del periodo. `0` = sin fijar: las rentas salen vacías. */
  rate: number;
  /** Última tasa publicada. `0` cuando no se pudo leer: no se ofrece. */
  currentRate?: number;
  /** De qué día es esa tasa, para poder elegir a ciegas. */
  currentRateSource?: string;
  /** Planes que cuentan en el reporte pero no tienen plan regulador asignado. */
  withoutRegulatory?: string[];
  className?: string;
}

/** Con qué tasa se valoran las rentas del libro. */
type RateSource = 'mes' | 'actual';

/**
 * Escribe el libro en el navegador, con lo que el reporte ya trae.
 *
 * No pide nada al servidor: las filas viajan dentro del reporte del periodo,
 * que es lo que hace que un mes bloqueado exporte lo que se declaró y no lo
 * que saldría hoy.
 *
 * Lo único que se elige al exportar es **con qué tasa se convierte la renta**:
 * la del mes —la que fija la declaración a la reguladora— o la vigente, que
 * responde a otra pregunta, cuánto costaría hoy ese mismo parque. Son las
 * filas las mismas; solo cambian las columnas en bolívares, y por eso es una
 * opción del botón y no otro reporte.
 *
 * Se avisa de dos cosas sin bloquear la descarga, porque el formulario sigue
 * siendo útil a medias y quien lo declara necesita verlo:
 *
 * - **Sin tasa fijada**, las columnas de renta salen vacías.
 * - **Exportando a la tasa de hoy**, que no es la del mes declarado.
 * - **Planes sin plan regulador**, que cuentan en las matrices del reporte
 *   pero no tienen fila con la que declararse.
 */
export function EtaFormsExportButton({
  forms,
  period,
  rate,
  currentRate: currentRate = 0,
  currentRateSource,
  withoutRegulatory: withoutRegulator = [],
  className,
}: EtaFormsExportButtonProps) {
  const [state, setState] = useState<ExportState>('idle');
  const [error, setError] = useState<string | null>(null);
  // La del mes por defecto: es la que se declara. Exportar a la tasa de hoy es
  // la excepción, y tiene que costar un clic elegirla.
  const [source, setSource] = useState<RateSource>('mes');

  // Elegir «hoy» y que luego la consulta al BCV falle dejaría exportando a
  // cero sin decirlo; mientras no haya tasa vigente, la elección no existe.
  const canChoose = currentRate > 0;
  const usesCurrent = canChoose && source === 'actual';
  const usedRate = usesCurrent ? currentRate : rate;

  const rows = formRowCount(forms);
  // Un periodo bloqueado antes de que existieran los formularios sirve el JSON
  // que se guardó entonces, y ese no los trae: hay que recalcularlo.
  const notComputed = !forms;

  const handleClick = async () => {
    if (!forms || rows === 0) {
      setState('empty');
      return;
    }
    setState('busy');
    setError(null);
    try {
      await downloadSheetsAsExcel(
        etaFormSheets(forms, usedRate),
        etaFormFileName(period, usesCurrent ? 'tasa de hoy' : ''),
      );
      setState('idle');
    } catch (err) {
      // El motivo se enseña, no solo se registra. «No se pudo exportar» a secas
      // obliga a abrir la consola para saber si el libro está mal formado o si
      // el navegador bloqueó la descarga, y son dos problemas de quien lo
      // arregla distintos. La traza sigue yendo a la consola.
      console.error('Fallo al generar los formularios de la reguladora:', err);
      setError(getApiErrorMessage(err, 'El navegador no pudo escribir el libro.'));
      setState('error');
    }
  };

  const warnings = [
    notComputed
      ? 'Este periodo se calculó antes de que existieran los formularios: recalcúlalo para poder exportarlos.'
      : '',
    usedRate > 0
      ? ''
      : 'Sin tasa del BCV fijada: las columnas de renta básica saldrán vacías.',
    withoutRegulator.length
      ? `${withoutRegulator.length} plan(es) sin plan regulador asignado quedan fuera del formulario: ${withoutRegulator.slice(0, 5).join(', ')}${withoutRegulator.length > 5 ? '…' : ''}`
      : '',
  ].filter(Boolean);

  const locked = !period || notComputed || rows === 0;

  return (
    <div className="flex flex-col items-start gap-2">
      {/* Una sola cápsula, la misma de los filtros de la barra: la acción y la
          tasa con la que se convierte son la misma decisión —qué libro sale—,
          y separarlas en dos controles sueltos hacía parecer que eran dos
          exportaciones distintas. */}
      <div
        className={cn(
          'flex items-stretch overflow-hidden rounded-2xl border border-slate-700/50 bg-surface-secondary shadow-2xl transition-colors',
          !locked && 'hover:border-brand/40',
          className,
        )}
      >
        {/* `seamless`: el borde y el radio los pone la cápsula, no el botón. */}
        <ExportButton
          seamless
          onClick={handleClick}
          state={state}
          label="Exportar formularios"
          labelEmpty="Nada que declarar"
          icon={<FileSpreadsheet className="h-4 w-4 text-brand" />}
          disabled={locked}
          title={[
            `Descargar las tres hojas del formulario de ${period} (internet, transporte y televisión).`,
            ...warnings,
          ].join(' ')}
        />

        {/* Deshabilitado y no oculto cuando no hay tasa vigente: que la cápsula
            cambie de forma según responda un tercero es más desconcertante que
            un selector que dice a qué tasa sale y por qué no hay otra. El
            origen va en el `title` y no en la etiqueta: la fecha de la tasa
            importa al elegirla, no cada vez que se mira la barra. */}
        <div
          className="flex"
          title={
            canChoose
              ? [
                  'Tasa con la que se convierten las rentas del libro.',
                  '«Del mes» es la que declara el periodo;',
                  `«de hoy» es la última publicada${currentRateSource ? ` (${currentRateSource})` : ''}.`,
                ].join(' ')
              : 'Solo la tasa del mes: no se pudo leer la tasa vigente del BCV.'
          }
        >
          <SelectMenu
            value={usesCurrent ? 'actual' : 'mes'}
            options={
              canChoose
                ? [
                    { value: 'mes', label: 'Tasa del mes' },
                    { value: 'actual', label: 'Tasa de hoy' },
                  ]
                : [{ value: 'mes', label: 'Tasa del mes' }]
            }
            onChange={(value) => setSource(value as RateSource)}
            disabled={!canChoose}
            aria-label="Tasa con la que se convierten las rentas"
            panelWidth={180}
            className={cn(
              'min-w-[132px] border-l border-slate-700/50 py-2.5 pl-4 pr-3 text-[10px] font-black uppercase tracking-wider outline-none transition-colors hover:bg-white/5 hover:text-white',
              usesCurrent ? 'text-brand-light' : 'text-slate-400',
            )}
          />
        </div>
      </div>

      {/* Los avisos no impiden exportar pero cambian lo que sale en el libro,
          así que se leen antes de pulsar y no en el `title`. El error se lee
          después, y por eso van los dos aquí. */}
      <StatusMessage
        status={
          error
            ? { type: 'error', text: error }
            : warnings.length
              ? { type: 'warning', text: warnings.join(' ') }
              : null
        }
        icon={<AlertTriangle />}
        className="max-w-lg"
      />
    </div>
  );
}
