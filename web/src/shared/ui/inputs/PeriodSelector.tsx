import React, { useMemo } from 'react';
import { formatPeriodoLabel } from '@/shared/utils';

import { SelectMenu } from './SelectMenu';

interface Props {
  label?: string;
  icon?: React.ReactNode;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  className?: string;
}

/**
 * Selector de periodo.
 *
 * Usaba un `<select>` nativo. El menu nativo lo dibuja y posiciona el
 * navegador contra la caja sin transformar, asi que dentro de los contenedores
 * animados de framer-motion (el contenido de la pagina anima `y`, los modales
 * animan `scale`) aparecia desplazado sobre el contenido de arriba, y se
 * cerraba solo en cuanto algo reajustaba el layout. Ahora el menu es propio y
 * se dibuja en un portal anclado al boton.
 */
export function PeriodSelector({ label = 'Mes', icon, value, options, onChange, className = '' }: Props) {
  const opciones = useMemo(
    () => options.map((p) => ({ value: p, label: formatPeriodoLabel(p) })),
    [options],
  );

  return (
    <div className={`flex items-center overflow-hidden rounded-2xl border border-slate-700/50 bg-surface-secondary shadow-2xl ${className}`}>
      <div className="flex items-center gap-2 border-r border-slate-700/50 bg-slate-800/50 px-4 py-2.5 text-slate-400">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
      </div>
      <SelectMenu
        value={value}
        options={opciones}
        onChange={onChange}
        placeholder="Sin periodos"
        aria-label={label}
        panelWidth={220}
        className="flex cursor-pointer items-center gap-2 py-2.5 pl-4 pr-3 text-xs font-bold text-white outline-none hover:bg-white/5"
      />
    </div>
  );
}
