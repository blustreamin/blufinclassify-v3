
import React, { useState, useEffect } from 'react';
import { useStore } from '../store/store';
import { Home, Database, BarChart3, Settings, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppRoute } from '../types';
import { getGeminiApiKey, setGeminiApiKey, clearGeminiApiKey } from '../services/geminiService';
import { StorageService } from '../services/storage';

const API_KEY_STORAGE = 'blufin_gemini_key';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state, dispatch } = useStore();
  const activeTab = state.ui.nav.currentRoute;
  const [collapsed, setCollapsed] = useState(false);

  // Load API key on mount
  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE);
    if (stored) setGeminiApiKey(stored);
  }, []);

  const navItems: { id: AppRoute; label: string; icon: any }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'ledger', label: 'Ledger', icon: Database },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const isActive = (id: AppRoute) => {
    if (id === 'home') return activeTab === 'home' || activeTab === 'overview' || activeTab === 'ingest';
    if (id === 'reports') return ['reports', 'company_expenses', 'company_revenue', 'director_personal', 'reconciliation', 'p_n_l', 'master_analysis'].includes(activeTab);
    if (id === 'settings') return ['settings', 'registries', 'library', 'parselab'].includes(activeTab);
    return activeTab === id;
  };

  const txnCount = state.transactions.allIds.length;
  const docCount = state.documents.allIds.length;

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-slate-900 text-white flex flex-col transition-all duration-200 ease-out z-20 relative`}>
        {/* Logo */}
        <div className={`${collapsed ? 'px-3 py-5' : 'px-5 py-5'} border-b border-slate-700/50`}>
          {collapsed ? (
            <div className="text-lg font-black text-blue-400 text-center">B</div>
          ) : (
            <div>
              <h1 className="text-lg font-black tracking-tight text-white">blu<span className="text-blue-400">Fin</span></h1>
              <p className="text-[10px] text-slate-500 mt-0.5">{txnCount} txns • {docCount} docs</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 mt-2">
          {navItems.map((item) => {
            const active = isActive(item.id);
            return (
              <button
                key={item.id}
                onClick={() => dispatch({ type: 'UI/NAVIGATE', payload: { route: item.id } })}
                className={`w-full flex items-center ${collapsed ? 'justify-center' : ''} gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                  active 
                    ? 'bg-blue-600/90 text-white shadow-md shadow-blue-600/20' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon size={18} strokeWidth={active ? 2.5 : 1.5} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="p-3 border-t border-slate-700/50 text-slate-500 hover:text-white transition-colors flex items-center justify-center"
        >
          {collapsed ? <ChevronRight size={16}/> : <ChevronLeft size={16}/>}
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Banners */}
        {state.ui.banners.length > 0 && (
          <div className="px-6 py-2 flex flex-col gap-2">
            {state.ui.banners.map(b => (
              <div key={b.id} className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg flex items-center gap-3 text-sm">
                <AlertTriangle size={16} />
                <span className="font-medium">{b.title}: {b.message}</span>
                <button onClick={() => dispatch({ type: 'UI/BANNER_DISMISS', payload: { id: b.id } })} className="ml-auto text-xs text-red-400 hover:text-red-600">Dismiss</button>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
