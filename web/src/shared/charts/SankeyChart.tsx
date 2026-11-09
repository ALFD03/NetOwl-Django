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

export interface SankeyNodo {
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
  origenes: SankeyNodo[];
  destinos: SankeyNodo[];
  enlaces: SankeyEnlace[];
  formatValor?: (valor: number) => string;
  /** Alto del dibujo en unidades del viewBox (el ancho es 1000). */
  alto?: number;
  className?: string;
}

const ANCHO = 1000;
const X_ORIGEN = 250;
const X_DESTINO = 735;
const NODO = 16;
const HUECO = 28;
/**
 * Alto mínimo que ocupa un nodo en su columna: el de sus dos líneas de texto.
 * Un nodo fino (el arrastre, lo que quedó abierto) se dibuja centrado en ese
 * hueco, así que su etiqueta ni pisa la del vecino ni se sale del dibujo.
 */
const ETIQUETA = 56;
/** Con `caption` la etiqueta lleva una tercera línea. */
const ETIQUETA_CON_NOTA = 80;
const MARGEN = 12;

interface NodoColocado extends SankeyNodo {
  valor: number;
  y: number;
  h: number;
}

interface Columna {
  nodos: NodoColocado[];
  alto: number;
}

function colocar(nodos: SankeyNodo[], valores: Map<string, number>, escala: number): Columna {
  let y = 0;
  const colocados = nodos
    .filter((n) => (valores.get(n.id) ?? 0) > 0)
    .map((n) => {
      const valor = valores.get(n.id) ?? 0;
      const h = Math.max(2, valor * escala);
      const hueco = Math.max(h, n.caption ? ETIQUETA_CON_NOTA : ETIQUETA);
      const colocado = { ...n, valor, y: y + (hueco - h) / 2, h };
      y += hueco + HUECO;
      return colocado;
    });
  return { nodos: colocados, alto: Math.max(0, y - HUECO) };
}

export function SankeyChart({
  origenes,
  destinos,
  enlaces,
  formatValor = (v) => v.toLocaleString('es-VE'),
  alto = 300,
  className,
}: Props) {
  const [activo, setActivo] = useState<number | null>(null);

  const dibujo = useMemo(() => {
    const validos = enlaces.filter((e) => e.valor > 0);
    const suma = (clave: 'origen' | 'destino') => {
      const m = new Map<string, number>();
      for (const e of validos) m.set(e[clave], (m.get(e[clave]) ?? 0) + e.valor);
      return m;
    };
    const salidas = suma('origen');
    const entradas = suma('destino');
    const total = Math.max(1, ...[salidas, entradas].map((m) => [...m.values()].reduce((a, b) => a + b, 0)));
    const nVisibles = (nodos: SankeyNodo[], m: Map<string, number>) => nodos.filter((n) => (m.get(n.id) ?? 0) > 0).length;
    const huecos = Math.max(nVisibles(origenes, salidas), nVisibles(destinos, entradas)) - 1;
    const escala = (alto - Math.max(0, huecos) * HUECO) / total;

    const columnaIzq = colocar(origenes, salidas, escala);
    const columnaDer = colocar(destinos, entradas, escala);
    // Centra la columna más corta respecto de la más alta.
    const H = Math.max(columnaIzq.alto, columnaDer.alto);
    for (const c of [columnaIzq, columnaDer]) {
      const d = (H - c.alto) / 2;
      for (const n of c.nodos) n.y += d;
    }
    const izq = columnaIzq.nodos;
    const der = columnaDer.nodos;

    const porId = (c: NodoColocado[]) => new Map(c.map((n) => [n.id, n]));
    const mIzq = porId(izq);
    const mDer = porId(der);
    const desplSalida = new Map<string, number>();
    const desplEntrada = new Map<string, number>();
    const ordenDestino = new Map(der.map((n, i) => [n.id, i]));
    const ordenOrigen = new Map(izq.map((n, i) => [n.id, i]));

    const bandas = [...validos]
      .sort(
        (a, b) =>
          (ordenOrigen.get(a.origen) ?? 0) - (ordenOrigen.get(b.origen) ?? 0) ||
          (ordenDestino.get(a.destino) ?? 0) - (ordenDestino.get(b.destino) ?? 0),
      )
      .flatMap((e) => {
        const o = mIzq.get(e.origen);
        const d = mDer.get(e.destino);
        if (!o || !d) return [];
        const h = e.valor * escala;
        const y0 = o.y + (desplSalida.get(o.id) ?? 0);
        const y1 = d.y + (desplEntrada.get(d.id) ?? 0);
        desplSalida.set(o.id, (desplSalida.get(o.id) ?? 0) + h);
        desplEntrada.set(d.id, (desplEntrada.get(d.id) ?? 0) + h);
        const xa = X_ORIGEN + NODO;
        const xb = X_DESTINO;
        const xm = (xa + xb) / 2;
        const path = [
          `M ${xa} ${y0}`,
          `C ${xm} ${y0}, ${xm} ${y1}, ${xb} ${y1}`,
          `L ${xb} ${y1 + h}`,
          `C ${xm} ${y1 + h}, ${xm} ${y0 + h}, ${xa} ${y0 + h}`,
          'Z',
        ].join(' ');
        return [{ ...e, path, color: o.color, origenLabel: o.label, destinoLabel: d.label }];
      });

    return { izq, der, bandas, H, total: [...salidas.values()].reduce((a, b) => a + b, 0) };
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
              onMouseEnter={() => setActivo(i)}
              onMouseLeave={() => setActivo(null)}
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
                <rect x={X_ORIGEN} y={n.y} width={NODO} height={n.h} rx={4} fill={n.color} />
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
              <rect x={X_DESTINO} y={n.y} width={NODO} height={n.h} rx={4} fill={n.color} />
              <text x={X_DESTINO + NODO + 14} y={n.y + n.h / 2 - 11} dominantBaseline="middle" className="fill-current text-[19px] font-bold">
                {n.label}
              </text>
              <text x={X_DESTINO + NODO + 14} y={n.y + n.h / 2 + 13} dominantBaseline="middle" className="fill-current font-mono text-[17px] opacity-80">
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
