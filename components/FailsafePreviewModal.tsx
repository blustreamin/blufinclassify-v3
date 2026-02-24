
import React, { useState, useMemo } from 'react';
import { useStore } from '../store/store';
import { FailsafeResult, FailsafeSuggestion } from '../types';
import { CheckCircle, AlertTriangle, ShieldCheck, X, Zap } from 'lucide-react';

interface FailsafePreviewModalProps {
    result: FailsafeResult;
    onClose: () => void;
}

const FailsafePreviewModal: React.FC<FailsafePreviewModalProps> = ({ result, onClose }) => {
    const { state, dispatch } = useStore();
    const [minConfidence, setMinConfidence] = useState(0.5);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<'ALL' | 'HIGH_CONF'>('ALL');

    const filteredSuggestions = useMemo(() => {
        return result.suggestions.filter(s => {
            if (viewMode === 'HIGH_CONF') return s.confidence >= 0.8;
            return s.confidence >= minConfidence;
        });
    }, [result, minConfidence, viewMode]);

    // Initialize selection with all visible filtered items
    // (Optional: or let user manually select. Auto-selecting visible is usually friendlier for bulk ops)
    // Here we'll default to NONE selected to be safe, user must click "Select All" or individual.

    const handleSelectAll = () => {
        if (selectedIds.size === filteredSuggestions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredSuggestions.map(s => s.txnId)));
        }
    };

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleApply = () => {
        if (selectedIds.size === 0) return;
        
        const toApply = result.suggestions.filter(s => selectedIds.has(s.txnId));
        
        // Dispatch individual actions (or better, use a bulk action if we had one, but we reuse existing)
        // Ideally we should add TXN/CLASSIFY_MANY, but loop is acceptable for <1000 items in local app.
        // To avoid render thrashing, we might want to batch this in store, but prompt constraint allows reuse.
        // We will dispatch one by one.
        
        let appliedCount = 0;
        toApply.forEach(s => {
            // Only apply if category is not UNCAT
            if (s.categoryCode !== 'UNCATEGORIZED') {
                dispatch({
                    type: 'TXN/CLASSIFY',
                    payload: {
                        txnId: s.txnId,
                        scope: s.scope,
                        flow: s.flow,
                        categoryCode: s.categoryCode,
                        entityType: s.entityType,
                        entityCanonical: s.entityName || undefined,
                        notes: `[Failsafe] ${s.reason}`,
                        markReviewed: false 
                    }
                });
                appliedCount++;
            }
        });

        dispatch({ type: 'UI/TOAST_ADD', payload: { id: Date.now().toString(), level: 'success', message: `Applied ${appliedCount} classifications`, createdAt: Date.now() } });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-fade-in-up">
                
                {/* Header */}
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <ShieldCheck size={20} className="text-green-600"/>
                            Failsafe Classification Preview
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Deterministic Rule Engine • Zero AI • {result.stats.total} suggestions generated
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button 
                                onClick={() => setViewMode('ALL')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${viewMode === 'ALL' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
                            >
                                All Matches
                            </button>
                            <button 
                                onClick={() => setViewMode('HIGH_CONF')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${viewMode === 'HIGH_CONF' ? 'bg-white shadow-sm text-green-700' : 'text-slate-500'}`}
                            >
                                High Confidence ({result.stats.highConfidence})
                            </button>
                        </div>
                        
                        {viewMode === 'ALL' && (
                            <div className="flex items-center gap-2 text-xs">
                                <label>Min Confidence:</label>
                                <input 
                                    type="range" 
                                    min="0.1" 
                                    max="0.9" 
                                    step="0.1" 
                                    value={minConfidence} 
                                    onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                                    className="w-24"
                                />
                                <span className="font-mono font-bold">{Math.round(minConfidence * 100)}%</span>
                            </div>
                        )}
                    </div>

                    <div className="text-xs text-slate-500">
                        Showing {filteredSuggestions.length} rows
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto p-0">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 w-10 text-center">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedIds.size > 0 && selectedIds.size === filteredSuggestions.length}
                                        onChange={handleSelectAll}
                                        className="rounded border-slate-300"
                                    />
                                </th>
                                <th className="p-3">Transaction Info</th>
                                <th className="p-3">Suggested Classification</th>
                                <th className="p-3 w-32">Confidence</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredSuggestions.length === 0 ? (
                                <tr><td colSpan={4} className="p-10 text-center text-slate-400">No suggestions meet criteria.</td></tr>
                            ) : (
                                filteredSuggestions.map(s => {
                                    const txn = state.transactions.byId[s.txnId];
                                    if (!txn) return null;
                                    return (
                                        <tr key={s.txnId} className={`hover:bg-slate-50 ${selectedIds.has(s.txnId) ? 'bg-blue-50/30' : ''}`}>
                                            <td className="p-3 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.has(s.txnId)}
                                                    onChange={() => toggleSelection(s.txnId)}
                                                    className="rounded border-slate-300"
                                                />
                                            </td>
                                            <td className="p-3">
                                                <div className="font-medium text-slate-900 truncate max-w-xs" title={txn.description}>{txn.description}</div>
                                                <div className="text-xs text-slate-500 flex gap-2">
                                                    <span>{txn.amount.toLocaleString()}</span>
                                                    <span>•</span>
                                                    <span>{txn.txnDate}</span>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-700 text-xs px-2 py-0.5 bg-slate-200 rounded">{s.categoryCode}</span>
                                                        {s.entityName && <span className="text-xs text-blue-600 bg-blue-50 px-1.5 rounded">{s.entityName}</span>}
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 mt-1">{s.reason}</span>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={`h-1.5 w-16 rounded-full bg-slate-200 overflow-hidden`}>
                                                        <div 
                                                            className={`h-full ${s.confidence >= 0.8 ? 'bg-green-500' : s.confidence >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`} 
                                                            style={{ width: `${s.confidence * 100}%` }}
                                                        ></div>
                                                    </div>
                                                    <span className="text-xs font-mono">{Math.round(s.confidence * 100)}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
                    <div className="text-xs text-slate-500">
                        {selectedIds.size} transactions selected for update.
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg text-sm transition-colors">
                            Cancel
                        </button>
                        <button 
                            onClick={handleApply} 
                            disabled={selectedIds.size === 0}
                            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2 shadow-sm transition-colors"
                        >
                            <Zap size={16} /> Apply Selected
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FailsafePreviewModal;
