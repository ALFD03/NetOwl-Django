/**
 * Las tres hojas del formulario que se declara a la reguladora.
 *
 * Aquí viven las columnas y las constantes del formulario; el reparto de las
 * filas y los cálculos de velocidad y consumo los hace el backend
 * (`services/subscriptions/analytics/eta_forms.py`). La división no es
 * caprichosa: lo que depende del cierre del mes se calcula donde están los
 * datos, y lo que es literalmente el texto del impreso vive junto a la hoja.
 *
 * Buena parte de las columnas son constantes. No es un descuido: la reguladora
 * pide la columna aunque su valor sea siempre el mismo, y omitirla desalinea
 * el formulario respecto a la plantilla oficial.
 */

import type { ExcelColumn, ExcelSheet } from '@/shared/lib/excel';
import type {
  EtaInternetForm,
  EtaTelevisionForm,
  EtaTransportForm,
  EtaForms,
} from '@/shared/types/subscriptions';

/** Valores que el impreso trae fijos para todas las filas. */
const OPEN_STATUS = 'Abierto';
const PAYMENT_MODE = 'PREVIO PAGO';
const NOT_APPLICABLE = 'No Aplica';
const DEDICATED_ACCESS = 'Enlace Dedicado';
const TRANSMISSION_MEDIUM = 'Fibra Óptica';
const TV_MODE = 'IPTV';
const LEGAL_ENTITY = 'Persona Jurídica';

/** La parrilla que se declara, idéntica en todas las filas de televisión. */
const TV_CHANNELS =
  'NACIONALES, INFANTILES, TELENOVELAS, RELIGION, NOTICIAS, DEPORTES, PELICULAS, DOCUMENTALES, MUSICALES';
const CHANNEL_COUNT = 108;

/** Formato de Excel para bolívares y para un conteo. */
const BOLIVARS_FORMAT = '#,##0.00';
const INTEGER = '#,##0';

/**
 * La renta básica en bolívares.
 *
 * `null` y no `0` cuando la tasa todavía no está fijada: la celda sale vacía,
 * que es lo que significa "falta el dato". Un cero declararía que el plan es
 * gratuito.
 */
const rent = (price: number, rate: number): number | null =>
  rate > 0 ? Math.round(price * rate * 100) / 100 : null;

const internetColumns = (rate: number): ExcelColumn<EtaInternetForm>[] => [
  { header: 'Nombre del Plan', value: (r) => r.name, width: 38 },
  { header: 'Estatus del Plan', value: () => OPEN_STATUS, width: 16 },
  { header: 'Modalidad de pago', value: () => PAYMENT_MODE, width: 18 },
  { header: 'Tipo de Suscriptor', value: (r) => r.subscriber_type, width: 20 },
  { header: 'Entidad Federal', value: (r) => r.entities, width: 40 },
  { header: 'Número de Suscriptores por Plan', value: (r) => r.subscribers, format: INTEGER, width: 18 },
  { header: 'Renta básica en Bs. (sin IVA)', value: (r) => rent(r.price, rate), format: BOLIVARS_FORMAT, width: 22 },
  { header: 'Tipo de Servicio', value: (r) => r.service_type, width: 16 },
  { header: 'Características del tipo de Acceso', value: () => DEDICATED_ACCESS, width: 26 },
  { header: 'MB Incluidos', value: () => NOT_APPLICABLE, width: 14 },
  { header: 'Velocidad Máxima de Subida (Uplink) (Kbps)', value: (r) => r.uplink_kbps, format: INTEGER, width: 22 },
  { header: 'Velocidad Máxima de Bajada (Downlink) (Kbps)', value: (r) => r.downlink_kbps, format: INTEGER, width: 22 },
  { header: 'Precio MB Adicional', value: () => NOT_APPLICABLE, width: 18 },
  { header: 'Precio por Hora Adicional', value: () => NOT_APPLICABLE, width: 20 },
  { header: 'Tecnología de Acceso al Terminal del Usuario', value: (r) => r.service_type, width: 28 },
  { header: 'Velocidad Promedio Teórica por Plan (Kbps)', value: (r) => r.avg_speed_kbps, format: INTEGER, width: 22 },
  { header: 'Promedio de Consumo del Plan en MB', value: (r) => r.avg_usage_mb, format: INTEGER, width: 24 },
];

const transportColumns = (rate: number): ExcelColumn<EtaTransportForm>[] => [
  { header: 'Nombre del Plan', value: (r) => r.name, width: 38 },
  { header: 'Estatus del Plan', value: () => OPEN_STATUS, width: 16 },
  { header: 'Modalidad de Pago', value: () => PAYMENT_MODE, width: 18 },
  // El transporte de datos no se contrata a título personal: siempre es una
  // empresa, y por eso aquí no se lee del plan como en la hoja de internet.
  { header: 'Tipo de Suscriptor', value: () => LEGAL_ENTITY, width: 20 },
  { header: 'Medio de Transmisión', value: () => TRANSMISSION_MEDIUM, width: 20 },
  { header: 'Renta básica en Bs. (sin IVA)', value: (r) => rent(r.price, rate), format: BOLIVARS_FORMAT, width: 22 },
  { header: 'Número de Suscriptores / Tipo de Enlace', value: (r) => r.subscribers, format: INTEGER, width: 22 },
  { header: 'Velocidad Máxima de Transmisión de Datos (Kbps)', value: (r) => r.speed_kbps, format: INTEGER, width: 24 },
  // Un enlace por suscriptor: cada contrato de transporte es un enlace, así
  // que la reguladora recibe el mismo número por las dos columnas.
  { header: 'Número de Enlaces', value: (r) => r.subscribers, format: INTEGER, width: 18 },
];

const televisionColumns = (rate: number): ExcelColumn<EtaTelevisionForm>[] => [
  { header: 'Nombre del Plan', value: (r) => r.name, width: 38 },
  { header: 'Tipo de suscriptor', value: (r) => r.subscriber_type, width: 20 },
  { header: 'Entidad Federal', value: (r) => r.entities, width: 40 },
  { header: 'Modalidad de Prestación', value: () => TV_MODE, width: 20 },
  // Todo el parque es previo pago. La columna de post pago va vacía y no a
  // cero: cero declararía que existen contratos post pago sin suscriptores.
  { header: 'Nº de Suscriptores — Previo Pago', value: (r) => r.subscribers, format: INTEGER, width: 20 },
  { header: 'Nº de Suscriptores — Post Pago', value: () => null, width: 20 },
  { header: 'Número total de Suscriptores de acuerdo al Plan', value: (r) => r.subscribers, format: INTEGER, width: 24 },
  { header: 'Canales que Incluye', value: () => TV_CHANNELS, width: 60 },
  { header: 'Número de Canales', value: () => CHANNEL_COUNT, format: INTEGER, width: 16 },
  { header: 'Renta básica Bs. — Cliente Nuevo / Previo Pago', value: (r) => rent(r.price, rate), format: BOLIVARS_FORMAT, width: 24 },
  { header: 'Renta básica Bs. — Cliente Nuevo / Post Pago', value: () => null, width: 24 },
  { header: 'Renta básica Bs. — Cliente Existente / Previo Pago', value: (r) => rent(r.price, rate), format: BOLIVARS_FORMAT, width: 24 },
  { header: 'Renta básica Bs. — Cliente Existente / Post Pago', value: () => null, width: 24 },
  { header: 'Estatus de Comercialización del Plan', value: () => OPEN_STATUS, width: 26 },
];

/**
 * El libro entero, en el orden en que la reguladora espera las hojas.
 *
 * Se devuelven las tres siempre, también las vacías: en un formulario oficial
 * "ninguno" es una respuesta, y una hoja que falta no se lee como un cero sino
 * como un impreso incompleto.
 */
export const etaFormSheets = (
  forms: EtaForms,
  rate: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada hoja lleva su propio tipo de fila.
): ExcelSheet<any>[] => [
  {
    rows: forms.internet ?? [],
    columns: internetColumns(rate),
    sheetName: 'Internet',
  },
  {
    rows: forms.transport ?? [],
    columns: transportColumns(rate),
    sheetName: 'Transporte de Datos',
  },
  {
    rows: forms.television ?? [],
    columns: televisionColumns(rate),
    sheetName: 'Televisión',
  },
];

/**
 * Nombre del archivo: qué se declara, de qué cierre y a qué tasa.
 *
 * La tasa entra en el nombre porque el mismo mes se puede exportar dos veces
 * —a la tasa con la que se declara y a la de hoy— y los dos libros son
 * idénticos salvo en las columnas de renta. Sin distinguirlos, el segundo pisa
 * al primero en la carpeta de descargas y nadie sabe cuál declaró.
 */
export const etaFormFileName = (period: string, rateSuffix = ''): string =>
  `Formularios ETA ${period}${rateSuffix ? ` (${rateSuffix})` : ''}`.trim();

/** Cuántas filas tiene el libro. Con cero no hay nada que declarar. */
export const formRowCount = (forms: EtaForms | undefined): number =>
  (forms?.internet?.length ?? 0)
  + (forms?.transport?.length ?? 0)
  + (forms?.television?.length ?? 0);
