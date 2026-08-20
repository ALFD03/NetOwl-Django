import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { NeonContainer } from '@/components/UI/NeonContainer';
import { MetricCard } from '@/components/UI/MetricCard'
import { router } from '@inertiajs/react';
import { formatPeriodoLabel } from '@/utils/formatters';
import { SearchInput, PeriodSelector } from '@/components/UI';
import { 
  UserCheck, TrendingUp, RefreshCw, Calendar, Search, Filter, 
  Wifi, Radio, Layers, User, Wrench, Repeat, Target, TrendingDown, Users, UserRoundCheck, Ellipsis, Percent, CircleArrowUp, CircleCheckBig
} from 'lucide-react';

interface Props {
  buData: any;
}

import { formatInteger as f0, formatTwoDecimals as f2 } from '@/components/UI/formatters';

export default function BusinessUnits({ buData = {} }: Props) {
  const groups = buData.data || [];
  const periods = buData.periods || [];
  const currentPeriod = buData.period || '';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedTech, setSelectedTech] = useState<'ALL' | 'FTTH' | 'RF'>('ALL');

  const calcComercial = (inicio: number, final: number) => {
    const cierreEsperado = inicio * 1.06;
    const objetivo = inicio * 0.06;
    const faltante = cierreEsperado - final;
    const tasaCumplimiento = objetivo > 0 ? 100 - ((faltante / objetivo) * 100) : 0;
    return { cierreEsperado, objetivo, faltante, tasaCumplimiento };
  };

  const branchList = useMemo(() => {
    const branches = new Set<string>();
    groups.forEach((g: any) => g.nodes?.forEach((n: any) => { if (n.sucursal) branches.add(n.sucursal); }));
    return Array.from(branches).sort();
  }, [groups]);

  const filteredData = useMemo(() => {
    return groups.map((group: any) => {
      if (group.is_rf && selectedTech === 'FTTH') return null;

      const coordMatches = group.coordinador.toLowerCase().includes(searchTerm.toLowerCase());
      
      const filteredNodes = group.nodes?.filter((node: any) => {
        const zoneMatches = node.zona_sucursal.toLowerCase().includes(searchTerm.toLowerCase());
        const branchMatches = selectedBranch === 'ALL' || node.sucursal === selectedBranch;
        const techMatches = selectedTech === 'ALL' || node.type === selectedTech;
        return (coordMatches || zoneMatches) && branchMatches && techMatches;
      });

      if (filteredNodes && filteredNodes.length > 0) {
        const sumIni = filteredNodes.reduce((acc: number, n: any) => acc + n.activos_inicio, 0);
        const sumFin = filteredNodes.reduce((acc: number, n: any) => acc + n.activos_final, 0);
        const nuevos = filteredNodes.reduce((acc: number, n: any) => acc + (n.nuevos || 0), 0);
        const react = filteredNodes.reduce((acc: number, n: any) => acc + (n.reactivaciones || 0), 0);
        const bajas = filteredNodes.reduce((acc: number, n: any) => acc + (n.bajas || 0), 0);
        const dynCrec = sumIni > 0 ? ((sumFin - sumIni) / sumIni) * 100 : 0;
        const churn_rate = sumIni > 0 ? (bajas / sumIni) * 100 : 0;

        return {
          ...group,
          nodes: filteredNodes,
          dynamic: {
            activos_inicio: sumIni,
            activos_final: sumFin,
            crecimiento: dynCrec,
            nuevos,
            reactivaciones: react,
            bajas,
            churn_rate,
            total_nodos: filteredNodes.length
          }
        };
      }
      return null;
    }).filter(Boolean);
  }, [groups, searchTerm, selectedBranch, selectedTech]);

  const dynamicFtthSummary = useMemo(() => {
    const ftthNodes: any[] = [];
    groups.forEach((g: any) => {
      if (!g.is_rf) {
        g.nodes?.forEach((n: any) => {
          if (n.type === 'FTTH') {
            const branchMatches = selectedBranch === 'ALL' || n.sucursal === selectedBranch;
            const searchMatches = !searchTerm || n.zona_sucursal.toLowerCase().includes(searchTerm.toLowerCase());
            if (branchMatches && searchMatches) {
              ftthNodes.push(n);
            }
          }
        });
      }
    });

    const actIni = ftthNodes.reduce((acc, n) => acc + n.activos_inicio, 0);
    const actFin = ftthNodes.reduce((acc, n) => acc + n.activos_final, 0);
    const nuevos = ftthNodes.reduce((acc, n) => acc + n.nuevos, 0);
    const react = ftthNodes.reduce((acc, n) => acc + n.reactivaciones, 0);
    const bajas = ftthNodes.reduce((acc, n) => acc + n.bajas, 0);
    const crec = actIni > 0 ? ((actFin - actIni) / actIni) * 100 : 0;
    const com = calcComercial(actIni, actFin);
    const churn_rate = actIni > 0 ? (bajas / actIni) * 100 : 0;
    const adiciones_brutas = (nuevos + react) - bajas;

    return {
      activos_inicio: actIni,
      activos_final: actFin,
      nuevos,
      reactivaciones: react,
      bajas,
      crecimiento: crec,
      churn_rate,
      adiciones_brutas,
      total_nodos: ftthNodes.length,
      ...com
    };
  }, [groups, selectedBranch, searchTerm]);

  const handlePeriodChange = (period: string) => {
    router.get('/subscriptions/business-units/', { period }, { preserveState: true });
  };

  return (
    <AppLayout title="Business Units">
      <SubHeader activeTab="business_units" />

      {/* FILTROS */}
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <PeriodSelector
          label="Mes"
          icon={<Calendar className="w-4 h-4 text-brand" />}
          value={currentPeriod}
          options={periods}
          onChange={(v: string) => handlePeriodChange(v)}
        />

        <div className="flex items-center shadow-2xl rounded-2xl border border-slate-700/50 bg-[#0f1a36] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400">
            <Wifi className="w-4 h-4 text-brand" />
            <span className="text-[10px] font-black uppercase tracking-wider">Servicio</span>
          </div>
          <select value={selectedTech} onChange={(e) => setSelectedTech(e.target.value as any)} className="appearance-none bg-transparent pl-4 pr-10 py-2.5 text-xs font-bold text-white outline-none hover:bg-white/5 cursor-pointer min-w-[130px]">
            <option value="ALL" className="bg-[#0f1a36]">Todos</option>
            <option value="FTTH" className="bg-[#0f1a36]">FTTH (Fibra)</option>
            <option value="RF" className="bg-[#0f1a36]">RF (Radio)</option>
          </select>
        </div>

        <div className="flex items-center shadow-2xl rounded-2xl border border-slate-700/50 bg-[#0f1a36] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400">
            <Filter className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] font-black uppercase tracking-wider">Sucursal</span>
          </div>
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="appearance-none bg-transparent pl-4 pr-10 py-2.5 text-xs font-bold text-white outline-none hover:bg-white/5 min-w-[140px] cursor-pointer">
            <option value="ALL" className="bg-[#0f1a36]">Todas</option>
            {branchList.map(b => <option key={b} value={b} className="bg-[#0f1a36]">{b}</option>)}
          </select>
        </div>

        <div className="flex-1 min-w-[280px] flex items-center shadow-2xl rounded-2xl border border-slate-700/50 bg-[#0f1a36] overflow-hidden group">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400 group-focus-within:text-brand transition-colors">
            <Search className="w-4 h-4" />
          </div>
          <SearchInput value={searchTerm} placeholder="Buscar Coordinador o Zona..." onChange={setSearchTerm} className="w-full bg-transparent px-0" />
        </div>
      </div>

      {/* CONSOLIDADO GENERAL FTTH */}
      {selectedTech !== 'RF' && dynamicFtthSummary.total_nodos > 0 && (
        <div className="mb-10">
          <NeonContainer
            theme="cyan"
            title="Consolidado General FTTH"
            subtitle={`Rendimiento global de todos los nodos de Fibra Óptica (${dynamicFtthSummary.total_nodos} nodos)`}
            icon={<Layers className="w-5 h-5" />}
            headerAction={
              <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border ${
                dynamicFtthSummary.tasaCumplimiento >= 100 
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
              }`}>
                {dynamicFtthSummary.tasaCumplimiento >= 100 ? 'Meta Cumplida' : 'En Progreso'}
              </span>
            }
          >
            
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3.5">
              <MetricCard
                label="Activos Incio"
                value={`${f0(dynamicFtthSummary.activos_inicio)}`}
                color="slate"
                icon={<User/>}
              />

              <MetricCard
                label="instalaciones"
                value={`+ ${f0(dynamicFtthSummary.nuevos)}`}
                color="green"
                icon={<Wrench className="text-emerald-400"/>}
              />

              <MetricCard
                label="reactivaciones"
                value={`+ ${f0(dynamicFtthSummary.reactivaciones)}`}
                color="blue"
                icon={<Repeat className="text-sky-400"/>}
              />

              <MetricCard
                label="ingresos reales"
                value={`+ ${f0(dynamicFtthSummary.adiciones_brutas)}`}
                color="purple"
                icon={<TrendingUp className="text-purple-400"/>}
              />

              <MetricCard
                label="objetivo"
                value={`${f0(dynamicFtthSummary.objetivo)}`}
                color="green"
                icon={<Target className="text-emerald-400"/>}
              />

              <MetricCard
                label="bajas"
                value={`- ${f0(dynamicFtthSummary.bajas)}`}
                color="red"
                icon={<TrendingDown className="text-rose-400"/>}
              />

              <MetricCard
                label="activos cierre"
                value={`${f0(dynamicFtthSummary.activos_final)}`}
                color="slate"
                icon={<Users/>}
              />

              <MetricCard
                label="cierre esperado"
                value={`${f0(dynamicFtthSummary.cierreEsperado)}`}
                color="slate"
                icon={<UserRoundCheck/>}
              />

              <MetricCard
                label="faltante"
                value={`${f0(dynamicFtthSummary.faltante)}`}
                color="yellow"
                icon={<Ellipsis className="text-amber-400"/>}
              />

              <MetricCard
                label="churn rate"
                value={`${f2(dynamicFtthSummary.churn_rate)} %`}
                color="red"
                icon={<Percent className="text-rose-400"/>}
              />

              <MetricCard
                label="crecimiento"
                value={`${f2(dynamicFtthSummary.crecimiento)} %`}
                color="green"
                icon={<CircleArrowUp className="text-emerald-400"/>}
              />

              <MetricCard
                label="Tasa de cumplimiento"
                value={`${f2(dynamicFtthSummary.tasaCumplimiento)} %`}
                color={
                  dynamicFtthSummary.tasaCumplimiento >= 100
                    ? 'green'
                    : dynamicFtthSummary.tasaCumplimiento >= 80
                      ? 'yellow'
                      : 'red'
                }
                icon={<CircleCheckBig className={`${dynamicFtthSummary.tasaCumplimiento >= 100 ? 'text-emerald-400' : dynamicFtthSummary.tasaCumplimiento >= 80 ? 'text-amber-400' : 'text-rose-400'}`}/>}
              />
            </div>
          </NeonContainer>
        </div>
      )}

      {/* LISTADO POR COORDINADOR */}
      <div className="space-y-10">
        {filteredData.map((group: any) => {
          const d = group.dynamic;
          const m = calcComercial(d.activos_inicio, d.activos_final);
          const isRf = group.is_rf;
          
          return (
            <NeonContainer
              key={group.coordinador}
              theme={isRf ? 'yellow' : 'blue'}
              title={group.coordinador}
              subtitle={`Gestión de Nodos y Crecimiento Comercial (${d.total_nodos} zonas)`}
              icon={isRf ? <Radio className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
            >
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-7 gap-3 bg-[#0b1326] p-4 rounded-2xl border border-slate-800/50 shadow-inner">
                  <div className="flex flex-col"><span className="text-[9px] font-black text-slate-500 uppercase">Estado</span><span className="text-sm font-black text-brand">Activo</span></div>
                  <div className="flex flex-col"><span className="text-[9px] font-black text-slate-500 uppercase">Base Inicio</span><span className="text-sm font-black text-white font-mono">{f0(d.activos_inicio)}</span></div>
                  <div className="flex flex-col"><span className="text-[9px] font-black text-slate-500 uppercase">Objetivo (6%)</span><span className="text-sm font-black text-white font-mono">+{f0(m.objetivo)}</span></div>
                  <div className="flex flex-col"><span className="text-[9px] font-black text-slate-500 uppercase">Cierre Esperado</span><span className="text-sm font-black text-white font-mono">{f0(m.cierreEsperado)}</span></div>
                  <div className="flex flex-col border-l border-slate-800/50 pl-4">
                    <span className="text-[9px] font-black text-slate-500 uppercase">Cumplimiento</span>
                    <span className={`text-sm font-black font-mono ${m.tasaCumplimiento >= 100 ? 'text-emerald-400' : m.tasaCumplimiento >= 80 ? 'text-amber-400' : 'text-rose-400'}`}>{f2(m.tasaCumplimiento)}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-500 uppercase">Crecimiento</span>
                    <span className={`text-sm font-black font-mono ${d.crecimiento >= 6 ? 'text-emerald-400' : 'text-rose-400'}`}>{f2(d.crecimiento)}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-500 uppercase">Churn Rate</span>
                    <span className={`text-sm font-black font-mono ${d.churn_rate <= 3 ? 'text-emerald-400' : d.churn_rate <= 4 ? 'text-amber-400' : 'text-rose-400'}`}>{f2(d.churn_rate)}%</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-separate border-spacing-0">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                        <th className="pb-3 pl-2">Zona / Sucursal</th>
                        <th className="pb-3 text-right">Inicio</th>
                        <th className="pb-3 text-right text-emerald-500"><TrendingUp className="w-3 h-3 inline mr-1"/>Inst.</th>
                        <th className="pb-3 text-right text-blue-400"><RefreshCw className="w-3 h-3 inline mr-1"/>React.</th>
                        <th className="pb-3 text-right">Bajas</th>
                        <th className="pb-3 text-right">Churn %</th>
                        <th className="pb-3 text-right">Crec %</th>
                        <th className="pb-3 text-right text-amber-500 font-bold">Faltante</th>
                        <th className="pb-3 text-right">Cumpl %</th>
                        <th className="pb-3 text-right pr-2">Cierre</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs font-bold divide-y divide-slate-800/50">
                      {group.nodes?.map((node: any, idx: number) => {
                        const nm = calcComercial(node.activos_inicio, node.activos_final);
                        return (
                          <tr key={idx} className="group hover:bg-white/5 transition-colors">
                            <td className="py-3 pl-2 text-white font-black flex items-center gap-2">
                              {node.type === 'RF' ? (
                                <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[9px] font-bold">RF</span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-brand/10 text-brand border border-brand/20 rounded text-[9px] font-bold">FTTH</span>
                              )}
                              <span>{node.zona_sucursal}</span>
                            </td>
                            <td className="py-3 text-right text-slate-400 font-mono">{f0(node.activos_inicio)}</td>
                            <td className="py-3 text-right text-emerald-400 font-mono">+{f0(node.nuevos)}</td>
                            <td className="py-3 text-right text-blue-400 font-mono">{f0(node.reactivaciones)}</td>
                            <td className="py-3 text-right text-rose-500 font-mono">-{f0(node.bajas)}</td>
                            <td className="py-3 text-right text-rose-500 font-mono">{f2(node.churn_bruto_pct)}%</td>
                            <td className={`py-3 text-right font-mono ${node.crecimiento >= 6 ? 'text-emerald-400' : 'text-rose-400'}`}>{f2(node.crecimiento)}%</td>
                            <td className="py-3 text-right text-amber-500/80 font-black font-mono">{f0(nm.faltante)}</td>
                            <td className="py-3 text-right">
                              <div className="flex flex-col items-end">
                                <span className={`font-mono ${nm.tasaCumplimiento >= 100 ? 'text-emerald-400 font-black' : nm.tasaCumplimiento >= 80 ? 'text-amber-400 font-black' : 'text-rose-400 font-black'}`}>{f2(nm.tasaCumplimiento)}%</span>
                                <div className="w-12 h-1 bg-slate-800 mt-1 rounded-full overflow-hidden">
                                  <div className={`h-full ${nm.tasaCumplimiento >= 100 ? 'bg-emerald-400' : nm.tasaCumplimiento >= 80 ? 'bg-amber-400' :  'bg-rose-400'}`} style={{ width: `${Math.min(nm.tasaCumplimiento, 100)}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="py-3 text-right pr-2 text-white font-black font-mono">{f0(node.activos_final)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </NeonContainer>
          );
        })}
      </div>
    </AppLayout>
  );
}