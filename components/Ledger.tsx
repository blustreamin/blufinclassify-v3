
import React, { useState, useMemo } from 'react';
import { useStore } from '../store/store';
import { isAnalyticsReady, resolveCanonical } from '../services/analysis';
import { Transaction, FailsafeResult } from '../types';
import { Search, Download, AlertTriangle, CheckCircle, BrainCircuit, Sparkles, Check, X, Loader2, Edit3, ShieldCheck, Shield } from 'lucide-react';
import { exportLedgerToCsv } from '../services/export';
import { runCoreIntelligence } from '../services/geminiService';
import { runFailsafeClassification } from '../services/failsafeClassifier';
import { getEffectiveTransaction } from '../services/utils';
import { ManualClassifyModal } from './ManualClassifyModal';
import FailsafePreviewModal from './FailsafePreviewModal';

const Badge: React.FC<{ children: React.ReactNode; color: string; title?: string }> = ({ children, color, title }) => (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${color}`} title={title}>{children}</span>
);

const MasterLedger: React.FC = () => {
    const { state, dispatch } = useStore();
    const currentMonth = state.context.selectedMonth;
    const filter = state.ui.ledgerView.filter;
    
    // Local UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterInstrument, setFilterInstrument] = useState('ALL');
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
    
    // Failsafe State
    const [failsafeResult, setFailsafeResult] = useState<FailsafeResult | null>(null);

    // 1. Base Set (Month Scope) - USE EFFECTIVE TRANSACTIONS
    const baseTxns = useMemo(() => {
        const ids = state.transactions.byMonth[currentMonth] || [];
        return ids.map(id => {
            const t = state.transactions.byId[id];
            return t ? getEffectiveTransaction(t) : null;
        }).filter(Boolean) as Transaction[];
    }, [state.transactions, currentMonth]);

    // 2. Visible Set (Global Toggles + Local Filter)
    const visibleTxns = useMemo(() => {
        let data = baseTxns;
        
        // Global Toggles
        if (!filter.showDrafts) data = data.filter(t => t.status !== 'draft');
        if (!filter.showExcluded) data = data.filter(t => t.status !== 'excluded');

        // Local Filter
        if (filterInstrument !== 'ALL') data = data.filter(t => t.instrumentId === filterInstrument);

        // Search
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            data = data.filter(t => 
                t.description.toLowerCase().includes(lower) || 
                t.amount.toString().includes(lower) ||
                (t.vendorName && t.vendorName.toLowerCase().includes(lower))
            );
        }

        return data.sort((a,b) => (a.txnDate || '').localeCompare(b.txnDate || ''));
    }, [baseTxns, filter.showDrafts, filter.showExcluded, filterInstrument, searchTerm]);

    // 3. Analytics Set (Strict)
    const analyticsSet = useMemo(() => {
        return baseTxns.filter(t => isAnalyticsReady(t, { includeDrafts: filter.includeDraftsInAnalytics }));
    }, [baseTxns, filter.includeDraftsInAnalytics]);

    const handleExport = () => {
        exportLedgerToCsv(visibleTxns, state, 'CURRENT', currentMonth);
    };

    const toggleStatus = (t: Transaction) => {
        const newStatus = t.status === 'reviewed' ? 'draft' : 'reviewed';
        dispatch({ type: 'TXN/MANUAL_EDIT', payload: { id: t.id, patch: { status: newStatus } } });
    };

    const handleMagicSuggest = async () => {
        // Run on all UNCLASSIFIED transactions in the current visible month
        const uncategorized = visibleTxns.filter(t => !t.categoryCode && t.amount > 0 && !t.manualOverride);
        if (uncategorized.length === 0) {
            alert("No uncategorized transactions to suggest for!");
            return;
        }

        setIsSuggesting(true);
        try {
            const registries = state.ledger.registries;
            
            if (!registries) {
                alert("Registries not built yet. Please visit Overview first to initialize analysis.");
                return;
            }

            const result = await runCoreIntelligence(
                uncategorized, 
                registries, 
                state.registry.aliasMap, 
                state.registry.instruments
            );
            
            if (result && result.suggestionsByTxn.length > 0) {
                dispatch({ type: 'INTELLIGENCE/APPLY_RESULTS', payload: { result } });
            } else {
                alert("AI could not generate confident suggestions.");
            }
        } catch (e) {
            console.error(e);
            alert("Suggest failed.");
        } finally {
            setIsSuggesting(false);
        }
    };

    const handleFailsafeSuggest = () => {
        // Run on baseTxns (effective) to check all in month, or just visible?
        // Let's run on visible set to respect filters, but typically you want to run on everything unclassified.
        // We will run on ALL transactions in the month to be safe, but only those without manualOverrides?
        // Prompt says "allow bulk-apply... never overwrites existing manualOverride unless user explicitly chooses".
        // The service logic calculates suggestions for all. The modal will handle filtering.
        // We pass ALL month transactions.
        
        // Use raw txns from store to avoid double-layering effective logic in the classifier input (classifier logic handles scope itself)
        const rawTxns = (state.transactions.byMonth[currentMonth] || []).map(id => state.transactions.byId[id]).filter(Boolean);
        
        const result = runFailsafeClassification(
            rawTxns,
            state.ledger.registries,
            state.registry.aliasMap,
            state.registry.instruments
        );
        
        setFailsafeResult(result);
    };

    const acceptSuggestion = (t: Transaction) => {
        if (!t.suggestedCategory) return;
        
        // Use the new classification action to persist correctly
        dispatch({ 
            type: 'TXN/CLASSIFY', 
            payload: { 
                txnId: t.id, 
                categoryCode: t.suggestedCategory,
                markReviewed: true,
                entityCanonical: t.counterpartyNormalized, // Also accept canonical
                // Inherit existing scope/flow if not set, handled by reducer/util but good to be explicit if we knew
            } 
        });
    };

    const rejectSuggestion = (t: Transaction) => {
        dispatch({ 
            type: 'TXN/MANUAL_EDIT', 
            payload: { 
                id: t.id, 
                patch: { 
                    suggestedCategory: null,
                    suggestionConfidence: undefined,
                    suggestionReason: null
                } 
            } 
        });
    };

    const getClassificationBadge = (status: string | undefined) => {
        switch (status) {
            case 'REVIEWED': return <Badge color="bg-purple-100 text-purple-700 border border-purple-200">Reviewed</Badge>;
            case 'CLASSIFIED': return <Badge color="bg-blue-100 text-blue-700">Classified</Badge>;
            case 'PARTIALLY_CLASSIFIED': return <Badge color="bg-orange-100 text-orange-700">Partial</Badge>;
            default: return <Badge color="bg-slate-100 text-slate-500">Unclassified</Badge>;
        }
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><BrainCircuit className="text-blue-600"/> Master Ledger</h2>
                    <p className="text-xs text-slate-500">The single source of truth for all transactions.</p>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <button onClick={() => dispatch({ type: 'CONTEXT/SET_MONTH', payload: { month: getPrevMonth(currentMonth) } })} className="p-1 hover:bg-white rounded text-slate-500">←</button>
                        <span className="font-mono font-bold text-slate-700 px-2">{currentMonth}</span>
                        <button onClick={() => dispatch({ type: 'CONTEXT/SET_MONTH', payload: { month: getNextMonth(currentMonth) } })} className="p-1 hover:bg-white rounded text-slate-500">→</button>
                    </div>
                    
                    <button 
                        onClick={handleFailsafeSuggest}
                        className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 rounded-lg text-sm font-bold transition-colors"
                        title="Run deterministic rules without AI"
                    >
                        <Shield size={16} /> No-AI Classifier
                    </button>

                    <button 
                        onClick={handleMagicSuggest}
                        disabled={isSuggesting}
                        className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                    >
                        {isSuggesting ? <Loader2 className="animate-spin" size={16}/> : <Sparkles size={16} />}
                        Core Intelligence
                    </button>

                    <button onClick={handleExport} className="p-2 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 border border-slate-300">
                        <Download size={18} />
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                        type="text" 
                        placeholder="Search description, amount, or vendor..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm"
                    />
                </div>
                <select 
                    value={filterInstrument}
                    onChange={(e) => setFilterInstrument(e.target.value)}
                    className="border border-slate-300 rounded-lg px-4 py-2 text-sm bg-white"
                >
                    <option value="ALL">All Instruments</option>
                    {state.registry.instrumentOrder.map(id => (
                        <option key={id} value={id}>{state.registry.instruments[id].name}</option>
                    ))}
                </select>
            </div>

            {/* Main Table */}
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 z-10 shadow-sm border-b">
                            <tr>
                                <th className="p-3 w-32">Date</th>
                                <th className="p-3">Description</th>
                                <th className="p-3 w-40">Canonical</th>
                                <th className="p-3 w-32 text-right">Amount</th>
                                <th className="p-3 w-32 text-center">Status</th>
                                <th className="p-3 w-48">Category</th>
                                <th className="p-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {visibleTxns.map(t => {
                                const ready = isAnalyticsReady(t, { includeDrafts: filter.includeDraftsInAnalytics });
                                const canonical = resolveCanonical(t.vendorName || t.clientName || t.description, state.registry.aliasMap);
                                const isManual = !!t.manualOverride;
                                
                                return (
                                <tr key={t.id} className={`hover:bg-slate-50 group ${t.status === 'draft' ? 'bg-amber-50/20' : ''}`}>
                                    <td className={`p-3 font-mono ${!t.txnDate ? 'text-red-500' : 'text-slate-600'}`}>{t.txnDate || 'MISSING'}</td>
                                    <td className="p-3 max-w-[300px] truncate" title={t.description}>
                                        <div className="font-medium text-slate-900">{t.description}</div>
                                        <div className="text-[10px] text-slate-400 mt-0.5">{state.registry.instruments[t.instrumentId]?.name}</div>
                                        <div className="flex gap-1 mt-1 flex-wrap">
                                            {t.status === 'draft' && <Badge color="bg-amber-100 text-amber-700">Draft</Badge>}
                                            {ready && <Badge color="bg-green-50 text-green-600" title="Included in Analytics">Analytics Ready</Badge>}
                                            {/* Classification Status Badge */}
                                            {getClassificationBadge(t.classificationStatus)}
                                        </div>
                                    </td>
                                    <td className="p-3 text-slate-700 font-medium">{canonical}</td>
                                    <td className={`p-3 text-right font-mono font-bold ${t.direction === 'CREDIT' ? 'text-green-600' : 'text-slate-800'}`}>
                                        {t.amount.toLocaleString()}
                                    </td>
                                    <td className="p-3 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <button 
                                                onClick={() => toggleStatus(t)}
                                                className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ${t.status === 'draft' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                                            >
                                                {t.status}
                                            </button>
                                        </div>
                                    </td>
                                    <td className="p-3 text-xs text-slate-500">
                                        {t.categoryCode ? (
                                            <div className="bg-slate-100 px-2 py-1 rounded truncate border border-slate-200 flex items-center justify-between group-hover:border-slate-300">
                                                <span title={t.categoryCode}>{t.categoryCode}</span>
                                                {isManual && <ShieldCheck size={12} className="text-purple-500 ml-1" />}
                                            </div>
                                        ) : t.suggestedCategory ? (
                                            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded px-2 py-1">
                                                <div className="flex flex-col">
                                                    <span className="text-indigo-700 font-bold flex items-center gap-1">
                                                        <Sparkles size={10} /> {t.suggestedCategory}
                                                    </span>
                                                    <span className="text-[9px] text-indigo-400">{Math.round((t.suggestionConfidence || 0) * 100)}% Match</span>
                                                </div>
                                                <div className="flex gap-1 ml-2">
                                                    <button onClick={() => acceptSuggestion(t)} className="p-1 bg-white rounded text-green-600 hover:bg-green-50 border border-indigo-100"><Check size={12}/></button>
                                                    <button onClick={() => rejectSuggestion(t)} className="p-1 bg-white rounded text-red-400 hover:bg-red-50 border border-indigo-100"><X size={12}/></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-slate-300 italic">Uncategorized</div>
                                        )}
                                    </td>
                                    <td className="p-3 text-center">
                                        <button 
                                            onClick={() => setEditingTxn(t)} 
                                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                            title="Manual Classify"
                                        >
                                            <Edit3 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                    {visibleTxns.length === 0 && <div className="p-10 text-center text-slate-400">No transactions found matching filters.</div>}
                </div>

                {/* Footer Stats */}
                <div className="bg-slate-900 text-white p-3 text-xs flex justify-between items-center z-20">
                    <div className="flex gap-6">
                        <div>Total: <span className="font-mono font-bold">{baseTxns.length}</span></div>
                        <div className="text-slate-400">|</div>
                        <div>Visible: <span className="font-mono font-bold">{visibleTxns.length}</span></div>
                        <div>Drafts: <span className="font-mono font-bold text-amber-400">{baseTxns.filter(t=>t.status==='draft').length}</span></div>
                        <div>Excluded: <span className="font-mono font-bold text-slate-400">{baseTxns.filter(t=>t.status==='excluded').length}</span></div>
                    </div>
                    <div className="flex gap-6">
                        <div className="text-slate-400">Analytics Set: <span className="text-green-400 font-bold">{analyticsSet.length} rows</span></div>
                        <div>Visible Net: <span className="font-mono font-bold">{visibleTxns.reduce((acc, t) => acc + (t.direction === 'CREDIT' ? t.amount : -t.amount), 0).toLocaleString()}</span></div>
                    </div>
                </div>
            </div>

            {editingTxn && (
                <ManualClassifyModal 
                    txn={editingTxn} 
                    onClose={() => setEditingTxn(null)} 
                />
            )}

            {failsafeResult && (
                <FailsafePreviewModal 
                    result={failsafeResult} 
                    onClose={() => setFailsafeResult(null)} 
                />
            )}
        </div>
    );
};

// Utils
function getPrevMonth(m: string) {
    const d = new Date(m + "-01");
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
}
function getNextMonth(m: string) {
    const d = new Date(m + "-01");
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 7);
}

export default MasterLedger;
