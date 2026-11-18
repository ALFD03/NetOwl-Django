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
  value: (row: T) => Value;
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
  cols.map((c, i) => celda(c.value(row), {
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
const usdTotal = (filas: CommissionPayment[]) => Math.round(add(filas, (p) => p.net) * 100) / 100;

// --- Columnas comunes -----------------------------------------------------------------

const paymentColumns = (tasa: number | null): Col<CommissionPayment>[] => [
  { titulo: 'A pagar $', ancho: 14, value: (p) => p.net, formato: USD, total: usdTotal },
  { titulo: 'A pagar Bs\n(tasa CONATEL)', ancho: 18, value: (p) => aBs(p.net, tasa), formato: BS, total: (f) => totalBs(f.map((p) => p.net), tasa) },
];

const salesColumnList: Col<CommissionPayment>[] = [
  { titulo: 'Ventas validadas', ancho: 11, value: validatedSales, formato: INTEGER, total: (f) => add(f, validatedSales) },
  {
    titulo: 'Ventas pagadas',
    ancho: 11,
    value: paidSales,
    formato: INTEGER,
    color: (p) => (paidSales(p) < validatedSales(p) ? COLOR.ambar : undefined),
    total: (f) => add(f, paidSales),
  },
];

/** Lo que explica una fila: el recorte, lo que vendió con otro supervisor, los bonos y los avisos. */
const observaciones = (nomina: Payroll, condiciones: CommissionConditions) => (p: CommissionPayment): string => {
  const fuera = nomina.fuera.get(paymentKey(p));
  return [
    trimReason(p, condiciones.teams?.[p.equipo]?.[p.role]?.tramos_asesor),
    fuera ? `+${fuera.sales} ventas con ${fuera.donde} (incluidas)` : null,
    ...bonusNotes(p),
    ...p.warnings,
  ].filter(Boolean).join(' · ');
};

// --- Hojas ----------------------------------------------------------------------------

function summarySheet(informe: CommissionReport, nomina: Payroll, tasa: number | null, etiquetaCargo: (r: SalesRole) => string): ExcelStyledSheet {
  const N = 7;
  const pagos = informe.payments;
  const etiqueta = { fontWeight: 'bold' as const, textColor: COLOR.tinta, height: 20, alignVertical: 'center' as const };
  const datum = (valor: Value, formato?: string, color = COLOR.tinta): ExcelCell =>
    celda(valor, { format: formato, textColor: color, fontWeight: 'bold', align: 'right', alignVertical: 'center' });

  const filas: ExcelRow[] = [
    ancha(`Comisiones de ${formatMonth(informe.period)}`, N, { fontSize: 16, fontWeight: 'bold', height: 28, textColor: COLOR.tinta }),
    ancha(
      `Periodo ${informe.period} · instalaciones del ${formatDateValue(informe.start)} al ${formatDateValue(informe.end)} · ${informe.status === 'cerrado' ? 'cerrado' : 'borrador, puede cambiar'}`,
      N,
      { textColor: COLOR.suave },
    ),
    vacia(),
    banda('Total a pagar', N, COLOR.cabecera, '#FFFFFF'),
    [celda('Total en dólares', etiqueta), datum(usdTotal(pagos), USD)],
    [celda('Total en bolívares', etiqueta), datum(totalBs(pagos.map((p) => p.net), tasa), BS, COLOR.verde)],
    [
      celda(`Tasa CONATEL ${informe.conatel_rate ? formatMonth(informe.conatel_rate.month) : ''}`, etiqueta),
      datum(tasa, RATE),
      celda(tasa !== null ? informe.conatel_rate.source : informe.conatel_rate?.warning || 'Sin tasa: los bolívares quedan vacíos', {
        textColor: COLOR.suave, columnSpan: 5,
      }),
      null, null, null, null,
    ],
    [celda('Personas que cobran', etiqueta), datum(pagos.filter((p) => p.net > 0).length, INTEGER)],
    ...(informe.summary.bonuses ? [[celda('Bonos (incluidos)', etiqueta), datum(informe.summary.bonuses, USD)]] : []),
    [celda('Ventas validadas', etiqueta), datum(informe.summary.valid, INTEGER)],
    vacia(),
  ];

  // Por equipo
  type Bloque = { name: string; people: CommissionPayment[]; sales: number | null };
  const byBlock: Col<Bloque>[] = [
    { titulo: 'Equipo / rol', ancho: 34, value: (b) => b.name },
    { titulo: 'Personas', ancho: 12, value: (b) => b.people.length, formato: INTEGER, total: (bs) => add(bs.flatMap((b) => b.people), () => 1) },
    { titulo: 'Cobran', ancho: 12, value: (b) => b.people.filter((p) => p.net > 0).length, formato: INTEGER, total: (bs) => bs.flatMap((b) => b.people).filter((p) => p.net > 0).length },
    { titulo: 'Ventas validadas', ancho: 14, value: (b) => b.sales ?? add(b.people, validatedSales), formato: INTEGER },
    { titulo: 'Bonos $', ancho: 14, value: (b) => bonusTotal(b.people) || null, formato: USD, total: (bs) => bonusTotal(bs.flatMap((b) => b.people)) || null },
    { titulo: 'A pagar $', ancho: 18, value: (b) => usdTotal(b.people), formato: USD, total: (bs) => usdTotal(bs.flatMap((b) => b.people)) },
    { titulo: 'A pagar Bs', ancho: 22, value: (b) => totalBs(b.people.map((p) => p.net), tasa), formato: BS, total: (bs) => totalBs(bs.flatMap((b) => b.people).map((p) => p.net), tasa) },
  ];
  const todos: Bloque[] = [];
  for (const e of nomina.teams) {
    const ofTeam: Bloque = { name: e.name, people: e.people, sales: e.sales };
    const roles = [...new Set(e.people.map((p) => p.role))].map((rol): Bloque => ({
      name: `    ${etiquetaCargo(rol)}`, people: e.people.filter((p) => p.role === rol), sales: null,
    }));
    filas.push(banda(e.name, N, COLOR.unidad, COLOR.unidadTexto), cabecera(byBlock));
    filas.push(rowOf(byBlock, ofTeam, 0, false));
    roles.forEach((b, i) => filas.push(rowOf(byBlock, b, i + 1, false)));
    filas.push(vacia());
    todos.push(ofTeam);
  }
  filas.push(totalOf(byBlock, todos, 'Total a pagar', true));

  return { sheetName: 'Resumen', rows: filas, widths: byBlock.map((c) => c.ancho) };
}

const bonusTotal = (filas: CommissionPayment[]) => Math.round(add(filas, (p) => p.bonus) * 100) / 100;

/** Una hoja por equipo: sus roles de dirección y, por supervisor, sus asesores; como la nómina. */
function teamSheet(e: PayrollTeam, nomina: Payroll, condiciones: CommissionConditions, tasa: number | null, etiquetaCargo: (r: SalesRole) => string): ExcelStyledSheet {
  const obs = observaciones(nomina, condiciones);
  const cols: Col<CommissionPayment>[] = [
    { titulo: 'Persona', ancho: 34, value: (p) => p.name },
    { titulo: 'Rol', ancho: 22, value: (p) => etiquetaCargo(p.role) },
    { titulo: 'Ventas propias', ancho: 10, value: (p) => p.own_sales, formato: INTEGER, total: (f) => add(f, (p) => p.own_sales) },
    { titulo: 'Ventas de equipo', ancho: 10, value: (p) => p.team_sales, formato: INTEGER, total: (f) => add(f, (p) => p.team_sales) },
    { titulo: 'PYME', ancho: 8, value: (p) => p.sme_sales || null, formato: INTEGER, total: (f) => add(f, (p) => p.sme_sales) || null },
    ...salesColumnList,
    { titulo: 'Antes del %', ancho: 13, value: (p) => p.gross, formato: USD, total: (f) => Math.round(add(f, (p) => p.gross) * 100) / 100 },
    {
      titulo: 'Cumplimiento',
      ancho: 13,
      value: (p) => p.factor_pct,
      formato: PCT,
      color: (p) => (p.factor_pct !== null && p.factor_pct < 100 ? COLOR.ambar : undefined),
    },
    { titulo: 'Origen', ancho: 22, value: (p) => (p.detail.factor ? complianceSource(p) : '') },
    { titulo: 'Crecimiento', ancho: 12, value: (p) => p.growth_pct, formato: PCT },
    { titulo: 'Bonos $', ancho: 12, value: (p) => p.bonus || null, formato: USD, total: (f) => bonusTotal(f) || null },
    ...paymentColumns(tasa),
    { titulo: 'Observaciones', ancho: 52, value: obs },
  ];
  const N = cols.length;
  const filas: ExcelRow[] = [cabecera(cols)];

  for (const s of e.secciones) {
    filas.push(banda(s.role_label, N, COLOR.oficina, COLOR.oficinaTexto));
    s.payments.forEach((p, i) => filas.push(rowOf(cols, p, i, p.net === 0, 1)));
    filas.push(totalOf(cols, s.payments, `Total ${s.role_label.toLowerCase()}`), vacia());
  }
  for (const g of e.grupos) {
    const personas = [...(g.pago ? [g.pago] : []), ...g.advisors];
    filas.push(banda(g.pago ? `Supervisor · ${g.name}` : g.name, N, COLOR.unidad, COLOR.unidadTexto));
    if (g.pago) filas.push(rowOf(cols, g.pago, 0, g.pago.net === 0, 1));
    g.advisors.forEach((p, i) => filas.push(rowOf(cols, p, i + 1, p.net === 0, 2)));
    filas.push(totalOf(cols, personas, `Total ${g.name}`), vacia());
  }
  filas.push(totalOf(cols, e.people, `Total ${e.name}`, true));
  // Los nombres de hoja de Excel: 31 caracteres como máximo, sin `/ \ ? * [ ]`.
  return { sheetName: e.name.replace(/[/\\?*[\]]/g, ' ').slice(0, 31), rows: filas, widths: cols.map((c) => c.ancho), stickyRows: 1 };
}

function salesSheet(ventas: CommissionSale[]): ExcelStyledSheet {
  const cols: Col<CommissionSale>[] = [
    { titulo: 'Orden', ancho: 16, value: (v) => v.order },
    { titulo: 'Cliente', ancho: 30, value: (v) => v.client },
    { titulo: 'Instalada', ancho: 12, value: (v) => formatDateValue(v.since_date) },
    { titulo: 'Sucursal', ancho: 14, value: (v) => v.branch },
    { titulo: 'Zona', ancho: 18, value: (v) => v.zone },
    { titulo: 'Plan', ancho: 28, value: (v) => v.product },
    { titulo: 'Tipo', ancho: 12, value: (v) => (v.sme ? 'PYME' : 'Residencial') },
    { titulo: 'Precio', ancho: 11, value: (v) => v.price, formato: USD },
    { titulo: 'Estado actual', ancho: 14, value: (v) => v.status },
    { titulo: 'Cancelada el', ancho: 12, value: (v) => (v.cancelled_on ? formatDateValue(v.cancelled_on) : '') },
    { titulo: 'Estado de la factura', ancho: 20, value: (v) => v.billing_status },
    { titulo: 'Primera mensualidad', ancho: 18, value: (v) => v.invoice_number ?? '' },
    { titulo: 'Creada el', ancho: 12, value: (v) => (v.invoice_date ? formatDateValue(v.invoice_date) : '') },
    { titulo: 'Plan facturado', ancho: 28, value: (v) => v.invoice_plan ?? '' },
    { titulo: 'Estado', ancho: 12, value: (v) => v.invoice_status ?? '' },
    { titulo: 'Estado del pago', ancho: 18, value: (v) => v.invoice_payment ?? '' },
    { titulo: 'Pagada el', ancho: 12, value: (v) => (v.paid_date ? formatDateValue(v.paid_date) : '') },
    { titulo: 'Gratuita', ancho: 10, value: (v) => (v.is_free ? 'Sí' : '') },
    { titulo: 'Tramo', ancho: 22, value: (v) => (v.tier ? TIER[v.tier] : '') },
    { titulo: 'Clasificación', ancho: 13, value: (v) => CLASSIFICATION[v.classification].label },
    { titulo: 'Motivo', ancho: 40, value: (v) => v.reason },
    { titulo: 'Medio', ancho: 24, value: (v) => v.channel },
    { titulo: 'Oportunidad/Administrador', ancho: 24, value: (v) => v.supervisor_channel },
    { titulo: 'Vendedor', ancho: 30, value: (v) => v.seller },
    { titulo: 'Equipo', ancho: 16, value: (v) => v.equipo },
    { titulo: 'Unidades de negocio', ancho: 28, value: (v) => v.units.join(', ') },
    { titulo: 'Avisos', ancho: 50, value: (v) => v.warnings.join(' · ') },
  ];
  return {
    sheetName: 'Ventas',
    rows: [cabecera(cols), ...ventas.map((v, i) => rowOf(cols, v, i, v.classification !== 'valida'))],
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
  nombre = `Comisiones ${informe.period}`,
  /** Los equipos con sus roles, para nombrar y ordenar las hojas. */
  equipos: { slug: string; name: string; roles: { role: SalesRole; role_label: string }[] }[] = [],
): Promise<void> {
  const orden = equipos.length
    ? equipos
    : [...new Set(informe.payments.map((p) => p.equipo))].map((slug) => ({
      slug,
      name: informe.payments.find((p) => p.equipo === slug)?.team_name ?? slug,
      roles: [...new Set(informe.payments.filter((p) => p.equipo === slug).map((p) => p.role))]
        .map((rol) => ({ role: rol, role_label: etiquetaCargo(rol) })),
    }));
  const nomina = buildPayroll(informe, orden);
  await downloadStyledWorkbook(
    [
      summarySheet(informe, nomina, tasa, etiquetaCargo),
      ...nomina.teams.map((e) => teamSheet(e, nomina, condiciones, tasa, etiquetaCargo)),
      salesSheet(ventas),
    ],
    nombre,
  );
}
