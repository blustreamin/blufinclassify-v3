
import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, EntityTypeOverride, Scope, Flow } from '../types';
import { useStore } from '../store/store';
import { X, Save, RotateCcw, CheckCircle, Shield, AlertTriangle } from 'lucide-react';
import { getEffectiveTransaction } from '../services/utils';
import { getAllowedCategories, validateManualClassification, canSaveReviewed, getCategoryName } from '../services/taxonomy';

interface ManualClassifyModalProps {
    txn: Transaction;
    onClose: () => void;
}

const ENTITY_TYPES: EntityTypeOverride[] = [
    'CompanyVendor', 
    'PersonalMerchant', 
    'Client', 
    'Employee', 
    'ManagementOverhead', 
    'BankCharge', 
    'Unknown'
];

export const ManualClassifyModal: React.FC<ManualClassifyModalProps> = ({ txn, onClose }) => {
    const { state, dispatch } = useStore();
    const effective = useMemo(() => getEffectiveTransaction(txn), [txn]);

    // L1: Scope
    const [scope, setScope] = useState<Scope>(effective.scope || 'Company');
    // L2: Flow
    const [flow, setFlow] = useState<Flow>(effective.flow || 'Expense');
    // L3: Category
    const [categoryCode, setCategoryCode] = useState(effective.categoryCode || '');
    
    // Entity & Meta
    const [entityType, setEntityType] = useState<EntityTypeOverride>((effective.entityType as EntityTypeOverride) || 'Unknown');
    const [entityCanonical, setEntityCanonical] = useState(effective.vendorName || '');
    const [notes, setNotes] = useState(effective.notes || '');

    // Reset logic if txn changes
    useEffect(() => {
        const fresh = getEffectiveTransaction(txn);
        setScope(fresh.scope || 'Company');
        setFlow(fresh.flow || 'Expense');
        setCategoryCode(fresh.categoryCode || '');
        setEntityType((fresh.entityType as EntityTypeOverride) || 'Unknown');
        setEntityCanonical(fresh.vendorName || '');
        setNotes(fresh.notes || '');
    }, [txn]);

    // Validation State
    const [validationError, setValidationError] = useState<string | null>(null);

    // Derived allowed categories based on Scope/Flow
    const allowedCategories = useMemo(() => getAllowedCategories(scope, flow), [scope, flow]);

    // Effect: If Scope or Flow changes, validate category. 
    // If current category is invalid for new scope/flow, reset it (unless it's UNCATEGORIZED)
    useEffect(() => {
        if (categoryCode && categoryCode !== 'UNCATEGORIZED' && !allowedCategories.includes(categoryCode)) {
            setCategoryCode(''); // Reset to force user selection
        }
    }, [scope, flow, allowedCategories, categoryCode]);

    const handleSave = (markReviewed: boolean) => {
        setValidationError(null);

        // Prepare override input
        const input = { scope, flow, category_code: categoryCode || 'UNCATEGORIZED' };
        
        // Strict Validation for Reviewed
        if (markReviewed) {
            if (!canSaveReviewed(input)) {
                setValidationError("Cannot mark as reviewed: Invalid category for selected Scope/Flow, or Uncategorized.");
                return;
            }
            if (entityType !== 'Unknown' && !entityCanonical) {
                setValidationError("Canonical Name is required when Entity Type is known.");
                return;
            }
        } 

        // Dispatch new CLASSIFY action simulating PATCH endpoint
        dispatch({ 
            type: 'TXN/CLASSIFY', 
            payload: { 
                txnId: txn.id, 
                scope, 
                flow, 
                categoryCode, 
                entityType, 
                entityCanonical, 
                notes, 
                markReviewed 
            } 
        });
        
        onClose();
    };

    const handleClear = () => {
        if (confirm("Clear manual override? This will restore original/AI values.")) {
            dispatch({ type: 'TXN/SET_MANUAL_OVERRIDE', payload: { txnId: txn.id, override: null } });
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Shield size={16} className="text-purple-600"/>
                            Manual Classification
                        </h3>
                        <div className="text-xs text-slate-500 mt-1 font-mono truncate max-w-sm" title={txn.description}>
                            {txn.description} ({txn.amount.toLocaleString('en-IN', {style:'currency', currency:'INR'})})
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body (Scrollable) */}
                <div className="p-6 space-y-6 overflow-y-auto">
                    
                    {/* Level 1 & 2: Scope & Flow */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">1. Scope</label>
                            <select 
                                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={scope}
                                onChange={(e) => setScope(e.target.value as Scope)}
                            >
                                <option value="Company">Company</option>
                                <option value="Personal">Personal</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">2. Flow</label>
                            <select 
                                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={flow}
                                onChange={(e) => setFlow(e.target.value as Flow)}
                            >
                                <option value="Expense">Expense (Out)</option>
                                <option value="Income">Income (In)</option>
                            </select>
                        </div>
                    </div>

                    {/* Level 3: Filtered Category */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">3. Category</label>
                        <select 
                            className={`w-full border rounded-lg p-2.5 text-sm bg-white focus:ring-2 outline-none ${!categoryCode ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-300 focus:ring-blue-500'}`}
                            value={categoryCode}
                            onChange={(e) => setCategoryCode(e.target.value)}
                        >
                            <option value="">-- Select Category --</option>
                            <option value="UNCATEGORIZED" className="text-slate-400 italic">Uncategorized (Draft Only)</option>
                            <hr />
                            {allowedCategories.map(code => (
                                <option key={code} value={code}>
                                    {getCategoryName(code, state.registry.categories)}
                                </option>
                            ))}
                        </select>
                        <p className="text-[10px] text-slate-400 mt-1">
                            Filtered by {scope} + {flow}. 
                            {!categoryCode && <span className="text-amber-600 ml-1">Selection required for review.</span>}
                        </p>
                    </div>

                    <div className="h-px bg-slate-100 my-2"></div>

                    {/* Entity Details */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Entity Type</label>
                            <select 
                                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={entityType}
                                onChange={(e) => setEntityType(e.target.value as EntityTypeOverride)}
                            >
                                {ENTITY_TYPES.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Canonical Name</label>
                            <input 
                                type="text"
                                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={entityCanonical}
                                onChange={(e) => setEntityCanonical(e.target.value)}
                                placeholder="e.g. AMAZON"
                                maxLength={120}
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notes (Optional)</label>
                        <textarea 
                            className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none h-20"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Add reason for override..."
                            maxLength={500}
                        />
                    </div>

                    {/* Validation Error Banner */}
                    {validationError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
                            <AlertTriangle size={16} className="shrink-0" />
                            {validationError}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
                    {txn.manualOverride ? (
                        <button onClick={handleClear} className="text-red-600 text-sm font-bold flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded transition-colors">
                            <RotateCcw size={14} /> Clear Override
                        </button>
                    ) : (
                        <div></div>
                    )}
                    
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg text-sm transition-colors">
                            Cancel
                        </button>
                        <button 
                            onClick={() => handleSave(false)} 
                            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-100 text-sm flex items-center gap-2 transition-colors"
                        >
                            <Save size={16} /> Save Draft
                        </button>
                        <button 
                            onClick={() => handleSave(true)} 
                            disabled={!categoryCode || categoryCode === 'UNCATEGORIZED'}
                            className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2 shadow-sm transition-colors"
                        >
                            <CheckCircle size={16} /> Save & Reviewed
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
