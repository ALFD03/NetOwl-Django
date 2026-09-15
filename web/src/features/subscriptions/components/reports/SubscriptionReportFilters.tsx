/** Filtros de los reportes comerciales: periodo, tecnología, sucursal y día. */

import { Calendar, Filter, Search, Wifi } from 'lucide-react';
import { PeriodSelector, SearchInput, SelectMenu } from '@/shared/ui';

type Technology = 'ALL' | 'FTTH' | 'RF';

interface Props {
  period: string;
  periods: string[];
  onPeriodChange: (period: string) => void;
  selectedTech: Technology;
  onTechChange: (technology: Technology) => void;
  selectedBranch: string;
  branches: string[];
  onBranchChange: (branch: string) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
}

export function SubscriptionReportFilters({
  period,
  periods,
  onPeriodChange,
  selectedTech,
  onTechChange,
  selectedBranch,
  branches,
  onBranchChange,
  searchTerm,
  onSearchChange,
  searchPlaceholder,
}: Props) {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-4">
      <PeriodSelector
        label="Mes"
        icon={<Calendar className="w-4 h-4 text-brand" />}
        value={period}
        options={periods}
        onChange={onPeriodChange}
      />

      <div className="flex items-center shadow-2xl rounded-2xl border border-slate-700/50 bg-surface-secondary overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400">
          <Wifi className="w-4 h-4 text-brand" />
          <span className="text-[10px] font-black uppercase tracking-wider">Servicio</span>
        </div>
        <SelectMenu
          aria-label="Servicio"
          value={selectedTech}
          options={[
            { value: 'ALL', label: 'Todos' },
            { value: 'FTTH', label: 'FTTH (Fibra)' },
            { value: 'RF', label: 'RF (Radio)' },
          ]}
          onChange={(v) => onTechChange(v as Technology)}
          panelWidth={180}
          className="flex min-w-[130px] cursor-pointer items-center justify-between gap-2 py-2.5 pl-4 pr-3 text-xs font-bold text-white outline-none hover:bg-white/5"
        />
      </div>

      <div className="flex items-center shadow-2xl rounded-2xl border border-slate-700/50 bg-surface-secondary overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400">
          <Filter className="w-4 h-4 text-emerald-500" />
          <span className="text-[10px] font-black uppercase tracking-wider">Sucursal</span>
        </div>
        <SelectMenu
          aria-label="Sucursal"
          value={selectedBranch}
          options={[
            { value: 'ALL', label: 'Todas' },
            ...branches.map((branch) => ({ value: branch, label: branch })),
          ]}
          onChange={onBranchChange}
          panelWidth={200}
          className="flex min-w-[140px] cursor-pointer items-center justify-between gap-2 py-2.5 pl-4 pr-3 text-xs font-bold text-white outline-none hover:bg-white/5"
        />
      </div>

      <div className="flex-1 min-w-[280px] flex items-center shadow-2xl rounded-2xl border border-slate-700/50 bg-surface-secondary overflow-hidden group">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400 group-focus-within:text-brand transition-colors">
          <Search className="w-4 h-4" />
        </div>
        <SearchInput value={searchTerm} placeholder={searchPlaceholder} onChange={onSearchChange} className="w-full bg-transparent px-0" />
      </div>
    </div>
  );
}
