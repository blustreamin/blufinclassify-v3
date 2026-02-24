
import React from 'react';
import { useStore } from '../store/store';
import { LayoutDashboard, FileText, Upload, AlertTriangle, Library as LibraryIcon, TestTube, Briefcase, TrendingUp, User, PieChart, Users, Database, Eye, EyeOff, BrainCircuit, Scale } from 'lucide-react';
import { AppRoute } from '../types';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state, dispatch } = useStore();
  const activeTab = state.ui.nav.currentRoute;
  const filter = state.ui.ledgerView.filter;

  const navItems: { id: AppRoute; label: string; icon: any }[] = [
    { id: 'ledger', label: 'Master Ledger', icon: Database },
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'master_analysis', label: 'Master Analysis', icon: BrainCircuit },
    { id: 'company_expenses', label: 'Company Expenses', icon: Briefcase },
    { id: 'company_revenue', label: 'Company Revenue', icon: TrendingUp },
    { id: 'director_personal', label: 'Director & Personal', icon: User },
    { id: 'reconciliation', label: 'Director Reconciliation', icon: Scale }, // Added
    { id: 'p_n_l', label: 'Company P&L', icon: PieChart },
    { id: 'registries', label: 'Registries', icon: Users },
    { id: 'ingest', label: 'Ingest & Upload', icon: Upload },
    { id: 'library', label: 'File Repository', icon: LibraryIcon },
  ];

  const toggleFilter = (key: "showDrafts" | "showExcluded" | "includeDraftsInAnalytics") => {
      dispatch({ type: 'UI/TOGGLE_FILTER', payload: { key } });
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-xl z-20">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold text-blue-400">bluFin v3</h1>
          <p className="text-xs text-slate-400 mt-1">Locked State Architecture</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => dispatch({ type: 'UI/NAVIGATE', payload: { route: item.id } })}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium ${
                activeTab === item.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        {/* Global Filter Bar */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
                <span className="uppercase tracking-wide font-bold text-slate-400">Global View Filters:</span>
                
                <button onClick={() => toggleFilter('showDrafts')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${filter.showDrafts ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {filter.showDrafts ? <Eye size={14}/> : <EyeOff size={14}/>}
                    {filter.showDrafts ? 'Show Drafts' : 'Hide Drafts'}
                </button>

                <button onClick={() => toggleFilter('showExcluded')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${filter.showExcluded ? 'bg-slate-200 text-slate-800 border border-slate-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {filter.showExcluded ? <Eye size={14}/> : <EyeOff size={14}/>}
                    {filter.showExcluded ? 'Show Excluded' : 'Hide Excluded'}
                </button>

                <div className="h-4 w-px bg-slate-300 mx-2"></div>

                <button onClick={() => toggleFilter('includeDraftsInAnalytics')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${filter.includeDraftsInAnalytics ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`} title="Include draft rows in KPI calculations if they meet other criteria">
                    <PieChart size={14}/>
                    Include Drafts in Analytics {filter.includeDraftsInAnalytics ? '(ON)' : '(OFF)'}
                </button>
            </div>
        </div>

        <div className="p-4 absolute top-14 w-full z-50 pointer-events-none flex flex-col gap-2 items-center">
            {state.ui.banners.map(b => (
                <div key={b.id} className="pointer-events-auto bg-red-600 text-white px-4 py-3 rounded shadow-lg flex items-center gap-3 animate-bounce-in">
                    <AlertTriangle size={18} />
                    <span className="text-sm font-bold">{b.title}: {b.message}</span>
                    <button onClick={() => dispatch({ type: 'UI/BANNER_DISMISS', payload: { id: b.id } })} className="ml-4 text-xs bg-white/20 px-2 py-1 rounded hover:bg-white/30">Dismiss</button>
                </div>
            ))}
        </div>
        <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
