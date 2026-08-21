import React from 'react';
import { Link, usePage } from '@inertiajs/react';
import type { AppPageProps } from '@/types/inertia';
import { 
  Gauge, 
  BarChart3, 
  Table, 
  TrendingUp, 
  FileSpreadsheet, 
  UserCheck, 
  Lock 
} from 'lucide-react';

interface SubHeaderProps {
  activeTab: 'dashboard' | 'analytics' | 'results' | 'lifetime' | 'sales' | 'business_units' | 'eta';
}

export const SubHeader: React.FC<SubHeaderProps> = ({ activeTab }) => {
  const { props } = usePage<AppPageProps>();

  const { user } = props.auth;
  const { profile } = user;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', href: '/subscriptions/dashboard/', icon: Gauge, perm: true },
    { id: 'analytics', label: 'Analytics', href: '/subscriptions/analytics/', icon: BarChart3, perm: profile.can_view_subs_analytics },
    { id: 'results', label: 'Results', href: '/subscriptions/results/', icon: Table, perm: profile.can_view_subs_results },
    { id: 'lifetime', label: 'Life Time Cycle', href: '/subscriptions/lifetime/', icon: TrendingUp, perm: profile.can_view_subs_lifetime },
    { id: 'sales', label: 'Sales Report', href: '/subscriptions/sales-report/', icon: FileSpreadsheet, perm: profile.can_view_subs_sales },
    { id: 'business_units', label: 'Business Units', href: '/subscriptions/business-units/', icon: UserCheck, perm: profile.can_view_subs_sales },
    { id: 'eta', label: 'ETA Report', href: '/subscriptions/eta-report/', icon: Lock, perm: profile.can_view_eta },
  ];

  return (
    <div className="bg-surface-secondary border border-slate-800 rounded-xl p-4 mb-6 shadow-lg flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-white font-bold text-lg">
        <Gauge className="w-6 h-6 text-brand" />
        <span>Subscriptions</span>
      </div>

      <nav className="flex flex-wrap items-center gap-1.5">
        {tabs.filter(t => t.perm || user.is_superuser).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-brand text-white shadow-md shadow-brand/20'
                  : 'text-slate-400 hover:text-white hover:bg-surface-hover'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};