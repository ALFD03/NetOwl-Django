/** Tipos del módulo de Comisiones: lo que mandan `services/comisiones/views.py` y `analytics/`. */

import type { CargoVentas, CatalogoOption } from '@/shared/types/subscriptions';

export type { CargoVentas };

/** `diferida`: instalada en los días promocionales del mes sin adelantar el pago; cuenta en el periodo siguiente. */
export type Clasificacion = 'valida' | 'no_pagada' | 'revision' | 'excluida' | 'diferida';

/**
 * En qué parte de la ventana se instaló (`reglas.tramo`): los días promocionales
 * del mes anterior, del día 1 a los del mes, los del mes, o fuera de la ventana
 * (agregada a mano).
 */
export type TramoVenta = 'promo_anterior' | 'regular' | 'promo' | 'manual';

/**
 * Las decisiones a mano: `contar`/`no_contar` resuelven una venta en revisión;
 * `ya_pagada`/`normal`, en el primer periodo, si lo instalado en los días
 * promocionales del mes anterior ya se cobró en él.
 */
export type DecisionRevision = 'contar' | 'no_contar' | 'ya_pagada' | 'normal';

/** Un periodo creado, con su ventana de instalación. */
export interface PeriodoComision {
  periodo: string;
  estado: 'borrador' | 'cerrado';
  inicio: string;
  /** Último día de instalación que puede contar: el fin del mes. */
  fin: string;
  /** Desde aquí, lo instalado solo cuenta si se adelantó el pago hasta `corte_adelantos`. */
  inicio_promo: string;
  corte_adelantos: string;
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
  /** El que se aplica: el propio si lo tiene, si no el general; nulo es "sin definir". */
  cumplimiento_pct: number | null;
  /** El escrito solo para esta persona; nulo es que vale el general. */
  cumplimiento_propio: number | null;
  crecimiento_pct: number | null;
  crecimiento_calculado: number | null;
  crecimiento_fuente: 'manual' | 'unidades de negocio' | null;
  unidades: string[];
  /** Asesor: `tramo_desde`, `monto_por_venta`, `ventas_pagadas`. Coord. de UN: `monto_por_venta_equipo`. */
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
  /** Lo que dicen las facturas, sin la decisión manual: por qué fue a revisión. */
  motivo_analisis: string;
  decision: DecisionRevision | null;
  nota_revision: string;
  /** Falta en periodos cerrados antes de existir los días promocionales adelantados. */
  tramo?: TramoVenta;
  manual?: boolean;
  nota_manual?: string;
  /** Días promocionales del mes con la primera mensualidad pagada hasta el corte: cuenta en este periodo. */
  adelantada?: boolean;
  /**
   * Primer periodo, días promocionales del mes anterior: pagó la mensualidad antes
   * del corte de ese mes (pudo cobrarse allí), pagaría aquí y nadie confirmó todavía.
   */
  por_confirmar?: boolean;
  /**
   * Se ve en «Días promocionales del mes anterior»: por confirmar, ya confirmada
   * allí, o (con el anterior cerrado) cobrada en él. Lo que otra regla resolvió no.
   */
  revisar_promo?: boolean;
  /** Hoy es gratuita (archivada, tarifa «Gratis» o archivada en los logs): no paga comisión. */
  gratuita: boolean;
  /** Día en que se canceló, si hoy está «Cancelado» y los logs lo fechan; vacío si no. */
  cancelada_el: string;
  /** Cuántas facturas tiene la orden en el export de facturas. */
  facturas: number;
  /** La primera mensualidad: la que decide si se pagó. Vacíos si no tiene ninguna. */
  factura_numero: string;
  factura_fecha: string;
  factura_estado: string;
  factura_pago: string;
  factura_plan: string;
  /**
   * Hasta cuándo se sabe que estaba pagada: la «Fecha del último pago», si no la
   * «Última actualización el» y si no el «Creado el» (aproximado). Vacío sin pagar.
   */
  pago_fecha?: string;
  pago_fuente?: 'pago' | 'actualizacion' | 'creacion' | '';
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
  /** Hasta qué día un pago adelantado de los días promocionales cuenta aquí. */
  corte_adelantos?: string;
  /** El corte del mes anterior: con él se sugiere qué se cobró ya allí. */
  corte_anterior?: string;
  /** El periodo del mes anterior; `estado` nulo si no existe (y entonces se confirma a mano). */
  anterior?: { periodo: string; estado: 'borrador' | 'cerrado' | null };
  /** Si el export de facturas trae «Fecha del último pago». */
  facturas_con_fecha_pago?: boolean;
  estado: 'borrador' | 'cerrado';
  /** Desde cuándo tiene sentido calcular: las primeras facturas ya deberían estar pagadas. */
  calculo_desde: string;
  antes_de_tiempo: boolean;
  /** Cuándo se cargó el export de facturas con que se clasificó (falta en periodos cerrados antes de existir). */
  facturas_importadas_el?: string;
  /**
   * La tasa en bolívares con que se paga: la de CONATEL del mes siguiente (`mes`),
   * la misma del reporte ETA. Nula si aún no se publicó o el servicio falló (`aviso`).
   */
  tasa_conatel: TasaBolivares & { mes: string; aviso: string };
  /** El % de cumplimiento de todos los supervisores y coordinadores de oficina sin uno propio. */
  cumplimiento_general_pct: number | null;
  resumen: {
    candidatas: number;
    validas: number;
    no_pagadas: number;
    revision: number;
    excluidas: number;
    validas_pyme: number;
    /** Por facturar con la primera mensualidad pagada de otro plan: valen sin revisión. */
    validas_cambio_plan: number;
    validas_sin_medio: number;
    /** Lo que sigue faltando en los periodos cerrados antes de los adelantos. */
    diferidas?: number;
    promo?: number;
    adelantadas?: number;
    promo_anterior?: number;
    promo_anterior_cobradas?: number;
    promo_por_confirmar?: number;
    promo_anterior_revisar?: number;
    manuales?: number;
    total: number;
  };
  pagos: PagoComision[];
  /** Quién vendió con quién en las ventas válidas (falta en periodos cerrados antes de existir). */
  equipos?: FilaEquipo[];
  /** Nombre y cargo de cada id de `equipos`, cobre o no. */
  personas?: Record<string, { nombre: string; cargo: CargoVentas | '' }>;
  revision: VentaComision[];
  manuales?: VentaManual[];
  /** Lo que impide cerrar. Vacío: se puede cerrar. */
  pendientes_cierre: string[];
}

/** Una venta agregada a mano al periodo. */
export interface VentaManual {
  orden: string;
  nota: string;
  agregado_por: string;
  agregado_en: string;
  /** Nula si la orden ya no está en suscripciones. */
  venta: VentaComision | null;
}

/** Una combinación de coord. de UN, oficina, supervisor y quien vendió, con sus ventas válidas. */
export interface FilaEquipo {
  coord_un_id: number | null;
  coord_oficina_id: number | null;
  supervisor_id: number | null;
  medio_id: number | null;
  /** Válidas residenciales. */
  ventas: number;
  /** Válidas PYME. */
  pyme: number;
}

/** Una tasa del BCV en bolívares por dólar y de dónde salió. */
export interface TasaBolivares {
  tasa: number | null;
  fuente: string;
}

/** Lo que propone el formulario del periodo. */
export interface PropuestaPeriodo {
  periodo: string;
  inicio: string;
  /** Falso si el mes anterior tiene periodo: el inicio sale de él. */
  preguntar_inicio: boolean;
  inicio_promo: string;
  corte_adelantos: string;
}

export interface ComisionesInformeProps {
  periodo: string;
  periodos: PeriodoComision[];
  /** Nulo si el periodo todavía no existe (o si su cálculo falló: ver `error`). */
  informe: InformeComision | null;
  error: string | null;
  propuesta: PropuestaPeriodo;
  /** Las del cierre si el periodo está cerrado; si no, las vigentes, con las que se calculó. */
  condiciones: CondicionesComision;
  cargos: CatalogoOption[];
  puedeGestionar: boolean;
  /** `can_reopen_comisiones`: reabrir va aparte de gestionar. */
  puedeReabrir: boolean;
  /** Las versiones archivadas de los cierres anteriores del periodo, la más reciente primero. */
  archivos: CierreArchivado[];
}

/** Un cierre guardado al reabrir el periodo (sin la copia, que se pide al descargarlo). */
export interface CierreArchivado {
  id: number;
  version: number;
  cerrado_por: string;
  cerrado_en: string | null;
  reabierto_por: string;
  reabierto_en: string;
  motivo: string;
  total_neto: number;
  pagos: number;
  ventas: number;
}

/** La copia completa de un cierre archivado: lo que había congelado al reabrirlo. */
export interface CopiaCierre {
  periodo: { periodo: string; tasa_conatel: string | null; cerrado_por: string | null; cerrado_en: string | null };
  condiciones: CondicionesComision;
  resumen: InformeComision;
  ventas: { orden: string; clasificacion: string; datos: VentaComision }[];
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
  /** Día del mes siguiente hasta el que un pago adelantado cuenta en el periodo. */
  dia_corte: number;
}

export interface PlanPyme {
  id: number;
  nombre: string;
  tarifa: string;
  precio: number;
  comision_pyme_pct: number | null;
}

/** La última vez que se guardaron las condiciones; nulos si nunca se guardaron desde la página. */
export interface ActualizacionCondiciones {
  en: string | null;
  por: string | null;
}

export interface ComisionesCondicionesProps {
  condiciones: CondicionesComision;
  actualizacion: ActualizacionCondiciones;
  planesPyme: PlanPyme[];
  puedeEditarPlanes: boolean;
}
