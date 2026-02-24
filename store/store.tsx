
import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { AppState, Document, Transaction, Banner, Toast, LedgerMonthSummary, Instrument, Action, ParsedResult, Job, AuditEvent, EnrichmentRegistries, FinancialReport, CoreIntelligenceResult, ClassificationStatus } from '../types';
import { StorageService } from '../services/storage';
import { INITIAL_INSTRUMENTS, INITIAL_CATEGORIES, INITIAL_COUNTERPARTIES } from '../constants';
import { getMonthFromDate, getFinancialYear, validateTransaction, generateId, generateDeterministicId, getEffectiveTransaction } from '../services/utils';
import { buildRegistries } from '../services/analysis';
import { classifyTransactionNature } from '../services/natureClassifier';
import { computeDeterministicSuggestionV1 } from '../services/categoryClassifier';
import { runDeduplication } from '../services/deduplication';

// --- Initial State ---
const createInitialState = (): AppState => {
  const instruments = INITIAL_INSTRUMENTS.reduce((acc, i) => ({ ...acc, [i.id]: i }), {});
  const categories = INITIAL_CATEGORIES.reduce((acc, c) => ({ ...acc, [c.code]: c }), {});
  const counterparties = INITIAL_COUNTERPARTIES.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});

  return {
    meta: {
      appVersion: "3.5.0", 
      schemaVersion: 6,
      lastSavedAt: null,
      hydrateStatus: "idle",
      hydrateError: null,
    },
    context: {
      orgName: "blustream",
      selectedMonth: new Date().toISOString().substring(0, 7),
      selectedFY: getFinancialYear(new Date().toISOString()) || "2025-26",
      timezone: "Asia/Kolkata",
    },
    registry: {
      instruments,
      instrumentOrder: INITIAL_INSTRUMENTS.map(i => i.id),
      categories,
      categoryOrder: INITIAL_CATEGORIES.map(c => c.code),
      counterparties,
      counterpartyOrder: INITIAL_COUNTERPARTIES.map(c => c.id),
      aliasMap: {},
      rules: { fyStartMonth: 4, currency: "INR" },
    },
    documents: { byId: {}, allIds: [], byInstrumentMonth: {} },
    transactions: { byId: {}, allIds: [], byMonth: {}, byInstrument: {}, byDoc: {}, needsAttention: [] },
    ledger: { monthSummaries: {}, fySummaries: {}, lastComputedAt: null },
    // Initialize Master Analysis Slice
    masterAnalysis: {
        rows: [],
        fileName: undefined,
        loadedAtIso: undefined,
        lastResult: undefined
    },
    ui: {
      nav: { currentRoute: "overview" }, 
      ingestion: { activeInstrumentId: null, uploadModal: { open: false, instrumentId: null }, tileStatus: {} },
      library: { search: "", filter: { month: "2024-03", instrumentId: "ALL", docType: "ALL", parseStatus: "ALL", showArchived: false }, selectedDocId: null },
      ledgerView: { 
          filter: { 
              month: "", 
              instrumentId: "ALL", 
              status: "ALL", 
              confidence: "ALL", 
              needsAttentionOnly: false, 
              search: "",
              showDrafts: true,
              showExcluded: false,
              includeDraftsInAnalytics: true
          }, 
          drilldown: null,
          selectedTxnId: null, 
          editPanelOpen: false 
      },
      audit: { month: "", lastSnapshotAt: null, snapshots: {}, snapshotOrder: [] },
      toasts: [],
      banners: [],
    },
    runtime: { events: [], lastEventAt: null, jobs: {} },
  };
};

// --- Reducer ---
const reducer = (state: AppState, action: Action): AppState => {
  // Deep clone to prevent mutation of nested objects
  const newState = JSON.parse(JSON.stringify(state)) as AppState;
  
  newState.runtime.lastEventAt = Date.now();
  if (action.type.includes('FAIL') || action.type.includes('ERROR')) {
       newState.runtime.events.push({ id: generateId(), ts: Date.now(), type: action.type, details: (action as any).payload });
  }

  switch (action.type) {
    case 'APP/HYDRATE_SUCCESS':
        return { ...action.payload.state, meta: { ...action.payload.state.meta, hydrateStatus: 'ready' } };
    
    case 'APP/HYDRATE_ERROR':
        newState.meta.hydrateStatus = 'error';
        newState.meta.hydrateError = action.payload.error;
        return newState;

    case 'CONTEXT/SET_MONTH':
        newState.context.selectedMonth = action.payload.month;
        newState.context.selectedFY = getFinancialYear(action.payload.month + "-01") || newState.context.selectedFY;
        newState.ui.ledgerView.drilldown = null;
        return newState;

    case 'UI/NAVIGATE':
        newState.ui.nav.currentRoute = action.payload.route;
        return newState;

    case 'UI/TOGGLE_FILTER': {
        const { key } = action.payload;
        newState.ui.ledgerView.filter[key] = !newState.ui.ledgerView.filter[key];
        return newState;
    }

    case 'UI/SET_DRILLDOWN':
        newState.ui.ledgerView.drilldown = action.payload;
        if (action.payload?.field === 'category' && ['CLIENT_RECEIPT', 'OTHER_INCOME'].includes(action.payload.value)) {
             newState.ui.nav.currentRoute = 'company_revenue';
        } else {
             newState.ui.nav.currentRoute = 'company_expenses'; 
        }
        return newState;

    // ... (Keep existing parse/upload handlers) ...
    case 'DOC/UPLOAD_START': return newState;
    case 'DOC/UPLOAD_SUCCESS': {
        const { doc } = action.payload;
        newState.documents.byId[doc.id] = doc;
        newState.documents.allIds = [doc.id, ...newState.documents.allIds.filter(id => id !== doc.id)];
        const key = `${doc.instrumentId}::${doc.statementMonthHint}`;
        newState.documents.byInstrumentMonth[key] = [...(newState.documents.byInstrumentMonth[key] || []), doc.id];
        // Tile Update
        const ts = newState.ui.ingestion.tileStatus[doc.instrumentId] || { instrumentId: doc.instrumentId, month: doc.statementMonthHint, state: 'MISSING', docIds: [], txnCount: 0, needsAttentionCount: 0, lastError: null };
        if (ts.state === 'MISSING' || ts.state === 'FAILED') ts.state = 'UPLOADED';
        if (!ts.docIds.includes(doc.id)) ts.docIds.push(doc.id);
        newState.ui.ingestion.tileStatus[doc.instrumentId] = ts;
        newState.ui.toasts.push({ id: generateId(), level: 'success', message: 'Upload Successful', createdAt: Date.now() });
        return newState;
    }
    case 'DOC/UPLOAD_FAIL':
        newState.ui.banners.push({ id: generateId(), level: 'error', title: 'Upload Failed', message: action.payload.error, createdAt: Date.now(), dismissible: true });
        return newState;
    case 'DOC/DELETE': {
        const { docId } = action.payload;
        delete newState.documents.byId[docId];
        newState.documents.allIds = newState.documents.allIds.filter(id => id !== docId);
        return newState;
    }
    case 'TXN/DELETE_MANY_BY_DOC': {
        const { docId } = action.payload;
        const txnIds = newState.transactions.byDoc[docId] || [];
        txnIds.forEach(id => {
            const t = newState.transactions.byId[id];
            if (!t) return;
            if (t.month) newState.transactions.byMonth[t.month] = newState.transactions.byMonth[t.month]?.filter(x => x !== id);
            delete newState.transactions.byId[id];
        });
        newState.transactions.allIds = newState.transactions.allIds.filter(id => !txnIds.includes(id));
        newState.transactions.needsAttention = newState.transactions.needsAttention.filter(id => !txnIds.includes(id));
        delete newState.transactions.byDoc[docId];
        return newState;
    }
    case 'PARSE/START': return newState;
    case 'PARSE/SUCCESS': {
        const { docId, extracted } = action.payload;
        const doc = newState.documents.byId[docId];
        if (!doc) return state; 
        
        const newTxns: Transaction[] = extracted.txns.map((r, idx) => {
            const id = generateDeterministicId(docId, idx, r.descriptionRaw || '', r.amount || 0);
            const m = getMonthFromDate(r.txnDate || null);
            const fy = getFinancialYear(r.txnDate || null);
            let finalAmount = r.amount ?? 0;
            const v = validateTransaction({ ...r, amount: finalAmount, id, instrumentId: doc.instrumentId });
            
            let txn: Transaction = {
                id,
                instrumentId: doc.instrumentId,
                sourceDocumentId: docId,
                txnDate: r.txnDate || null,
                postedDate: null,
                description: r.description || '',
                descriptionRaw: r.descriptionRaw || '',
                amount: finalAmount,
                direction: r.direction || 'DEBIT',
                currency: 'INR',
                month: m,
                financialYear: fy,
                categoryCode: r.categoryCode || null,
                counterpartyId: null,
                counterpartyType: 'Unknown',
                confidence: r.confidence || 0.8,
                status: 'draft',
                classificationStatus: 'UNCLASSIFIED',
                tags: ['AUTO'],
                notes: null,
                needsAttention: v.needsAttention,
                issues: v.issues,
                parse: r.parse
            } as Transaction;

            // Apply Nature Classifier Layer 1
            const inst = newState.registry.instruments[doc.instrumentId];
            if (inst) {
                // 1. Nature
                const natureEnriched = classifyTransactionNature(txn, inst);
                txn = { ...txn, ...natureEnriched };
                
                // 2. Deterministic Suggestions V1 (Phase 2)
                const suggestion = computeDeterministicSuggestionV1(txn, inst);
                txn = { ...txn, ...suggestion };
            }

            return txn;
        });

        const oldTxnIds = newState.transactions.byDoc[docId] || [];
        newTxns.forEach(t => {
            newState.transactions.byId[t.id] = t;
            newState.transactions.allIds.push(t.id);
            if (t.month) newState.transactions.byMonth[t.month] = [...(newState.transactions.byMonth[t.month] || []), t.id];
            newState.transactions.byInstrument[t.instrumentId] = [...(newState.transactions.byInstrument[t.instrumentId] || []), t.id];
            newState.transactions.byDoc[docId] = [...(newState.transactions.byDoc[docId] || []), t.id];
            if (t.needsAttention) newState.transactions.needsAttention.push(t.id);
        });
        
        doc.parseStatus = newTxns.length > 0 ? (newTxns.every(t => !t.needsAttention) ? 'parsed' : 'partial') : 'manual';
        
        // Run deduplication on all transactions
        try {
            const allTxns = newState.transactions.allIds.map(id => newState.transactions.byId[id]).filter(Boolean);
            const { updatedTransactions, summary } = runDeduplication(allTxns);
            updatedTransactions.forEach(t => { newState.transactions.byId[t.id] = t; });
            if (summary.duplicates_marked > 0) {
                newState.ui.toasts.push({ id: generateId(), level: 'info', message: `Dedup: ${summary.duplicates_marked} duplicates detected`, createdAt: Date.now() });
            }
        } catch (e) {
            console.warn('Dedup failed', e);
        }
        
        newState.ledger.lastComputedAt = Date.now();
        return newState;
    }
    case 'PARSE/FAIL': {
        const { docId, error } = action.payload;
        const doc = newState.documents.byId[docId];
        if (doc) { doc.parseStatus = 'failed'; doc.parseError = error; }
        newState.ui.banners.push({ id: generateId(), level: 'error', title: 'Parse Failed', message: error, createdAt: Date.now(), dismissible: true });
        return newState;
    }
    
    case 'TXN/MANUAL_EDIT': {
        const { id, patch } = action.payload;
        const oldTxn = newState.transactions.byId[id];
        if (!oldTxn) return state;
        const newTxn = { ...oldTxn, ...patch };
        // If assigning a category manually, clear suggestions
        if (patch.categoryCode) {
            newTxn.suggestedCategory = null;
            newTxn.suggestionConfidence = undefined;
            newTxn.suggestionReason = null;
        }
        newState.transactions.byId[id] = newTxn;
        return newState;
    }

    case 'TXN/SET_MANUAL_OVERRIDE': {
        const { txnId, override, markReviewed } = action.payload;
        const txn = newState.transactions.byId[txnId];
        if (!txn) return state;

        txn.manualOverride = override;
        if (markReviewed) {
            txn.status = 'reviewed';
            // Remove from needs attention list if present
            newState.transactions.needsAttention = newState.transactions.needsAttention.filter(id => id !== txnId);
            txn.needsAttention = false;
        }
        
        // Clear AI suggestions if manually overridden
        if (override) {
            txn.suggestedCategory = null;
            txn.suggestionConfidence = undefined;
            txn.suggestionReason = null;
        }

        newState.ui.toasts.push({ 
            id: generateId(), 
            level: 'success', 
            message: override ? 'Override Saved' : 'Override Cleared', 
            createdAt: Date.now() 
        });
        return newState;
    }

    case 'TXN/CLASSIFY': {
        const { txnId, scope, flow, categoryCode, entityType, entityCanonical, notes, markReviewed } = action.payload;
        const txn = newState.transactions.byId[txnId];
        if (!txn) return state;

        // Validation
        if (markReviewed && (!categoryCode || categoryCode === 'UNCATEGORIZED')) {
            newState.ui.toasts.push({ id: generateId(), level: 'error', message: 'Cannot mark reviewed without valid category.', createdAt: Date.now() });
            return newState;
        }

        // Determine New Classification Status
        let newClassStatus: ClassificationStatus = 'UNCLASSIFIED';
        if (markReviewed) newClassStatus = 'REVIEWED';
        else if (categoryCode && categoryCode !== 'UNCATEGORIZED') newClassStatus = 'CLASSIFIED';
        else if (scope || flow) newClassStatus = 'PARTIALLY_CLASSIFIED';

        // Update Transaction
        const override = {
            scope, flow, categoryCode, entityType, entityCanonical, notes,
            updatedAt: new Date().toISOString(),
            updatedBy: 'user'
        };

        // Persist to fields
        txn.manualOverride = override;
        txn.classificationStatus = newClassStatus;
        txn.scope = scope; // Persistent field on Txn
        txn.flow = flow;   // Persistent field on Txn
        txn.categoryCode = categoryCode || txn.categoryCode; // Use manual or keep existing if partial (but usually overrides)
        txn.entityType = (entityType as any) || txn.entityType;
        if (entityCanonical) {
            txn.vendorName = entityCanonical; // Map canonical to vendorName for persistence
            txn.counterpartyNormalized = entityCanonical;
        }
        if (notes) txn.notes = notes;

        // Handle Status Transition
        if (markReviewed) {
            txn.status = 'reviewed';
            txn.reviewedAt = new Date().toISOString();
            txn.reviewedBy = 'user';
            txn.needsAttention = false;
            newState.transactions.needsAttention = newState.transactions.needsAttention.filter(id => id !== txnId);
        }

        // Clear AI suggestions
        txn.suggestedCategory = null;
        txn.suggestionConfidence = undefined;
        txn.suggestionReason = null;

        // Force update ref
        newState.transactions.byId[txnId] = { ...txn };

        newState.ui.toasts.push({ 
            id: generateId(), 
            level: 'success', 
            message: markReviewed ? 'Transaction Reviewed' : 'Draft Classification Saved', 
            createdAt: Date.now() 
        });
        return newState;
    }
    
    case 'TXN/UPSERT_MANY': {
        const { txns } = action.payload;
        txns.forEach(t => { newState.transactions.byId[t.id] = t; });
        return newState;
    }

    case 'INTELLIGENCE/APPLY_RESULTS': {
        const { result } = action.payload;
        
        // 1. Apply Alias Updates (Registry Repair)
        if (result.registryDiff && result.registryDiff.aliasMap) {
            const additions = [...(result.registryDiff.aliasMap.add || []), ...(result.registryDiff.aliasMap.update || [])];
            additions.forEach(({ raw, canonical }) => {
                newState.registry.aliasMap[raw] = canonical;
            });
        }

        // 2. Apply Suggestions to Transactions
        let updatedCount = 0;
        result.suggestionsByTxn.forEach(({ id, suggested }) => {
            const txn = newState.transactions.byId[id];
            // Do not suggest if overrides exist
            if (txn && !txn.categoryCode && !txn.manualOverride) {
                txn.suggestedCategory = suggested.categoryCode;
                txn.suggestionConfidence = suggested.confidence;
                txn.suggestionReason = suggested.reason;
                // Also store suggested canonical for UI if useful
                if (suggested.canonical) txn.counterpartyNormalized = suggested.canonical;
                updatedCount++;
            }
        });

        // 3. Rebuild registries immediately to reflect aliases
        newState.ledger.registries = buildRegistries(newState);

        newState.ui.toasts.push({ id: generateId(), level: 'success', message: `Intelligence Applied: ${updatedCount} suggestions`, createdAt: Date.now() });
        return newState;
    }

    case 'ANALYSIS/UPDATE_REPORT': {
        // @ts-ignore
        newState.ledger.analysisReport = action.payload.report;
        if (!newState.ledger.registries) {
            newState.ledger.registries = buildRegistries(newState);
        }
        return newState;
    }
    
    case 'ANALYSIS/SET_DEEP_RESULT': {
        newState.ledger.deepAnalysis = action.payload.result;
        return newState;
    }

    case 'REGISTRY/ADD_ALIAS': {
        const { alias, canonical } = action.payload;
        newState.registry.aliasMap[alias.toUpperCase()] = canonical;
        newState.ledger.registries = buildRegistries(newState); 
        return newState;
    }

    case 'REGISTRY/MERGE_CANONICAL': {
        const { oldCanonical, newCanonical } = action.payload;
        newState.registry.aliasMap[oldCanonical.toUpperCase()] = newCanonical;
        newState.ledger.registries = buildRegistries(newState);
        return newState;
    }

    // --- MASTER ANALYSIS HANDLERS ---
    case 'MASTER_ANALYSIS/LOAD_CSV': {
        return {
            ...state,
            masterAnalysis: {
                ...state.masterAnalysis,
                rows: action.payload.rows,
                fileName: action.payload.fileName,
                loadedAtIso: action.payload.loadedAtIso,
                lastResult: undefined // Reset result on new load
            }
        };
    }

    case 'MASTER_ANALYSIS/RESET': {
        return {
            ...state,
            masterAnalysis: {
                rows: [],
                fileName: undefined,
                loadedAtIso: undefined,
                lastResult: undefined
            }
        };
    }

    case 'MASTER_ANALYSIS/SET_RESULT': {
        if (!state.masterAnalysis) return state;
        return {
            ...state,
            masterAnalysis: {
                ...state.masterAnalysis,
                lastResult: action.payload.result
            }
        };
    }

    case 'UI/BANNER_ADD': newState.ui.banners.push(action.payload); return newState;
    case 'UI/BANNER_DISMISS': newState.ui.banners = newState.ui.banners.filter(b => b.id !== action.payload.id); return newState;
    case 'UI/TOAST_ADD': newState.ui.toasts.push(action.payload); return newState;

    default: return state;
  }
};

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, createInitialState());

  useEffect(() => {
    StorageService.loadState().then(loaded => {
      if (loaded) { dispatch({ type: 'APP/HYDRATE_SUCCESS', payload: { state: loaded } }); } 
      else { dispatch({ type: 'APP/HYDRATE_START' }); }
    }).catch(() => {
      dispatch({ type: 'APP/HYDRATE_START' });
    });
  }, []);

  useEffect(() => {
    if (state.meta.hydrateStatus === 'ready') {
        const handler = setTimeout(() => { StorageService.saveState(state); }, 500);
        return () => clearTimeout(handler);
    }
  }, [state]);

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within StoreProvider");
  return context;
};
