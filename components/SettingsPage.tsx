
import React, { useState, useEffect } from 'react';
import { useStore } from '../store/store';
import { getGeminiApiKey, setGeminiApiKey, clearGeminiApiKey } from '../services/geminiService';
import { StorageService } from '../services/storage';
import { Key, Download, UploadCloud, Trash2, FileText, Database, Users, Eye, EyeOff, PieChart, Info } from 'lucide-react';

const API_KEY_STORAGE = 'blufin_gemini_key';

type SettingsTab = 'general' | 'files' | 'registries';

const SettingsPage: React.FC = () => {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<SettingsTab>('general');
  const [apiKey, setApiKeyLocal] = useState('');
  const [keyStatus, setKeyStatus] = useState<'none' | 'set' | 'saved'>('none');
  const filter = state.ui.ledgerView.filter;

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

  const handleExport = async () => {
    const json = await StorageService.exportState();
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blufin_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const imported = await StorageService.importState(text);
      if (imported) dispatch({ type: 'APP/HYDRATE_SUCCESS', payload: { state: imported } });
    };
    input.click();
  };

  const handleReset = async () => {
    if (confirm('This will permanently delete ALL your data. Are you sure?')) {
      if (confirm('Last chance — this cannot be undone.')) {
        await StorageService.clearAll();
        window.location.reload();
      }
    }
  };

  const toggleFilter = (key: "showDrafts" | "showExcluded" | "includeDraftsInAnalytics") => {
    dispatch({ type: 'UI/TOGGLE_FILTER', payload: { key } });
  };

  const tabs = [
    { id: 'general' as const, label: 'General' },
    { id: 'files' as const, label: `Files (${state.documents.allIds.length})` },
    { id: 'registries' as const, label: 'Registries' },
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Settings</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* General */}
      {tab === 'general' && (
        <div className="space-y-6">
          {/* API Key */}
          <Section title="Gemini API Key" icon={<Key size={16} className="text-blue-600"/>}>
            <p className="text-xs text-slate-500 mb-3">Required for AI classification. Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-blue-600 underline">aistudio.google.com</a></p>
            <div className="flex gap-2">
              <input type="password" value={apiKey} onChange={e => setApiKeyLocal(e.target.value)} placeholder="Enter your Gemini API key..."
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <button onClick={handleSaveKey} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                {keyStatus === 'saved' ? '✓ Saved' : 'Save'}
              </button>
            </div>
            {keyStatus === 'set' && (
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-green-600 font-medium">API key configured</span>
                <button onClick={handleClearKey} className="text-xs text-red-500 hover:text-red-700">Clear</button>
              </div>
            )}
          </Section>

          {/* View Preferences */}
          <Section title="View Preferences" icon={<Eye size={16} className="text-slate-600"/>}>
            <div className="space-y-3">
              <Toggle label="Show draft transactions" desc="Display unreviewed items in the ledger" active={filter.showDrafts} onToggle={() => toggleFilter('showDrafts')} />
              <Toggle label="Show excluded transactions" desc="Display excluded items in the ledger" active={filter.showExcluded} onToggle={() => toggleFilter('showExcluded')} />
              <Toggle label="Include drafts in analytics" desc="Count draft rows in reports and KPIs" active={filter.includeDraftsInAnalytics} onToggle={() => toggleFilter('includeDraftsInAnalytics')} />
            </div>
          </Section>

          {/* Data Management */}
          <Section title="Data Management" icon={<Database size={16} className="text-slate-600"/>}>
            <div className="space-y-2">
              <ActionRow icon={<Download size={16} className="text-blue-600"/>} label="Export All Data" desc="Download complete backup as JSON" onClick={handleExport} />
              <ActionRow icon={<UploadCloud size={16} className="text-green-600"/>} label="Import Data" desc="Restore from a backup JSON file" onClick={handleImport} />
              <ActionRow icon={<Trash2 size={16} className="text-red-600"/>} label="Reset Application" desc="Delete all data and start fresh" onClick={handleReset} danger />
            </div>
          </Section>

          {/* App Info */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-500">
            <p className="flex items-center gap-2"><Info size={12}/> bluFin Classify v{state.meta.appVersion} • Schema v{state.meta.schemaVersion}</p>
            <p className="mt-1">{state.transactions.allIds.length} transactions • {state.documents.allIds.length} documents • {Object.keys(state.registry.instruments).length} instruments</p>
          </div>
        </div>
      )}

      {/* Files */}
      {tab === 'files' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-50">
            {state.documents.allIds.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No files uploaded yet</div>
            ) : (
              state.documents.allIds.map(id => {
                const doc = state.documents.byId[id];
                if (!doc) return null;
                const inst = state.registry.instruments[doc.instrumentId];
                return (
                  <div key={id} className="px-5 py-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText size={16} className="text-slate-400 shrink-0"/>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-700 truncate">{doc.fileName}</div>
                        <div className="text-xs text-slate-400">{inst?.name || doc.instrumentId} • {doc.transactionCount} txns • {new Date(doc.uploadedAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${doc.status === 'parsed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {doc.status}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Registries */}
      {tab === 'registries' && (
        <div className="space-y-6">
          {/* Instruments */}
          <Section title="Instruments" icon={<Database size={16} className="text-blue-600"/>}>
            <div className="divide-y divide-slate-50">
              {state.registry.instrumentOrder.map(id => {
                const inst = state.registry.instruments[id];
                return (
                  <div key={id} className="py-2 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${inst.instrumentType.includes('COMPANY') || inst.instrumentType.includes('CA') ? 'bg-blue-500' : inst.instrumentType.includes('BNPL') ? 'bg-purple-500' : 'bg-green-500'}`} />
                      <span className="font-medium text-slate-700">{inst.name}</span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{inst.instrumentType}</span>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Alias Map */}
          <Section title={`Alias Map (${Object.keys(state.registry.aliasMap).length})`} icon={<Users size={16} className="text-green-600"/>}>
            {Object.keys(state.registry.aliasMap).length === 0 ? (
              <p className="text-sm text-slate-400">No aliases configured</p>
            ) : (
              <div className="divide-y divide-slate-50 max-h-60 overflow-y-auto">
                {Object.entries(state.registry.aliasMap).map(([alias, canonical]) => (
                  <div key={alias} className="py-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-mono">{alias}</span>
                    <span className="text-slate-700 font-medium">→ {canonical}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
};

// ─── Helpers ───
const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
    <div className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-4">{icon}{title}</div>
    {children}
  </div>
);

const Toggle: React.FC<{ label: string; desc: string; active: boolean; onToggle: () => void }> = ({ label, desc, active, onToggle }) => (
  <button onClick={onToggle} className="w-full flex items-center justify-between py-2 text-left">
    <div>
      <div className="text-sm font-medium text-slate-700">{label}</div>
      <div className="text-xs text-slate-400">{desc}</div>
    </div>
    <div className={`w-10 h-6 rounded-full transition-colors relative ${active ? 'bg-blue-600' : 'bg-slate-200'}`}>
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? 'left-5' : 'left-1'}`} />
    </div>
  </button>
);

const ActionRow: React.FC<{ icon: React.ReactNode; label: string; desc: string; onClick: () => void; danger?: boolean }> = ({ icon, label, desc, onClick, danger }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 border rounded-lg text-sm text-left hover:bg-slate-50 transition-colors ${danger ? 'border-red-200 hover:bg-red-50' : 'border-slate-200'}`}>
    {icon}
    <div>
      <div className={`font-medium ${danger ? 'text-red-700' : 'text-slate-800'}`}>{label}</div>
      <div className={`text-xs ${danger ? 'text-red-500' : 'text-slate-500'}`}>{desc}</div>
    </div>
  </button>
);

export default SettingsPage;
