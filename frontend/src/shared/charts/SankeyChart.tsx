/**
 * Diagrama de flujo de dos columnas: de dónde sale lo que hay y adónde va.
 *
 * Cada banda es un enlace origen → destino con un grosor proporcional a su
 * valor, así que la pregunta «¿qué parte de lo que entró acabó en X?» se
 * contesta mirando el ancho, sin leer una tabla. Las dos columnas comparten
 * escala: un nodo mide lo que suman sus bandas.
 *
 * Es SVG propio y no un plugin de Chart.js porque no hace falta más que esto, y
 * un controlador más registrado en todas las páginas costaría para un solo
 * gráfico. En pantallas estrechas el contenedor se desplaza en horizontal: la
 * forma no se lee comprimida a la mitad.
 */

import { useMemo, useState } from 'react';

import { cn } from '@/shared/lib/cn';

export interface SankeyNode {
  id: string;
  label: string;
  /** Color del nodo; las bandas toman el del origen. */
  color: string;
  /** Una línea debajo de la etiqueta, p. ej. «de ellos 120 llegaron de ATC». */
  caption?: string;
}

export interface SankeyEnlace {
  origen: string;
  destino: string;
  valor: number;
}

interface Props {
  origenes: SankeyNode[];
  targets: SankeyNode[];
  enlaces: SankeyEnlace[];
  formatValue?: (valor: number) => string;
  /** Alto del dibujo en unidades del viewBox (el ancho es 1000). */
  alto?: number;
  className?: string;
}

const ANCHO = 1000;
const X_ORIGEN = 250;
const X_TARGET = 735;
const NODE = 16;
const HUECO = 28;
/**
 * Alto mínimo que ocupa un nodo en su columna: el de sus dos líneas de texto.
 * Un nodo fino (el arrastre, lo que quedó abierto) se dibuja centrado en ese
 * hueco, así que su etiqueta ni pisa la del vecino ni se sale del dibujo.
 */
const LABEL = 56;
/** Con `caption` la etiqueta lleva una tercera línea. */
const LABEL_WITH_NOTE = 80;
const MARGEN = 12;

interface PlacedNode extends SankeyNode {
  valor: number;
  y: number;
  h: number;
}

interface Column {
  nodos: PlacedNode[];
  alto: number;
}

function colocar(nodos: SankeyNode[], valores: Map<string, number>, escala: number): Column {
  let y = 0;
  const colocados = nodos
    .filter((n) => (valores.get(n.id) ?? 0) > 0)
    .map((n) => {
      const valor = valores.get(n.id) ?? 0;
      const h = Math.max(2, valor * escala);
      const hueco = Math.max(h, n.caption ? LABEL_WITH_NOTE : LABEL);
      const colocado = { ...n, valor, y: y + (hueco - h) / 2, h };
      y += hueco + HUECO;
      return colocado;
    });
  return { nodos: colocados, alto: Math.max(0, y - HUECO) };
}

export function SankeyChart({
  origenes,
  targets: destinos,
  enlaces,
  formatValue: formatValor = (v) => v.toLocaleString('es-VE'),
  alto = 300,
  className,
}: Props) {
  const [activo, setActive] = useState<number | null>(null);

  const dibujo = useMemo(() => {
    const validos = enlaces.filter((e) => e.valor > 0);
    const sumBy = (clave: 'origen' | 'destino') => {
      const m = new Map<string, number>();
      for (const e of validos) m.set(e[clave], (m.get(e[clave]) ?? 0) + e.valor);
      return m;
    };
    const exits = sumBy('origen');
    const entries = sumBy('destino');
    const total = Math.max(1, ...[exits, entries].map((m) => [...m.values()].reduce((a, b) => a + b, 0)));
    const nVisible = (nodos: SankeyNode[], m: Map<string, number>) => nodos.filter((n) => (m.get(n.id) ?? 0) > 0).length;
    const huecos = Math.max(nVisible(origenes, exits), nVisible(destinos, entries)) - 1;
    const escala = (alto - Math.max(0, huecos) * HUECO) / total;

    const leftColumn = colocar(origenes, exits, escala);
    const rightColumn = colocar(destinos, entries, escala);
    // Centra la columna más corta respecto de la más alta.
    const H = Math.max(leftColumn.alto, rightColumn.alto);
    for (const c of [leftColumn, rightColumn]) {
      const d = (H - c.alto) / 2;
      for (const n of c.nodos) n.y += d;
    }
    const izq = leftColumn.nodos;
    const der = rightColumn.nodos;

    const byId = (c: PlacedNode[]) => new Map(c.map((n) => [n.id, n]));
    const mIzq = byId(izq);
    const mDer = byId(der);
    const exitOffset = new Map<string, number>();
    const enterOffset = new Map<string, number>();
    const targetOrder = new Map(der.map((n, i) => [n.id, i]));
    const sourceOrder = new Map(izq.map((n, i) => [n.id, i]));

    const bandas = [...validos]
      .sort(
        (a, b) =>
          (sourceOrder.get(a.origen) ?? 0) - (sourceOrder.get(b.origen) ?? 0) ||
          (targetOrder.get(a.destino) ?? 0) - (targetOrder.get(b.destino) ?? 0),
      )
      .flatMap((e) => {
        const other = mIzq.get(e.origen);
        const d = mDer.get(e.destino);
        if (!other || !d) return [];
        const h = e.valor * escala;
        const y0 = other.y + (exitOffset.get(other.id) ?? 0);
        const y1 = d.y + (enterOffset.get(d.id) ?? 0);
        exitOffset.set(other.id, (exitOffset.get(other.id) ?? 0) + h);
        enterOffset.set(d.id, (enterOffset.get(d.id) ?? 0) + h);
        const xa = X_ORIGEN + NODE;
        const xb = X_TARGET;
        const xm = (xa + xb) / 2;
        const path = [
          `M ${xa} ${y0}`,
          `C ${xm} ${y0}, ${xm} ${y1}, ${xb} ${y1}`,
          `L ${xb} ${y1 + h}`,
          `C ${xm} ${y1 + h}, ${xm} ${y0 + h}, ${xa} ${y0 + h}`,
          'Z',
        ].join(' ');
        return [{ ...e, path, color: other.color, origenLabel: other.label, destinoLabel: d.label }];
      });

    return { izq, der, bandas, H, total: [...exits.values()].reduce((a, b) => a + b, 0) };
  }, [origenes, destinos, enlaces, alto]);

  const pct = (v: number) => (dibujo.total > 0 ? `${((v / dibujo.total) * 100).toFixed(1)}%` : '');
  const banda = activo !== null ? dibujo.bandas[activo] : null;

  return (
    <div className={cn('custom-scrollbar overflow-x-auto', className)}>
      <div className="relative min-w-[640px]">
        <svg
          viewBox={`0 ${-MARGEN} ${ANCHO} ${dibujo.H + 2 * MARGEN}`}
          className="h-auto w-full text-slate-300"
          role="img"
          aria-label="Diagrama de flujo"
        >
          {dibujo.bandas.map((b, i) => (
            <path
              key={`${b.origen}-${b.destino}`}
              d={b.path}
              fill={b.color}
              fillOpacity={activo === null ? 0.32 : activo === i ? 0.6 : 0.12}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              className="cursor-default transition-[fill-opacity] duration-150"
            >
              <title>{`${b.origenLabel} → ${b.destinoLabel}: ${formatValor(b.valor)}`}</title>
            </path>
          ))}

          {dibujo.izq.map((n) => {
            // La nota va en una línea propia: al lado de la cifra se saldría
            // del dibujo por la izquierda.
            const sube = n.caption ? 22 : 11;
            return (
              <g key={n.id}>
                <rect x={X_ORIGEN} y={n.y} width={NODE} height={n.h} rx={4} fill={n.color} />
                <text x={X_ORIGEN - 14} y={n.y + n.h / 2 - sube} textAnchor="end" dominantBaseline="middle" className="fill-current text-[19px] font-bold">
                  {n.label}
                </text>
                <text x={X_ORIGEN - 14} y={n.y + n.h / 2 - sube + 24} textAnchor="end" dominantBaseline="middle" className="fill-current font-mono text-[17px] opacity-80">
                  {formatValor(n.valor)}
                </text>
                {n.caption && (
                  <text x={X_ORIGEN - 14} y={n.y + n.h / 2 - sube + 46} textAnchor="end" dominantBaseline="middle" className="fill-current text-[15px] opacity-60">
                    {n.caption}
                  </text>
                )}
              </g>
            );
          })}

          {dibujo.der.map((n) => (
            <g key={n.id}>
              <rect x={X_TARGET} y={n.y} width={NODE} height={n.h} rx={4} fill={n.color} />
              <text x={X_TARGET + NODE + 14} y={n.y + n.h / 2 - 11} dominantBaseline="middle" className="fill-current text-[19px] font-bold">
                {n.label}
              </text>
              <text x={X_TARGET + NODE + 14} y={n.y + n.h / 2 + 13} dominantBaseline="middle" className="fill-current font-mono text-[17px] opacity-80">
                {formatValor(n.valor)} · {pct(n.valor)}
              </text>
            </g>
          ))}
        </svg>

        <p className="mt-1 h-4 text-center font-mono text-[11px] text-slate-400" aria-live="polite">
          {banda ? `${banda.origenLabel} → ${banda.destinoLabel}: ${formatValor(banda.valor)} (${pct(banda.valor)})` : ''}
        </p>
      </div>
    </div>
  );
}
