import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { router } from '@inertiajs/react';
import { formatPeriodoLabel } from '@/utils/formatters';
import { 
  Building2, TrendingUp, RefreshCw, Calendar, Search, Filter, Wifi
} from 'lucide-react';

interface Props {
  reportData: any;
}

const f2 = (val: any) => Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f0 = (val: any) => Math.floor(Number(val || 0)).toLocaleString('en-US');

export default function SalesReport({ reportData = {} }: Props) {
  const sites = reportData.data || [];
  const periods = reportData.periods || [];
  const currentPeriod = reportData.period || '';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedTech, setSelectedTech] = useState<'ALL' | 'FTTH' | 'RF' | 'GPON'>('ALL');

  const branchList = useMemo(() => {
    const branches = new Set<string>();
    sites.forEach((site: any) => {
      site.technologies?.forEach((tech: any) => {
        tech.nodes?.forEach((node: any) => {
          if (node.sucursal) branches.add(node.sucursal);
        });
      });
    });
    return Array.from(branches).sort();
  }, [sites]);

  // --- LÓGICA DE FILTRADO Y RE-CÁLCULO DINÁMICO ---
  const filteredData = useMemo(() => {
    return sites.map((site: any) => {
      const siteMatchesSearch = site.site.toLowerCase().includes(searchTerm.toLowerCase());

      const filteredTechs = site.technologies?.map((tech: any) => {
        // Filtrar por tecnología si no es ALL
        if (selectedTech !== 'ALL') {
          const techNormalized = tech.technology?.toUpperCase();
          if (selectedTech === 'FTTH' && !['FTTH', 'GPON'].includes(techNormalized)) return null;
          if (selectedTech === 'RF' && techNormalized !== 'RF') return null;
        }

        const filteredNodes = tech.nodes?.filter((node: any) => {
          const nodeMatchesSearch = node.zona_sucursal.toLowerCase().includes(searchTerm.toLowerCase());
          const branchMatches = selectedBranch === 'ALL' || node.sucursal === selectedBranch;
          return (siteMatchesSearch || nodeMatchesSearch) && branchMatches;
        });

        if (filteredNodes && filteredNodes.length > 0) {
          const sumIni = filteredNodes.reduce((acc: number, n: any) => acc + n.activos_inicio, 0);
          const sumFin = filteredNodes.reduce((acc: number, n: any) => acc + n.activos_final, 0);
          const sumNuevos = filteredNodes.reduce((acc: number, n: any) => acc + n.nuevos, 0);
          const sumReact = filteredNodes.reduce((acc: number, n: any) => acc + n.reactivaciones, 0);
          const dynamicCrecimiento = sumIni > 0 ? ((sumFin - sumIni) / sumIni) * 100 : 0;

          return { 
            ...tech, 
            nodes: filteredNodes, 
            dynamic: { 
              activos_inicio: sumIni, 
              activos_final: sumFin, 
              nuevos: sumNuevos,
              reactivaciones: sumReact,
              crecimiento: dynamicCrecimiento 
            } 
          };
        }
        return null;
      }).filter(Boolean);

      if (filteredTechs && filteredTechs.length > 0) {
        return { ...site, technologies: filteredTechs };
      }
      return null;
    }).filter(Boolean);
  }, [sites, searchTerm, selectedBranch, selectedTech]);

  const calcComercial = (inicio: number, final: number) => {
    const cierreEsperado = inicio * 1.06;
    const objetivo = inicio * 0.06;
    const faltante = cierreEsperado - final;
    const tasaCumplimiento = cierreEsperado > 0 ? (final / cierreEsperado) * 100 : 0;
    return { cierreEsperado, objetivo, faltante, tasaCumplimiento };
  };

  const handlePeriodChange = (period: string) => {
    router.get('/subscriptions/sales-report/', { period }, { preserveState: true });
  };

  return (
    <AppLayout title="Reporte Regional de Ventas">
      <SubHeader activeTab="sales" />

      {/* --- BARRA DE FILTROS --- */}
      <div className="mb-8 flex flex-wrap items-center gap-4">
        {/* Mes */}
        <div className="flex items-center shadow-2xl rounded-xl border border-slate-700/50 bg-[#0f1a36] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400">
            <Calendar className="w-4 h-4 text-brand" />
            <span className="text-[10px] uppercase font-black tracking-wider">Mes</span>
          </div>
          <select value={currentPeriod} onChange={(e) => handlePeriodChange(e.target.value)} className="appearance-none bg-transparent pl-4 pr-10 py-2.5 text-xs font-bold text-white cursor-pointer outline-none hover:bg-white/5">
            {periods.map((p: string) => <option key={p} value={p} className="bg-[#0f1a36]">{formatPeriodoLabel(p)}</option>)}
          </select>
        </div>

        {/* Tipo de Servicio */}
        <div className="flex items-center shadow-2xl rounded-xl border border-slate-700/50 bg-[#0f1a36] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400">
            <Wifi className="w-4 h-4 text-brand" />
            <span className="text-[10px] uppercase font-black tracking-wider">Servicio</span>
          </div>
          <select value={selectedTech} onChange={(e) => setSelectedTech(e.target.value as any)} className="appearance-none bg-transparent pl-4 pr-10 py-2.5 text-xs font-bold text-white cursor-pointer outline-none hover:bg-white/5 min-w-[130px]">
            <option value="ALL" className="bg-[#0f1a36]">Todos</option>
            <option value="FTTH" className="bg-[#0f1a36]">FTTH (Fibra)</option>
            <option value="RF" className="bg-[#0f1a36]">RF (Radio)</option>
          </select>
        </div>

        {/* Sucursal */}
        <div className="flex items-center shadow-2xl rounded-xl border border-slate-700/50 bg-[#0f1a36] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400">
            <Filter className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] uppercase font-black tracking-wider">Sucursal</span>
          </div>
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="appearance-none bg-transparent pl-4 pr-10 py-2.5 text-xs font-bold text-white cursor-pointer outline-none hover:bg-white/5 min-w-[140px]">
            <option value="ALL" className="bg-[#0f1a36]">Todas</option>
            {branchList.map(b => <option key={b} value={b} className="bg-[#0f1a36]">{b}</option>)}
          </select>
        </div>

        {/* Buscador */}
        <div className="flex-1 min-w-[280px] flex items-center shadow-2xl rounded-xl border border-slate-700/50 bg-[#0f1a36] overflow-hidden group">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400 group-focus-within:text-brand transition-colors">
            <Search className="w-4 h-4" />
          </div>
          <input type="text" placeholder="Buscar por Sede o Zona..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-transparent w-full px-4 py-2.5 text-xs font-bold text-white outline-none" />
        </div>
      </div>

      {/* --- CONTENIDO --- */}
      <div className="space-y-10">
        {filteredData.length === 0 ? (
          <div className="p-20 text-center text-slate-500 bg-surface-secondary border border-dashed border-slate-800 rounded-3xl">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-10" />
            <h3 className="text-lg font-bold text-slate-400">No hay datos que coincidan con los filtros</h3>
          </div>
        ) : (
          filteredData.map((siteGroup: any) => (
            <div key={siteGroup.site} className="bg-surface-secondary border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="bg-slate-800/40 p-6 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-brand/10 rounded-2xl border border-brand/20 shadow-lg shadow-brand/5">
                    <Building2 className="w-6 h-6 text-brand" />
                  </div>
                  <h3 className="text-xl font-black text-white tracking-tight">{siteGroup.site}</h3>
                </div>
              </div>

              <div className="p-6 space-y-12">
                {siteGroup.technologies?.map((tech: any) => {
                  const d = tech.dynamic;
                  const m = calcComercial(d.activos_inicio, d.activos_final);

                  return (
                    <div key={tech.technology} className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 bg-[#0b1326] p-4 rounded-2xl border border-slate-800/50 shadow-inner">
                        <div className="flex flex-col"><span className="text-[9px] font-black text-slate-500 uppercase">Tecnología</span><span className="text-sm font-black text-brand">{tech.technology}</span></div>
                        <div className="flex flex-col"><span className="text-[9px] font-black text-slate-500 uppercase">Base Inicio</span><span className="text-sm font-black text-white">{f0(d.activos_inicio)}</span></div>
                        <div className="flex flex-col"><span className="text-[9px] font-black text-slate-500 uppercase">Objetivo (6%)</span><span className="text-sm font-black text-white">+{f0(m.objetivo)}</span></div>
                        <div className="flex flex-col"><span className="text-[9px] font-black text-slate-500 uppercase">Cierre Esperado</span><span className="text-sm font-black text-white">{f0(m.cierreEsperado)}</span></div>
                        <div className="flex flex-col border-l border-slate-800/50 pl-4">
                          <span className="text-[9px] font-black text-slate-500 uppercase">Cumplimiento</span>
                          <span className={`text-sm font-black ${m.tasaCumplimiento >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>{f2(m.tasaCumplimiento)}%</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-slate-500 uppercase">Crecimiento</span>
                          <span className={`text-sm font-black ${d.crecimiento >= 6 ? 'text-emerald-400' : 'text-rose-400'}`}>{f2(d.crecimiento)}%</span>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-separate border-spacing-0">
                          <thead>
                            <tr className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                              <th className="pb-3 pl-2">Nodo / Zona</th>
                              <th className="pb-3 text-right">Inicio</th>
                              <th className="pb-3 text-right text-emerald-500"><TrendingUp className="w-3 h-3 inline mr-1"/>Inst.</th>
                              <th className="pb-3 text-right text-blue-400"><RefreshCw className="w-3 h-3 inline mr-1"/>React.</th>
                              <th className="pb-3 text-right">C. Neto %</th>
                              <th className="pb-3 text-right">Crec %</th>
                              <th className="pb-3 text-right text-amber-500 font-bold">Faltante</th>
                              <th className="pb-3 text-right">Cumpl %</th>
                              <th className="pb-3 text-right pr-2">Cierre</th>
                            </tr>
                          </thead>
                          <tbody className="text-xs font-bold divide-y divide-slate-800/50">
                            {tech.nodes?.map((node: any, idx: number) => {
                              const nm = calcComercial(node.activos_inicio, node.activos_final);
                              return (
                                <tr key={idx} className="group hover:bg-white/5 transition-colors">
                                  <td className="py-3 pl-2 text-white font-black">{node.zona_sucursal}</td>
                                  <td className="py-3 text-right text-slate-400">{f0(node.activos_inicio)}</td>
                                  <td className="py-3 text-right text-emerald-400">+{f0(node.nuevos)}</td>
                                  <td className="py-3 text-right text-blue-400">{f0(node.reactivaciones)}</td>
                                  <td className="py-3 text-right text-rose-500/70">{f2(node.churn_neto_pct)}%</td>
                                  <td className={`py-3 text-right ${node.crecimiento >= 6 ? 'text-emerald-400' : 'text-rose-400'}`}>{f2(node.crecimiento)}%</td>
                                  <td className="py-3 text-right text-amber-500/80 font-black">{f0(nm.faltante)}</td>
                                  <td className="py-3 text-right">
                                    <div className="flex flex-col items-end">
                                      <span className={nm.tasaCumplimiento >= 100 ? 'text-emerald-400 font-black' : 'text-amber-400 font-black'}>{f2(nm.tasaCumplimiento)}%</span>
                                      <div className="w-12 h-1 bg-slate-800 mt-1 rounded-full overflow-hidden">
                                        <div className={`h-full ${nm.tasaCumplimiento >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(nm.tasaCumplimiento, 100)}%` }} />
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 text-right pr-2 text-white font-black">{f0(node.activos_final)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  );
}