/**
 * El libro de Excel del informe de comisiones, pensado para quien paga.
 *
 * - **Resumen**: el total en $ y en Bs, la tasa, y lo que se paga por equipo y,
 *   dentro de cada uno, por rol.
 * - Una hoja por equipo de ventas, ordenada como la nómina: los roles de
 *   dirección, y los supervisores con sus asesores, con subtotales. Cada
 *   persona sale una vez por equipo, así que las hojas suman el total.
 * - **Ventas**: el detalle venta a venta, para quien quiera comprobar.
 *
 * Los bolívares de cada fila se redondean a céntimos y los totales son la suma
 * de esas filas, como en la página: cada columna cuadra al céntimo.
 */

import {
  downloadStyledWorkbook, type ExcelCell, type ExcelCellObject, type ExcelRow, type ExcelStyledSheet,
} from '@/shared/lib/excel';
import { CLASSIFICATION, TIER, aBs, formatDateValue, formatMonth, complianceSource, totalBs } from './format';
import {
  buildPayroll, paymentKey, trimReason, bonusNotes, paidSales, validatedSales,
  type PayrollTeam, type Payroll,
} from './payroll';
import type { CommissionConditions, CommissionReport, CommissionPayment, SalesRole, CommissionSale } from '../types';

// --- Estilo -------------------------------------------------------------------------

const COLOR = {
  tinta: '#0F172A',
  suave: '#64748B',
  linea: '#CBD5E1',
  cabecera: '#1E293B',
  unidad: '#EDE9FE',
  unidadTexto: '#4C1D95',
  oficina: '#E0F2FE',
  oficinaTexto: '#075985',
  supervisor: '#F1F5F9',
  cebra: '#F8FAFC',
  total: '#E2E8F0',
  ambar: '#B45309',
  verde: '#047857',
};
const USD = '"$"#,##0.00';
const BS = '"Bs "#,##0.00';
const INTEGER = '#,##0';
const PCT = '0.00"%"';
const RATE = '#,##0.0000';

type Value = string | number | null;
// `format` solo lo admiten las celdas numéricas: `celda` lo quita de las demás.
type Estilo = Omit<ExcelCellObject, 'value' | 'type'>;

const celda = (valor: Value, estilo: Estilo = {}): ExcelCell => {
  if (typeof valor === 'number' && Number.isFinite(valor)) return { type: Number, value: valor, ...estilo };
  // Un formato numérico en una celda de texto o vacía rompe el libro entero.
  const resto = { ...estilo };
  delete resto.format;
  return { type: String, value: valor === null ? undefined : String(valor), ...resto };
};

/** Una fila que ocupa todo el ancho con un solo texto. */
const ancha = (texto: string, columns: number, estilo: Estilo = {}): ExcelRow => [
  celda(texto, { columnSpan: columns, ...estilo }),
  ...Array<null>(columns - 1).fill(null),
];

const vacia = (): ExcelRow => [];

const banda = (texto: string, columns: number, fondo: string, color: string): ExcelRow =>
  ancha(texto, columns, {
    fontWeight: 'bold', backgroundColor: fondo, textColor: color, height: 22, alignVertical: 'center', indent: 1,
    topBorderColor: COLOR.linea, topBorderStyle: 'thin',
  });

/** Una columna de una tabla: su cabecera, su valor y cómo se suma en los totales. */
interface Col<T> {
  titulo: string;
  ancho: number;
  valor: (row: T) => Value;
  formato?: string;
  /** Color del texto de una fila: el ámbar de lo que se paga de menos. */
  color?: (row: T) => string | undefined;
  /** Cómo se totaliza; sin él, la celda del total queda vacía. */
  total?: (filas: T[]) => number | null;
}

const cabecera = <T>(cols: Col<T>[]): ExcelRow =>
  cols.map((c, i) => celda(c.titulo, {
    fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: COLOR.cabecera, wrap: true, height: 30,
    align: i === 0 ? 'left' : 'center', alignVertical: 'center',
  }));

const rowOf = <T>(cols: Col<T>[], row: T, n: number, apagada = false, sangria = 0): ExcelRow =>
  cols.map((c, i) => celda(c.valor(row), {
    format: c.formato,
    textColor: apagada ? COLOR.suave : c.color?.(row) ?? COLOR.tinta,
    backgroundColor: n % 2 ? COLOR.cebra : undefined,
    // La última columna es texto libre (observaciones, avisos): una sola línea
    // que sigue hacia la derecha, para que todas las filas tengan el mismo alto.
    indent: i === 0 && sangria ? sangria : i === cols.length - 1 ? 1 : undefined,
    height: 18,
    alignVertical: 'center',
    bottomBorderColor: COLOR.total,
    bottomBorderStyle: 'thin',
  }));

const totalOf = <T>(cols: Col<T>[], filas: T[], etiqueta: string, fuerte = false): ExcelRow =>
  cols.map((c, i) => celda(i === 0 ? etiqueta : c.total?.(filas) ?? null, {
    format: c.formato,
    fontWeight: 'bold',
    backgroundColor: fuerte ? COLOR.total : COLOR.supervisor,
    topBorderColor: COLOR.suave,
    topBorderStyle: fuerte ? 'medium' : 'thin',
    height: fuerte ? 22 : 18,
    alignVertical: 'center',
  }));

const add = (filas: CommissionPayment[], f: (p: CommissionPayment) => number) => filas.reduce((t, p) => t + f(p), 0);
const usdTotal = (filas: CommissionPayment[]) => Math.round(add(filas, (p) => p.neto) * 100) / 100;

// --- Columnas comunes -----------------------------------------------------------------

const paymentColumns = (tasa: number | null): Col<CommissionPayment>[] => [
  { titulo: 'A pagar $', ancho: 14, valor: (p) => p.neto, formato: USD, total: usdTotal },
  { titulo: 'A pagar Bs\n(tasa CONATEL)', ancho: 18, valor: (p) => aBs(p.neto, tasa), formato: BS, total: (f) => totalBs(f.map((p) => p.neto), tasa) },
];

const salesColumnList: Col<CommissionPayment>[] = [
  { titulo: 'Ventas validadas', ancho: 11, valor: validatedSales, formato: INTEGER, total: (f) => add(f, validatedSales) },
  {
    titulo: 'Ventas pagadas',
    ancho: 11,
    valor: paidSales,
    formato: INTEGER,
    color: (p) => (paidSales(p) < validatedSales(p) ? COLOR.ambar : undefined),
    total: (f) => add(f, paidSales),
  },
];

/** Lo que explica una fila: el recorte, lo que vendió con otro supervisor, los bonos y los avisos. */
const observaciones = (nomina: Payroll, condiciones: CommissionConditions) => (p: CommissionPayment): string => {
  const fuera = nomina.fuera.get(paymentKey(p));
  return [
    trimReason(p, condiciones.equipos?.[p.equipo]?.[p.rol]?.tramos_asesor),
    fuera ? `+${fuera.ventas} ventas con ${fuera.donde} (incluidas)` : null,
    ...bonusNotes(p),
    ...p.avisos,
  ].filter(Boolean).join(' · ');
};

// --- Hojas ----------------------------------------------------------------------------

function summarySheet(informe: CommissionReport, nomina: Payroll, tasa: number | null, etiquetaCargo: (r: SalesRole) => string): ExcelStyledSheet {
  const N = 7;
  const pagos = informe.pagos;
  const etiqueta = { fontWeight: 'bold' as const, textColor: COLOR.tinta, height: 20, alignVertical: 'center' as const };
  const datum = (valor: Value, formato?: string, color = COLOR.tinta): ExcelCell =>
    celda(valor, { format: formato, textColor: color, fontWeight: 'bold', align: 'right', alignVertical: 'center' });

  const filas: ExcelRow[] = [
    ancha(`Comisiones de ${formatMonth(informe.periodo)}`, N, { fontSize: 16, fontWeight: 'bold', height: 28, textColor: COLOR.tinta }),
    ancha(
      `Periodo ${informe.periodo} · instalaciones del ${formatDateValue(informe.inicio)} al ${formatDateValue(informe.fin)} · ${informe.estado === 'cerrado' ? 'cerrado' : 'borrador, puede cambiar'}`,
      N,
      { textColor: COLOR.suave },
    ),
    vacia(),
    banda('Total a pagar', N, COLOR.cabecera, '#FFFFFF'),
    [celda('Total en dólares', etiqueta), datum(usdTotal(pagos), USD)],
    [celda('Total en bolívares', etiqueta), datum(totalBs(pagos.map((p) => p.neto), tasa), BS, COLOR.verde)],
    [
      celda(`Tasa CONATEL ${informe.tasa_conatel ? formatMonth(informe.tasa_conatel.mes) : ''}`, etiqueta),
      datum(tasa, RATE),
      celda(tasa !== null ? informe.tasa_conatel.fuente : informe.tasa_conatel?.aviso || 'Sin tasa: los bolívares quedan vacíos', {
        textColor: COLOR.suave, columnSpan: 5,
      }),
      null, null, null, null,
    ],
    [celda('Personas que cobran', etiqueta), datum(pagos.filter((p) => p.neto > 0).length, INTEGER)],
    ...(informe.resumen.bonos ? [[celda('Bonos (incluidos)', etiqueta), datum(informe.resumen.bonos, USD)]] : []),
    [celda('Ventas validadas', etiqueta), datum(informe.resumen.validas, INTEGER)],
    vacia(),
  ];

  // Por equipo
  type Bloque = { nombre: string; personas: CommissionPayment[]; ventas: number | null };
  const byBlock: Col<Bloque>[] = [
    { titulo: 'Equipo / rol', ancho: 34, valor: (b) => b.nombre },
    { titulo: 'Personas', ancho: 12, valor: (b) => b.personas.length, formato: INTEGER, total: (bs) => add(bs.flatMap((b) => b.personas), () => 1) },
    { titulo: 'Cobran', ancho: 12, valor: (b) => b.personas.filter((p) => p.neto > 0).length, formato: INTEGER, total: (bs) => bs.flatMap((b) => b.personas).filter((p) => p.neto > 0).length },
    { titulo: 'Ventas validadas', ancho: 14, valor: (b) => b.ventas ?? add(b.personas, validatedSales), formato: INTEGER },
    { titulo: 'Bonos $', ancho: 14, valor: (b) => bonusTotal(b.personas) || null, formato: USD, total: (bs) => bonusTotal(bs.flatMap((b) => b.personas)) || null },
    { titulo: 'A pagar $', ancho: 18, valor: (b) => usdTotal(b.personas), formato: USD, total: (bs) => usdTotal(bs.flatMap((b) => b.personas)) },
    { titulo: 'A pagar Bs', ancho: 22, valor: (b) => totalBs(b.personas.map((p) => p.neto), tasa), formato: BS, total: (bs) => totalBs(bs.flatMap((b) => b.personas).map((p) => p.neto), tasa) },
  ];
  const todos: Bloque[] = [];
  for (const e of nomina.equipos) {
    const ofTeam: Bloque = { nombre: e.nombre, personas: e.personas, ventas: e.ventas };
    const roles = [...new Set(e.personas.map((p) => p.rol))].map((rol): Bloque => ({
      nombre: `    ${etiquetaCargo(rol)}`, personas: e.personas.filter((p) => p.rol === rol), ventas: null,
    }));
    filas.push(banda(e.nombre, N, COLOR.unidad, COLOR.unidadTexto), cabecera(byBlock));
    filas.push(rowOf(byBlock, ofTeam, 0, false));
    roles.forEach((b, i) => filas.push(rowOf(byBlock, b, i + 1, false)));
    filas.push(vacia());
    todos.push(ofTeam);
  }
  filas.push(totalOf(byBlock, todos, 'Total a pagar', true));

  return { sheetName: 'Resumen', rows: filas, widths: byBlock.map((c) => c.ancho) };
}

const bonusTotal = (filas: CommissionPayment[]) => Math.round(add(filas, (p) => p.bono) * 100) / 100;

/** Una hoja por equipo: sus roles de dirección y, por supervisor, sus asesores; como la nómina. */
function teamSheet(e: PayrollTeam, nomina: Payroll, condiciones: CommissionConditions, tasa: number | null, etiquetaCargo: (r: SalesRole) => string): ExcelStyledSheet {
  const obs = observaciones(nomina, condiciones);
  const cols: Col<CommissionPayment>[] = [
    { titulo: 'Persona', ancho: 34, valor: (p) => p.nombre },
    { titulo: 'Rol', ancho: 22, valor: (p) => etiquetaCargo(p.rol) },
    { titulo: 'Ventas propias', ancho: 10, valor: (p) => p.ventas_propias, formato: INTEGER, total: (f) => add(f, (p) => p.ventas_propias) },
    { titulo: 'Ventas de equipo', ancho: 10, valor: (p) => p.ventas_equipo, formato: INTEGER, total: (f) => add(f, (p) => p.ventas_equipo) },
    { titulo: 'PYME', ancho: 8, valor: (p) => p.ventas_pyme || null, formato: INTEGER, total: (f) => add(f, (p) => p.ventas_pyme) || null },
    ...salesColumnList,
    { titulo: 'Antes del %', ancho: 13, valor: (p) => p.bruto, formato: USD, total: (f) => Math.round(add(f, (p) => p.bruto) * 100) / 100 },
    {
      titulo: 'Cumplimiento',
      ancho: 13,
      valor: (p) => p.factor_pct,
      formato: PCT,
      color: (p) => (p.factor_pct !== null && p.factor_pct < 100 ? COLOR.ambar : undefined),
    },
    { titulo: 'Origen', ancho: 22, valor: (p) => (p.detalle.factor ? complianceSource(p) : '') },
    { titulo: 'Crecimiento', ancho: 12, valor: (p) => p.crecimiento_pct, formato: PCT },
    { titulo: 'Bonos $', ancho: 12, valor: (p) => p.bono || null, formato: USD, total: (f) => bonusTotal(f) || null },
    ...paymentColumns(tasa),
    { titulo: 'Observaciones', ancho: 52, valor: obs },
  ];
  const N = cols.length;
  const filas: ExcelRow[] = [cabecera(cols)];

  for (const s of e.secciones) {
    filas.push(banda(s.etiqueta, N, COLOR.oficina, COLOR.oficinaTexto));
    s.pagos.forEach((p, i) => filas.push(rowOf(cols, p, i, p.neto === 0, 1)));
    filas.push(totalOf(cols, s.pagos, `Total ${s.etiqueta.toLowerCase()}`), vacia());
  }
  for (const g of e.grupos) {
    const personas = [...(g.pago ? [g.pago] : []), ...g.asesores];
    filas.push(banda(g.pago ? `Supervisor · ${g.nombre}` : g.nombre, N, COLOR.unidad, COLOR.unidadTexto));
    if (g.pago) filas.push(rowOf(cols, g.pago, 0, g.pago.neto === 0, 1));
    g.asesores.forEach((p, i) => filas.push(rowOf(cols, p, i + 1, p.neto === 0, 2)));
    filas.push(totalOf(cols, personas, `Total ${g.nombre}`), vacia());
  }
  filas.push(totalOf(cols, e.personas, `Total ${e.nombre}`, true));
  // Los nombres de hoja de Excel: 31 caracteres como máximo, sin `/ \ ? * [ ]`.
  return { sheetName: e.nombre.replace(/[/\\?*[\]]/g, ' ').slice(0, 31), rows: filas, widths: cols.map((c) => c.ancho), stickyRows: 1 };
}

function salesSheet(ventas: CommissionSale[]): ExcelStyledSheet {
  const cols: Col<CommissionSale>[] = [
    { titulo: 'Orden', ancho: 16, valor: (v) => v.orden },
    { titulo: 'Cliente', ancho: 30, valor: (v) => v.cliente },
    { titulo: 'Instalada', ancho: 12, valor: (v) => formatDateValue(v.fecha_inicio) },
    { titulo: 'Sucursal', ancho: 14, valor: (v) => v.sucursal },
    { titulo: 'Zona', ancho: 18, valor: (v) => v.zona },
    { titulo: 'Plan', ancho: 28, valor: (v) => v.producto },
    { titulo: 'Tipo', ancho: 12, valor: (v) => (v.pyme ? 'PYME' : 'Residencial') },
    { titulo: 'Precio', ancho: 11, valor: (v) => v.precio, formato: USD },
    { titulo: 'Estado actual', ancho: 14, valor: (v) => v.estado },
    { titulo: 'Cancelada el', ancho: 12, valor: (v) => (v.cancelada_el ? formatDateValue(v.cancelada_el) : '') },
    { titulo: 'Estado de la factura', ancho: 20, valor: (v) => v.estado_factura },
    { titulo: 'Primera mensualidad', ancho: 18, valor: (v) => v.factura_numero ?? '' },
    { titulo: 'Creada el', ancho: 12, valor: (v) => (v.factura_fecha ? formatDateValue(v.factura_fecha) : '') },
    { titulo: 'Plan facturado', ancho: 28, valor: (v) => v.factura_plan ?? '' },
    { titulo: 'Estado', ancho: 12, valor: (v) => v.factura_estado ?? '' },
    { titulo: 'Estado del pago', ancho: 18, valor: (v) => v.factura_pago ?? '' },
    { titulo: 'Pagada el', ancho: 12, valor: (v) => (v.pago_fecha ? formatDateValue(v.pago_fecha) : '') },
    { titulo: 'Gratuita', ancho: 10, valor: (v) => (v.gratuita ? 'Sí' : '') },
    { titulo: 'Tramo', ancho: 22, valor: (v) => (v.tramo ? TIER[v.tramo] : '') },
    { titulo: 'Clasificación', ancho: 13, valor: (v) => CLASSIFICATION[v.clasificacion].label },
    { titulo: 'Motivo', ancho: 40, valor: (v) => v.motivo },
    { titulo: 'Medio', ancho: 24, valor: (v) => v.medio },
    { titulo: 'Oportunidad/Administrador', ancho: 24, valor: (v) => v.medio_supervisor },
    { titulo: 'Vendedor', ancho: 30, valor: (v) => v.vendedor },
    { titulo: 'Equipo', ancho: 16, valor: (v) => v.equipo },
    { titulo: 'Unidades de negocio', ancho: 28, valor: (v) => v.unidades.join(', ') },
    { titulo: 'Avisos', ancho: 50, valor: (v) => v.avisos.join(' · ') },
  ];
  return {
    sheetName: 'Ventas',
    rows: [cabecera(cols), ...ventas.map((v, i) => rowOf(cols, v, i, v.clasificacion !== 'valida'))],
    widths: cols.map((c) => c.ancho),
    stickyRows: 1,
  };
}

/** Descarga el libro del periodo: resumen, una hoja por equipo y el detalle de ventas. */
export async function exportReport(
  informe: CommissionReport,
  ventas: CommissionSale[],
  condiciones: CommissionConditions,
  tasa: number | null,
  etiquetaCargo: (rol: SalesRole) => string,
  /** Sin extensión. Por defecto `Comisiones <periodo>`; los cierres archivados llevan su versión. */
  nombre = `Comisiones ${informe.periodo}`,
  /** Los equipos con sus roles, para nombrar y ordenar las hojas. */
  equipos: { slug: string; nombre: string; roles: { rol: SalesRole; etiqueta: string }[] }[] = [],
): Promise<void> {
  const orden = equipos.length
    ? equipos
    : [...new Set(informe.pagos.map((p) => p.equipo))].map((slug) => ({
      slug,
      nombre: informe.pagos.find((p) => p.equipo === slug)?.equipo_nombre ?? slug,
      roles: [...new Set(informe.pagos.filter((p) => p.equipo === slug).map((p) => p.rol))]
        .map((rol) => ({ rol, etiqueta: etiquetaCargo(rol) })),
    }));
  const nomina = buildPayroll(informe, orden);
  await downloadStyledWorkbook(
    [
      summarySheet(informe, nomina, tasa, etiquetaCargo),
      ...nomina.equipos.map((e) => teamSheet(e, nomina, condiciones, tasa, etiquetaCargo)),
      salesSheet(ventas),
    ],
    nombre,
  );
}
