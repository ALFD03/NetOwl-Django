import React, { useMemo } from 'react';
import { formatPeriodoLabel } from '@/shared/utils';

import { FilterField, FILTER_TRIGGER_CLASS } from './FilterField';
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
    <FilterField label={label} icon={icon} className={className}>
      <SelectMenu
        value={value}
        options={opciones}
        onChange={onChange}
        placeholder="Sin periodos"
        aria-label={label}
        panelWidth={220}
        className={FILTER_TRIGGER_CLASS}
      />
    </FilterField>
  );
}
