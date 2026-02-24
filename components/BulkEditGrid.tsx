
import React, { useState, useEffect } from 'react';
import { useStore } from '../store/store';
import { Transaction, ParsedResult } from '../types';
import { Plus, Trash2, Save, X, RefreshCw, Sparkles, ShieldCheck } from 'lucide-react';
import { generateId, validateTransaction, getMonthFromDate, getFinancialYear } from '../services/utils';
import { parseFileUniversal } from '../services/parsers';
import { IDBService } from '../services/idb';
import { classifyTransactionNature } from '../services/natureClassifier';
import { computeDeterministicSuggestionV1 } from '../services/categoryClassifier';

interface BulkEditGridProps {
    docId: string;
    onClose: () => void;
}

const BulkEditGrid: React.FC<BulkEditGridProps> = ({ docId, onClose }) => {
    const { state, dispatch } = useStore();
    const doc = state.documents.byId[docId];
    const existingTxnIds = state.transactions.byDoc[docId] || [];
    
    // Local state for the grid
    const [rows, setRows] = useState<Partial<Transaction>[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        const current = existingTxnIds.map(id => state.transactions.byId[id]).filter(Boolean);
        if (current.length > 0) {
            setRows(current);
        } else {
            // Check if we have raw candidates in ParseReport from IDB (Assisted Mode)
            const loadDrafts = async () => {
                const raw = await IDBService.getParsedData(docId) as ParsedResult;
                if (raw && raw.txns.length > 0) {
                    const drafts: Partial<Transaction>[] = raw.txns.map(t => ({
                        id: generateId(),
                        instrumentId: doc.instrumentId,
                        sourceDocumentId: docId,
                        txnDate: t.txnDate || '',
                        description: t.description,
                        descriptionRaw: t.descriptionRaw, // Preserve raw
                        amount: t.amount || 0,
                        direction: t.direction,
                        categoryCode: '',
                        status: 'draft',
                        needsAttention: t.needsManualDate || (t.issues && t.issues.length > 0)
                    }));
                    setRows(drafts);
                } else {
                    const empty: Partial<Transaction>[] = Array(5).fill(0).map(() => createEmptyRow(doc.instrumentId, doc.id));
                    setRows(empty);
                }
            };
            loadDrafts();
        }
    }, [docId, existingTxnIds.length]);

    const createEmptyRow = (instrumentId: string, sourceDocumentId: string): Partial<Transaction> => ({
        id: generateId(),
        instrumentId,
        sourceDocumentId,
        txnDate: '',
        description: '',
        amount: 0,
        direction: 'DEBIT',
        categoryCode: '',
        status: 'draft',
        needsAttention: true
    });

    const handleChange = (index: number, field: keyof Transaction, value: any) => {
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], [field]: value };
        setRows(newRows);
    };

    const handleAddRow = () => {
        setRows([...rows, createEmptyRow(doc.instrumentId, doc.id)]);
    };

    const handleDeleteRow = (index: number) => {
        const newRows = rows.filter((_, i) => i !== index);
        setRows(newRows);
    };

    const handleForceOCR = async () => {
        if (!confirm("This will discard current rows and re-process the file using the enhanced OCR engine. Continue?")) return;
        setIsProcessing(true);
        try {
            const fileData = await IDBService.getFile(doc.id);
            if (!fileData) throw new Error("File missing");
            const file = new File([fileData.blob], fileData.name, { type: fileData.type });
            
            const result = await parseFileUniversal(file, doc.fileType, doc.instrumentId, { forceMethod: 'OCR' });
            
            // Update Store Metadata
            await IDBService.saveParsedData(doc.id, result);
            dispatch({ type: 'PARSE/SUCCESS', payload: { jobId: generateId(), docId: doc.id, extracted: result } });
            
            // Reload local rows
            const newRows: Partial<Transaction>[] = result.txns.map(t => ({
                 id: generateId(),
                 instrumentId: doc.instrumentId,
                 sourceDocumentId: doc.id,
                 txnDate: t.txnDate || '',
                 description: t.description,
                 descriptionRaw: t.descriptionRaw,
                 amount: t.amount || 0,
                 direction: t.direction,
                 categoryCode: '',
                 status: 'draft',
                 needsAttention: t.needsManualDate || (t.issues && t.issues.length > 0)
            }));
            
            setRows(newRows.length > 0 ? newRows : Array(5).fill(0).map(() => createEmptyRow(doc.instrumentId, doc.id)));
            dispatch({ type: 'UI/TOAST_ADD', payload: { id: generateId(), level: 'success', message: `OCR Complete: ${result.txns.length} rows found`, createdAt: Date.now() } });

        } catch (e) {
            dispatch({ type: 'UI/BANNER_ADD', payload: { id: generateId(), level: 'error', title: 'OCR Error', message: 'Failed to re-process.', createdAt: Date.now(), dismissible: true } });
        } finally {
            setIsProcessing(false);
        }
    };

    // Replaces handleGeminiAnalyze
    const handleAutoClassify = () => {
        const instrument = state.registry.instruments[doc.instrumentId];
        if (!instrument) {
            alert('Instrument definition missing!');
            return;
        }

        setIsProcessing(true);
        let updatedCount = 0;

        const updatedRows = rows.map(r => {
            // Skip rows that already have a category manually set (persistence respect)
            if (r.categoryCode && r.categoryCode !== 'UNCATEGORIZED') return r;
            
            // Skip invalid rows (missing description/amount) to avoid noise
            if (!r.description || !r.amount) return r;

            // 1. Build Partial Transaction for Classification
            const txn: Partial<Transaction> = {
                description: r.description,
                descriptionRaw: r.descriptionRaw || r.description,
                amount: Number(r.amount),
                direction: r.direction,
                txnDate: r.txnDate,
                instrumentId: doc.instrumentId
            };

            // 2. Run Deterministic Pipeline
            // Step A: Nature Classification (Token/Keyword Rules)
            const natureRes = classifyTransactionNature(txn, instrument);
            const enrichedTxn = { ...txn, ...natureRes };

            // Step B: Category Mapping (Nature + Scope -> Category)
            const suggestion = computeDeterministicSuggestionV1(enrichedTxn, instrument);

            // 3. Apply Suggestion if Confidence Threshold Met
            if (suggestion.suggested_category_v1 && (suggestion.suggested_confidence_v1 || 0) >= 0.7) {
                updatedCount++;
                return {
                    ...r,
                    categoryCode: suggestion.suggested_category_v1,
                    // Optionally store confidence/reason if row model supports it in UI
                };
            }

            return r;
        });

        setRows(updatedRows);
        setIsProcessing(false);
        dispatch({ type: 'UI/TOAST_ADD', payload: { id: generateId(), level: 'success', message: `Auto-classified ${updatedCount} rows`, createdAt: Date.now() } });
    };

    const handleSave = () => {
        const validRows: Transaction[] = [];
        rows.forEach(r => {
            if (!r.txnDate && !r.description && !r.amount) return;
            const txn: Transaction = {
                id: r.id || generateId(),
                instrumentId: doc.instrumentId,
                sourceDocumentId: doc.id,
                txnDate: r.txnDate || null,
                postedDate: null,
                description: r.description || "Manual Entry",
                descriptionRaw: r.descriptionRaw || r.description || "",
                amount: Number(r.amount) || 0,
                direction: r.direction as any,
                currency: "INR",
                month: getMonthFromDate(r.txnDate || null),
                financialYear: getFinancialYear(r.txnDate || null),
                // CRITICAL FIX: Explicitly map categoryCode from grid row state to Transaction object.
                // Ensure empty string maps to null or UNCATEGORIZED if preferred, but store expects categoryCode property.
                categoryCode: r.categoryCode || null,
                
                counterpartyId: null,
                counterpartyType: "Unknown",
                confidence: 1,
                status: "reviewed",
                tags: ["MANUAL_BULK"],
                notes: null,
                needsAttention: false,
                issues: [],
                // Ensure parsing metadata is clean for manual overrides
                parse: {
                    method: 'MANUAL',
                    parserId: 'manual_bulk_grid',
                    anchorsMatched: [],
                    warnings: [],
                    rawRow: null
                }
            };
            const validation = validateTransaction(txn);
            txn.needsAttention = validation.needsAttention;
            txn.issues = validation.issues;
            // If validation fails (e.g. missing date), revert to draft so it doesn't get lost in "Reviewed" view
            if (txn.needsAttention) txn.status = "draft";
            validRows.push(txn);
        });

        // 1. Clear existing for this doc to prevent ID collisions or stale data
        dispatch({ type: 'TXN/DELETE_MANY_BY_DOC', payload: { docId: doc.id, reason: 'Bulk Edit Overwrite' } });
        // 2. Insert new set
        dispatch({ type: 'TXN/UPSERT_MANY', payload: { txns: validRows, reason: "Bulk Edit Save" } });
        
        dispatch({ type: 'UI/TOAST_ADD', payload: { id: generateId(), level: 'success', message: 'Transactions Saved & Categories Persisted', createdAt: Date.now() } });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md">
                <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        Bulk Entry: {doc.fileName}
                        <span className="text-xs font-normal bg-slate-700 px-2 py-1 rounded text-slate-300">
                             {state.registry.instruments[doc.instrumentId]?.name}
                        </span>
                    </h2>
                </div>
                <div className="flex gap-3">
                    {/* Deterministic Auto-Classify Button */}
                    <button 
                        onClick={handleAutoClassify}
                        disabled={isProcessing}
                        className="flex items-center gap-2 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-xs font-bold transition-colors disabled:opacity-50 shadow-sm border border-indigo-400"
                    >
                        {isProcessing ? <Sparkles className="animate-spin" size={14}/> : <ShieldCheck size={14} />}
                        No AI Classification
                    </button>

                    {/* Force OCR Button */}
                    <button 
                        onClick={handleForceOCR}
                        disabled={isProcessing}
                        className="flex items-center gap-2 px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded text-xs font-bold transition-colors disabled:opacity-50"
                    >
                        {isProcessing ? <RefreshCw className="animate-spin" size={14}/> : <RefreshCw size={14} />}
                        Force Max OCR
                    </button>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-slate-50">
                <table className="w-full bg-white border border-slate-200 shadow-sm rounded-lg overflow-hidden text-sm">
                    <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                            <th className="p-3 text-left w-10">#</th>
                            <th className="p-3 text-left w-32">Date</th>
                            <th className="p-3 text-left">Description</th>
                            <th className="p-3 text-right w-32">Amount</th>
                            <th className="p-3 text-center w-24">Dr/Cr</th>
                            <th className="p-3 text-left w-48">Category</th>
                            <th className="p-3 text-center w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map((row, idx) => (
                            <tr key={idx} className={`group hover:bg-blue-50/50 ${row.needsAttention ? 'bg-amber-50/30' : ''}`}>
                                <td className="p-2 text-center text-slate-400">{idx + 1}</td>
                                <td className="p-2">
                                    <input type="date" className={`w-full border rounded px-2 py-1 ${!row.txnDate ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}
                                        value={row.txnDate || ''}
                                        onChange={e => handleChange(idx, 'txnDate', e.target.value)}
                                    />
                                </td>
                                <td className="p-2">
                                    <input type="text" className="w-full border border-slate-300 rounded px-2 py-1"
                                        value={row.description || ''}
                                        onChange={e => handleChange(idx, 'description', e.target.value)}
                                        placeholder="Narration"
                                    />
                                    {/* Show raw line if draft */}
                                    {row.needsAttention && row.descriptionRaw && row.descriptionRaw !== row.description && (
                                        <div className="text-[10px] text-slate-400 mt-1 truncate max-w-md">{row.descriptionRaw}</div>
                                    )}
                                </td>
                                <td className="p-2">
                                    <input type="number" className="w-full border border-slate-300 rounded px-2 py-1 text-right"
                                        value={row.amount}
                                        onChange={e => handleChange(idx, 'amount', e.target.value)}
                                    />
                                </td>
                                <td className="p-2 text-center">
                                    <button 
                                        onClick={() => handleChange(idx, 'direction', row.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT')}
                                        className={`text-xs font-bold px-2 py-1 rounded ${row.direction === 'DEBIT' ? 'bg-slate-200 text-slate-700' : 'bg-green-100 text-green-700'}`}
                                    >
                                        {row.direction === 'DEBIT' ? 'DR' : 'CR'}
                                    </button>
                                </td>
                                <td className="p-2">
                                    <select className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                                        value={row.categoryCode || ''}
                                        onChange={e => handleChange(idx, 'categoryCode', e.target.value)}
                                    >
                                        <option value="">Select...</option>
                                        {state.registry.categoryOrder.map(c => (
                                            <option key={c} value={c}>{state.registry.categories[c].name}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="p-2 text-center">
                                    <button onClick={() => handleDeleteRow(idx)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="mt-4 flex justify-between">
                     <button onClick={handleAddRow} className="flex items-center gap-2 text-blue-600 font-semibold hover:bg-blue-50 px-3 py-2 rounded">
                        <Plus size={18} /> Add Row
                     </button>
                     <div className="text-xs text-slate-400 max-w-md text-right">
                        Tips: Classification runs locally using strict rules.
                     </div>
                </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                <button onClick={onClose} className="px-5 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded">Cancel</button>
                <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 flex items-center gap-2">
                    <Save size={18} /> Save Transactions
                </button>
            </div>
        </div>
    );
};

export default BulkEditGrid;
