/** La tabla de una dimensión, con acceso al desglose de cada valor. */

import { useMemo, useState } from 'react';
import { Building2, MapPin, MousePointerClick, Users, X } from 'lucide-react';

import {
  DataTable, EmptyState, ExcelExportButton, MetricCard, NeonContainer, ToggleGroup,
} from '@/shared/ui';
import {
  SUPPORT_DEPARTMENT_EXCEL_COLUMNS,
  SUPPORT_DIMENSION_EXCEL_COLUMNS,
  supportExportFileName,
} from '../../lib/supportExport';
import {
  groupByDepartment,
  dimensionLeaders,
  NO_DEPARTMENT,
  SUPPORT_DIMENSION_CAPTIONS,
  SUPPORT_DIMENSION_LABELS,
} from '../../lib/supportMetrics';
import { isPersonDimension, type SupportDimension, type SupportDimensionRow } from '../../types';
import { SUPPORT_DEPARTMENT_COLUMNS, SUPPORT_DIMENSION_COLUMNS } from './supportColumns';

interface Props {
  dimension: SupportDimension;
  rows: SupportDimensionRow[];
  /** Sólo para nombrar el archivo exportado. */
  groupName: string;
  period: string;
  onSelect: (valor: string) => void;
}

/** Las dos lecturas de un eje de persona. */
type PersonView = 'persona' | 'departamento';

/**
 * The values of the selected first-level axis inside the group.
 *
 * Clicking a row opens its tipo / razón / solución breakdown, which the backend
 * computes on request rather than storing — see `fetchSupportBreakdown`.
 *
 * En los dos ejes de persona —quién abrió el ticket y quién responde de él— el
 * panel ofrece además la lectura por **departamento**, que es la misma tabla
 * sumada por el área a la que pertenece cada quien según el directorio de
 * `/support/users/`. Es una vista y no una dimensión más: se calcula aquí,
 * sobre las filas que ya están en pantalla, así que corregir el departamento de
 * alguien se ve al recargar y no exige reanalizar el mes.
 *
 * Un departamento no tiene desglose propio: pinchar su fila filtra la tabla de
 * personas a su gente, que es donde el drill-down sí existe.
 */
export function SupportDimensionPanel({ dimension, rows, groupName, period, onSelect }: Props) {
  const label = SUPPORT_DIMENSION_LABELS[dimension];
  const caption = SUPPORT_DIMENSION_CAPTIONS[dimension];
  const isPerson = isPersonDimension(dimension);

  const [vista, setVista] = useState<PersonView>('persona');
  const [filtro, setFilter] = useState<string | null>(null);

  // El denominador es el del grupo, no el de lo que se ve: `pctOfParent` ya
  // viene calculado contra el total del grupo y los departamentos tienen que
  // leerse contra el mismo, o las dos vistas dejarían de cuadrar entre sí.
  const groupTotal = useMemo(
    () => rows.reduce((acc, row) => acc + Number(row.total_tickets ?? 0), 0),
    [rows],
  );

  const departamentos = useMemo(
    () => (isPerson ? groupByDepartment(rows, groupTotal) : []),
    [isPerson, rows, groupTotal],
  );

  const personas = useMemo(
    () => (filtro === null ? rows : rows.filter((row) => (row.department || NO_DEPARTMENT) === filtro)),
    [rows, filtro],
  );

  const showDepartments = isPerson && vista === 'departamento';
  const visibles = showDepartments ? departamentos : personas;
  const leaders = dimensionLeaders(personas);

  const pickDepartment = (nombre: string) => {
    setFilter(nombre);
    setVista('persona');
  };

  const subtitulo = showDepartments
    ? `${caption} · ${departamentos.length} departamentos · click en una fila para ver a su gente`
    : `${caption} · ${visibles.length} valores · click en una fila para ver su tipo, razón y solución`;

  return (
    <NeonContainer
      theme="purple"
      title={showDepartments ? `${label} por departamento` : `Desglose por ${label}`}
      subtitle={subtitulo}
      icon={showDepartments ? <Building2 className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
      headerAction={
        <div className="flex flex-wrap items-center gap-3">
          {isPerson && (
            <ToggleGroup
              activeKey={vista}
              onChange={(key) => setVista(key as PersonView)}
              options={[
                { key: 'persona', label: 'Por persona', icon: Users },
                { key: 'departamento', label: 'Por departamento', icon: Building2 },
              ]}
            />
          )}

          {!showDepartments && (
            <span className="flex items-center gap-2 rounded-full bg-brand/20 px-3 py-1 text-xs font-semibold text-brand">
              <MousePointerClick className="h-3.5 w-3.5" />
              Drill-down
            </span>
          )}

          {showDepartments ? (
            <ExcelExportButton
              rows={departamentos}
              columns={SUPPORT_DEPARTMENT_EXCEL_COLUMNS}
              fileName={supportExportFileName([label, 'departamentos', groupName, period])}
              sheetName="Departamentos"
            />
          ) : (
            <ExcelExportButton
              rows={personas}
              columns={SUPPORT_DIMENSION_EXCEL_COLUMNS}
              fileName={supportExportFileName([label, groupName, period])}
              sheetName={label}
            />
          )}
        </div>
      }
    >
      {/*
        Con un departamento elegido la tabla de personas deja de ser la del
        grupo entero, y eso tiene que verse: el chip dice cuál y lo quita.
      */}
      {filtro !== null && !showDepartments && (
        <button
          type="button"
          onClick={() => setFilter(null)}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/20"
        >
          <Building2 className="h-3.5 w-3.5" />
          {filtro}
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {visibles.length === 0 ? (
        <EmptyState
          title={
            filtro !== null
              ? `Nadie de ${filtro} registra tickets en el periodo.`
              : `El grupo no registra ninguna ${label.toLowerCase()} en el periodo.`
          }
          description={
            filtro !== null
              ? 'Quita el filtro de departamento para ver el eje completo.'
              : 'Vuelve a ejecutar el análisis del mes si esperabas ver datos aquí.'
          }
          icon={<MapPin />}
        />
      ) : (
        <>
          {/*
            Una tarjeta por criterio, no las cuatro primeras por volumen: el
            ranking ya lo da la tabla ordenada que va debajo, y repetirlo
            arriba dejaba sin responder quién cancela más o quién tarda más.
            Cada tarjeta abre el desglose de su valor, igual que su fila.

            Siguen siendo siempre de personas: el líder de un criterio es
            alguien, y en la vista por departamento sirven para ver de dónde
            sale el que encabeza.
          */}
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {leaders.map((leader) => (
              <MetricCard
                key={leader.id}
                label={leader.label}
                value={leader.value}
                caption={leader.caption}
                subValue={leader.name}
                color={leader.color}
                onClick={() => onSelect(leader.name)}
              />
            ))}
          </div>

          <div className="h-[480px]">
            {showDepartments ? (
              <DataTable
                columns={SUPPORT_DEPARTMENT_COLUMNS}
                data={departamentos}
                searchable
                searchPlaceholder="Buscar departamento..."
                onRowClick={(row) => pickDepartment(row.name)}
              />
            ) : (
              <DataTable
                columns={SUPPORT_DIMENSION_COLUMNS}
                data={personas}
                searchable
                searchPlaceholder={`Buscar ${label.toLowerCase()}...`}
                onRowClick={(row) => onSelect(row.name)}
              />
            )}
          </div>
        </>
      )}
    </NeonContainer>
  );
}
