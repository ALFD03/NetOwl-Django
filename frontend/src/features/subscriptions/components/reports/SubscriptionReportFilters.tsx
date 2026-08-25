import { Calendar, Filter, Search, Wifi } from 'lucide-react';
import { PeriodSelector, SearchInput } from '@/shared/ui';

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
        <select value={selectedTech} onChange={(event) => onTechChange(event.target.value as Technology)} className="appearance-none bg-transparent pl-4 pr-10 py-2.5 text-xs font-bold text-white outline-none hover:bg-white/5 cursor-pointer min-w-[130px]">
          <option value="ALL" className="bg-surface-secondary">Todos</option>
          <option value="FTTH" className="bg-surface-secondary">FTTH (Fibra)</option>
          <option value="RF" className="bg-surface-secondary">RF (Radio)</option>
        </select>
      </div>

      <div className="flex items-center shadow-2xl rounded-2xl border border-slate-700/50 bg-surface-secondary overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400">
          <Filter className="w-4 h-4 text-emerald-500" />
          <span className="text-[10px] font-black uppercase tracking-wider">Sucursal</span>
        </div>
        <select value={selectedBranch} onChange={(event) => onBranchChange(event.target.value)} className="appearance-none bg-transparent pl-4 pr-10 py-2.5 text-xs font-bold text-white outline-none hover:bg-white/5 min-w-[140px] cursor-pointer">
          <option value="ALL" className="bg-surface-secondary">Todas</option>
          {branches.map((branch) => <option key={branch} value={branch} className="bg-surface-secondary">{branch}</option>)}
        </select>
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
