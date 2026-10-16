/** Tipos del módulo de Comisiones: lo que mandan `services/comisiones/views.py` y `analytics/`. */

import type { CargoVentas, CatalogoOption } from '@/shared/types/subscriptions';

export type { CargoVentas };

export type Clasificacion = 'valida' | 'no_pagada' | 'revision' | 'excluida';

/** Un periodo creado, con su ventana de instalación. */
export interface PeriodoComision {
  periodo: string;
  estado: 'borrador' | 'cerrado';
  inicio: string;
  /** Último día de instalación que cuenta: el anterior a los días promocionales. */
  fin: string;
  inicio_promo: string;
}

/** Lo que cobra una persona en el periodo (`reglas.Pago` más su ficha). */
export interface PagoComision {
  persona_id: number;
  nombre: string;
  medio: string;
  cargo: CargoVentas;
  ventas_propias: number;
  ventas_equipo: number;
  ventas_pyme: number;
  monto_pyme: number;
  pyme_sin_porcentaje: number;
  monto_propias: number;
  monto_equipo: number;
  bruto: number;
  /** % de cumplimiento aplicado (tope 100); nulo en quien no lo usa. */
  factor_pct: number | null;
  neto: number;
  /** Lo escrito para el periodo; nulo es "sin definir". */
  cumplimiento_pct: number | null;
  crecimiento_pct: number | null;
  crecimiento_calculado: number | null;
  crecimiento_fuente: 'manual' | 'unidades de negocio' | null;
  unidades: string[];
  detalle: Record<string, number | null>;
  avisos: string[];
}

/** Una venta candidata del periodo, clasificada y con sus personas. */
export interface VentaComision {
  orden: string;
  cliente: string;
  fecha_inicio: string;
  sucursal: string;
  zona: string;
  producto: string;
  pyme: boolean;
  precio: number;
  pct_pyme: number | null;
  estado: string;
  estado_factura: string;
  clasificacion: Clasificacion;
  motivo: string;
  decision: 'contar' | 'no_contar' | null;
  nota_revision: string;
  /** Día del cambio de plan que la hizo válida sin revisarla; vacío si no fue por eso. */
  cambio_plan: string;
  medio: string;
  medio_supervisor: string;
  vendedor: string;
  medio_id: number | null;
  supervisor_id: number | null;
  coord_oficina_id: number | null;
  coord_un_id: number | null;
  coord_un: string;
  avisos: string[];
}

export interface InformeComision {
  periodo: string;
  inicio: string;
  fin: string;
  inicio_promo: string;
  estado: 'borrador' | 'cerrado';
  /** Desde cuándo tiene sentido calcular: las primeras facturas ya deberían estar pagadas. */
  calculo_desde: string;
  antes_de_tiempo: boolean;
  resumen: {
    candidatas: number;
    validas: number;
    no_pagadas: number;
    revision: number;
    excluidas: number;
    validas_pyme: number;
    /** Por facturar que valen sin revisión porque cambiaron de plan. */
    validas_cambio_plan: number;
    validas_sin_medio: number;
    total: number;
  };
  pagos: PagoComision[];
  revision: VentaComision[];
  /** Lo que impide cerrar. Vacío: se puede cerrar. */
  pendientes_cierre: string[];
}

/** Lo que propone el formulario del periodo. */
export interface PropuestaPeriodo {
  periodo: string;
  inicio: string;
  /** Falso si el mes anterior tiene periodo: el inicio sale de él. */
  preguntar_inicio: boolean;
  inicio_promo: string;
}

export interface ComisionesInformeProps {
  periodo: string;
  periodos: PeriodoComision[];
  /** Nulo si el periodo todavía no existe (o si su cálculo falló: ver `error`). */
  informe: InformeComision | null;
  error: string | null;
  propuesta: PropuestaPeriodo;
  cargos: CatalogoOption[];
  puedeGestionar: boolean;
}

/** Un supervisor y el coordinador de UN al que responde. */
export interface SupervisorUnidad {
  id: number;
  nombre: string;
  apellido: string;
  medio: string;
  /** Cómo aparece en `Oportunidad/Administrador` (el medio, si Odoo no lo escribe distinto). */
  medio_supervisor: string;
  /** Vacío: sus ventas no pagan a ningún coordinador de UN. */
  coord_un_id: number | null;
}

export interface ComisionesSupervisoresProps {
  supervisores: SupervisorUnidad[];
  coordinadores: { id: number; nombre: string }[];
}

export interface TramoAsesor {
  desde: number;
  monto: number;
  descontar: number;
}

export interface TramoUn {
  /** Nulo: "desde siempre", el primer tramo. */
  desde_pct: number | null;
  monto: number;
}

export interface CondicionesComision {
  monto_equipo: number;
  monto_directa: number;
  monto_directa_un: number;
  tramos_asesor: TramoAsesor[];
  tramos_un: TramoUn[];
  dia_promocional: number;
  dias_espera: number;
}

export interface PlanPyme {
  id: number;
  nombre: string;
  tarifa: string;
  precio: number;
  comision_pyme_pct: number | null;
}

export interface ComisionesCondicionesProps {
  condiciones: CondicionesComision;
  planesPyme: PlanPyme[];
  puedeEditarPlanes: boolean;
}
