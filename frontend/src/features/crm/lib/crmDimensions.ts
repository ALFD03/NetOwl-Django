/** Selecciona las filas de una dimensión dentro de la respuesta del periodo. */

import type { CrmDimensionRow, CrmDimensionValue } from '../types';

/** Hoists `metrics` to the top level so charts and tables read one flat row. */
function flatten(row: CrmDimensionRow): CrmDimensionValue {
  return {
    ...(row.metrics ?? {}),
    value: row.value,
    effectiveness: row.effectiveness ?? row.metrics?.effectiveness ?? [],
  };
}

/** Flat rows of one dimension (`sucursal`, `campana`, `vendedor`) out of a mixed list. */
export function selectCrmDimension(
  rows: CrmDimensionRow[],
  dimension: string,
): CrmDimensionValue[] {
  return rows.filter((row) => row.dimension === dimension).map(flatten);
}
