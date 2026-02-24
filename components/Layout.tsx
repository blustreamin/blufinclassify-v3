
import React, { useState, useEffect } from 'react';
import { useStore } from '../store/store';
import { LayoutDashboard, FileText, Upload, AlertTriangle, Library as LibraryIcon, TestTube, Briefcase, TrendingUp, User, PieChart, Users, Database, Eye, EyeOff, BrainCircuit, Scale, Settings, Download, UploadCloud, Trash2, Key } from 'lucide-react';
import { AppRoute } from '../types';
import { getGeminiApiKey, setGeminiApiKey, clearGeminiApiKey } from '../services/geminiService';
import { StorageService } from '../services/storage';

const API_KEY_STORAGE = 'blufin_gemini_key';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state, dispatch } = useStore();
  const activeTab = state.ui.nav.currentRoute;
  const filter = state.ui.ledgerView.filter;
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKeyLocal] = useState('');
  const [keyStatus, setKeyStatus] = useState<'none' | 'set' | 'saved'>('none');

  // Load API key from localStorage on mount (small string, fine for localStorage)
  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE);
    if (stored) {
      setGeminiApiKey(stored);
      setApiKeyLocal(stored);
      setKeyStatus('set');
    }
  }, []);

  const handleSaveKey = () => {
    if (apiKey.trim()) {
      setGeminiApiKey(apiKey.trim());
      localStorage.setItem(API_KEY_STORAGE, apiKey.trim());
      setKeyStatus('saved');
      setTimeout(() => setKeyStatus('set'), 2000);
    }
  };

  const handleClearKey = () => {
    clearGeminiApiKey();
    localStorage.removeItem(API_KEY_STORAGE);
    setApiKeyLocal('');
    setKeyStatus('none');
  };

  const handleExportData = async () => {
    const json = await StorageService.exportState();
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blufin_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const imported = await StorageService.importState(text);
      if (imported) {
        dispatch({ type: 'APP/HYDRATE_SUCCESS', payload: { state: imported } });
      }
    };
    input.click();
  };

  const handleResetApp = async () => {
    if (confirm('This will permanently delete ALL your data. Are you sure?')) {
      if (confirm('Last chance — this cannot be undone. Continue?')) {
        await StorageService.clearAll();
        window.location.reload();
      }
    }
  };

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
        <div className="p-4 border-t border-slate-700">
          <button onClick={() => setShowSettings(!showSettings)} className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors">
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </div>
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

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowSettings(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Settings size={20}/> Settings</h2>
              </div>
              
              <div className="p-6 space-y-6">
                {/* API Key */}
                <div>
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2"><Key size={14}/> Gemini API Key</label>
                  <p className="text-xs text-slate-500 mb-3">Required for AI classification, image parsing, and analysis. Get one free at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-blue-600 underline">aistudio.google.com</a></p>
                  <div className="flex gap-2">
                    <input 
                      type="password" 
                      value={apiKey} 
                      onChange={e => setApiKeyLocal(e.target.value)}
                      placeholder="Enter your Gemini API key..."
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={handleSaveKey} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                      {keyStatus === 'saved' ? 'Saved!' : 'Save'}
                    </button>
                  </div>
                  {keyStatus === 'set' && (
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-green-600 font-medium">API key is configured</span>
                      <button onClick={handleClearKey} className="text-xs text-red-500 hover:text-red-700">Clear Key</button>
                    </div>
                  )}
                </div>

                {/* Data Management */}
                <div>
                  <label className="text-sm font-bold text-slate-700 mb-3 block">Data Management</label>
                  <div className="space-y-2">
                    <button onClick={handleExportData} className="w-full flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition-colors">
                      <Download size={16} className="text-blue-600"/>
                      <div className="text-left">
                        <div className="font-medium text-slate-800">Export All Data</div>
                        <div className="text-xs text-slate-500">Download complete backup as JSON</div>
                      </div>
                    </button>
                    <button onClick={handleImportData} className="w-full flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition-colors">
                      <UploadCloud size={16} className="text-green-600"/>
                      <div className="text-left">
                        <div className="font-medium text-slate-800">Import Data</div>
                        <div className="text-xs text-slate-500">Restore from a backup JSON file</div>
                      </div>
                    </button>
                    <button onClick={handleResetApp} className="w-full flex items-center gap-3 px-4 py-3 border border-red-200 rounded-lg text-sm hover:bg-red-50 transition-colors">
                      <Trash2 size={16} className="text-red-600"/>
                      <div className="text-left">
                        <div className="font-medium text-red-700">Reset Application</div>
                        <div className="text-xs text-red-500">Delete all data and start fresh</div>
                      </div>
                    </button>
                  </div>
                </div>
                
                {/* App Info */}
                <div className="pt-4 border-t border-slate-200 text-xs text-slate-400">
                  <p>bluFin Classify v{state.meta.appVersion} | Schema v{state.meta.schemaVersion}</p>
                  <p className="mt-1">Transactions: {state.transactions.allIds.length} | Documents: {state.documents.allIds.length}</p>
                </div>
              </div>
              
              <div className="p-4 border-t bg-slate-50 rounded-b-2xl flex justify-end">
                <button onClick={() => setShowSettings(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm font-medium hover:bg-slate-300">Close</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Layout;
