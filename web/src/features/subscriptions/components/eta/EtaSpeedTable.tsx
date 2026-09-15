import { Gauge } from 'lucide-react';

import { NeonContainer } from '@/shared/ui';
import { formatInteger } from '@/shared/utils/formatters';

interface EtaSpeedTableProps {
  speedMetrics: Record<string, Record<string, number>>;
}

/** Download-speed penetration split by wired vs wireless access. */
export function EtaSpeedTable({ speedMetrics }: EtaSpeedTableProps) {
  return (
    <NeonContainer
      theme="yellow"
      title="Distribución de Velocidades (Mbps)"
      subtitle="Basado en configuración oficial de Planes.json"
      icon={<Gauge className="h-5 w-5" />}
      noPadding
    >
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-left text-[11px] font-black uppercase text-slate-300">
          <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
            <tr>
              <th className="border-r border-slate-800/80 p-4">Rango de Bajada</th>
              <th className="p-4 text-right">Alámbrico</th>
              <th className="p-4 text-right">Inalámbrico</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {Object.entries(speedMetrics).map(([rango, techs]) => (
              <tr key={rango} className="transition-colors hover:bg-white/5">
                <td className="border-r border-slate-800/80 p-4 font-bold text-slate-300">{rango}</td>
                <td className="p-4 text-right font-mono font-black text-white">{formatInteger(techs.Alámbrico)}</td>
                <td className="p-4 text-right font-mono font-black text-white">{formatInteger(techs.Inalámbrico)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </NeonContainer>
  );
}
