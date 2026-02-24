
import React, { useState, useMemo, ErrorInfo, ReactNode } from 'react';
import Papa from 'papaparse';
import { z } from "zod";
import { useStore } from '../store/store';
import { runMasterAnalysis, runCsvNormalization } from '../services/geminiService';
import { MasterAnalysisResult, MASTER_CSV_HEADERS, MasterCsvRow, Instrument } from '../types';
import { BrainCircuit, Loader2, Play, Download, AlertTriangle, FileSpreadsheet, CheckCircle, Upload, Trash2, ShieldAlert, RefreshCw, Wand2, Plus } from 'lucide-react';

// --- UTILS: UNIVERSAL RENDER SAFEGUARD ---
/**
 * Safely converts any value to a string for rendering.
 * Prevents React Error #31 (Objects are not valid as a React child).
 * This function must NEVER throw.
 */
const safeRender = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) return value.message;
    
    try {
        // Log in development to catch unexpected data shapes
        if (process.env.NODE_ENV === 'development') {
            console.warn('MasterAnalysis: Rendering non-primitive value via JSON.stringify', value);
        }
        return JSON.stringify(value);
    } catch {
        return '[Unrenderable]';
    }
};

/**
 * Normalizes confidence values (number, string, or object) to a 0-1 float.
 */
const getSafeConfidence = (val: unknown): number => {
    let num = 0;
    if (typeof val === 'number') {
        num = val;
    } else if (typeof val === 'string') {
        num = parseFloat(val);
    } else if (typeof val === 'object' && val !== null) {
        // Handle cases where AI returns { score: 0.9 } or similar
        const anyVal = val as any;
        num = anyVal.score || anyVal.confidence || anyVal.value || 0;
    }
    
    if (isNaN(num)) return 0;
    return Math.max(0, Math.min(1, num));
};

/**
 * Safely formats currency, handling non-numeric inputs gracefully.
 */
const formatCurrency = (val: unknown) => {
    try {
        const num = typeof val === 'number' ? val : parseFloat(String(val));
        if (isNaN(num)) return '₹0';
        return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    } catch {
        return '₹0';
    }
};

// --- ERROR BOUNDARY ---
interface ErrorBoundaryProps {
    children?: ReactNode;
    fallbackTitle?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class MasterAnalysisErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = { hasError: false, error: null };

    constructor(props: ErrorBoundaryProps) {
        super(props);
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("MasterAnalysis Crash:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-900 shadow-sm my-4">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <AlertTriangle className="text-red-600" />
                        {(this as any).props.fallbackTitle || "Analysis Component Crashed"}
                    </h3>
                    <p className="text-sm mt-2">Something went wrong while rendering this section.</p>
                    <div className="mt-4 p-3 bg-white rounded border border-red-100 text-xs font-mono overflow-auto max-h-40">
                        {safeRender(this.state.error)}
                    </div>
                    <button 
                        onClick={() => (this as any).setState({ hasError: false, error: null })}
                        className="mt-4 px-4 py-2 bg-red-600 text-white rounded text-sm font-bold hover:bg-red-700 transition-colors"
                    >
                        Retry View
                    </button>
                </div>
            );
        }
        return (this as any).props.children;
    }
}

// --- HELPER: INSTRUMENT TYPE NORMALIZER ---
function normalizeInstrumentType(raw: unknown): "Company" | "Personal" {
  const v = (raw ?? "").toString().trim().toLowerCase();

  // 1) Exact known values from your CSV (fast path)
  if (v === "sb_personal") return "Personal";
  if (v === "cc_personal") return "Personal";
  if (v === "bnpl_personal") return "Personal";

  if (v === "ca_company") return "Company";
  if (v === "cc_company") return "Company";

  // 2) Generic suffix/prefix rule (future-proof)
  if (v.endsWith("_company") || v.includes("company")) return "Company";
  if (v.endsWith("_personal") || v.includes("personal")) return "Personal";

  // 3) Legacy variants (optional)
  if (v === "ca" || v === "current" || v.includes("current")) return "Company";
  if (v === "sb" || v === "savings" || v.includes("savings")) return "Personal";

  throw new Error(`Unknown instrument_type value: "${safeRender(raw)}"`);
}

// --- ZOD SCHEMA (UPDATED TO V3 PROMPT) ---
const MasterCsvRowSchema = z.object({
  txn_id: z.string().min(1),
  source_file: z.string().optional().default(""),
  txn_date: z.string().min(1), // YYYY-MM-DD
  description_raw: z.string().optional().default(""),
  description_clean: z.string().optional().default(""),
  amount: z.coerce.number(),
  direction: z.union([z.literal("DEBIT"), z.literal("CREDIT")]),
  instrument_id: z.string().min(1),
  instrument_name: z.string().min(1),
  
  // Strict Normalization
  instrument_type: z.preprocess(
    (v) => normalizeInstrumentType(v),
    z.union([z.literal("Company"), z.literal("Personal")])
  ),
  
  instrument_subtype: z.union([
      z.literal("SB"), z.literal("CA"), z.literal("CC"), z.literal("BNPL"), z.literal("OTHER")
  ]).optional().default("OTHER"),

  status: z.union([z.literal("draft"), z.literal("reviewed"), z.literal("excluded")]),
  entity_alias_raw: z.string().optional().default(""),
  entity_canonical: z.string().optional().default(""),
  category_code: z.string().optional().default("UNCATEGORIZED"),
  confidence: z.coerce.number().min(0).max(1).optional().default(0),
  flags: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

function normalizeHeader(h: string) {
  return (h || "").trim();
}

function stripCommasFromNumberLike(s: any) {
  return (s ?? "").toString().replace(/,/g, "").trim();
}

// --- SUB-COMPONENT: UPLOAD AREA ---
const MasterAnalysisCsvUpload: React.FC = () => {
  const { state, dispatch } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiNormalizing, setAiNormalizing] = useState(false);

  const expectedHeaderLine = useMemo(() => MASTER_CSV_HEADERS.join(","), []);

  const onRawFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      
      const files = Array.from(e.target.files) as File[];
      setError(null);
      setRowErrors([]);
      setAiNormalizing(true);

      try {
          const csvString = await runCsvNormalization(files);
          
          if (!csvString) throw new Error("AI returned empty result");

          const file = new File([csvString], "master_normalized_ai.csv", { type: "text/csv" });
          await onFile(file);

      } catch (err: any) {
          setError(err.message || "AI Normalization Failed");
      } finally {
          setAiNormalizing(false);
          e.target.value = '';
      }
  };

  const onFile = async (file: File) => {
    setError(null);
    setRowErrors([]);
    setLoading(true);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      dynamicTyping: false,
      transformHeader: (h) => normalizeHeader(h),
      complete: (result) => {
        try {
          const parsedFields = (result.meta.fields || []).map(normalizeHeader);
          const expectedFields = [...MASTER_CSV_HEADERS];
          const sameLength = parsedFields.length === expectedFields.length;
          const sameOrder = sameLength && parsedFields.every((f, i) => f === expectedFields[i]);

          if (!sameOrder) {
            const got = parsedFields.join(",");
            throw new Error(`CSV header mismatch.\n\nExpected (Strict v3):\n${expectedHeaderLine}\n\nGot:\n${got}`);
          }

          const rows: MasterCsvRow[] = [];
          const localRowErrors: string[] = [];
          const unknownInstrumentTypes = new Map<string, number>();

          (result.data || []).forEach((raw, idx) => {
            const cleaned = {
              ...raw,
              amount: stripCommasFromNumberLike(raw.amount),
              confidence: stripCommasFromNumberLike(raw.confidence),
            };

            const parsed = MasterCsvRowSchema.safeParse(cleaned);
            if (!parsed.success) {
              const instError = parsed.error.issues.find(i => i.path.includes('instrument_type'));
              if (instError) {
                  const key = safeRender(raw.instrument_type || "NULL");
                  unknownInstrumentTypes.set(key, (unknownInstrumentTypes.get(key) ?? 0) + 1);
              }

              const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
              localRowErrors.push(`Row ${idx + 2}: ${msg}`);
              return;
            }
            rows.push(parsed.data);
          });

          if (unknownInstrumentTypes.size > 0) {
              const top = [...unknownInstrumentTypes.entries()]
                .sort((a,b) => b[1]-a[1])
                .slice(0, 5)
                .map(([k,v]) => `"${k}" (${v})`)
                .join(", ");
              throw new Error(`Found unknown instrument_type values: ${top}. \nExpected variants of "Company" or "Personal".`);
          }

          if (localRowErrors.length > 0) {
            setRowErrors(localRowErrors.slice(0, 50)); 
            throw new Error(`Validation failed for ${localRowErrors.length} row(s). Fix the CSV and re-upload.`);
          }

          dispatch({
            type: "MASTER_ANALYSIS/LOAD_CSV",
            payload: {
              rows,
              fileName: file.name,
              loadedAtIso: new Date().toISOString(),
            },
          });

          setLoading(false);
        } catch (e: any) {
          setLoading(false);
          const safeMsg = typeof e === 'object' && e.message ? e.message : safeRender(e);
          setError(safeMsg || "Failed to parse CSV.");
        }
      },
      error: (err) => {
        setLoading(false);
        setError(safeRender(err) || "Failed to parse CSV.");
      },
    });
  };

  const reset = () => dispatch({ type: 'MASTER_ANALYSIS/RESET' });

  if (state.masterAnalysis?.rows.length) {
      const { rows, fileName, loadedAtIso } = state.masterAnalysis;
      const dateStart = rows.map(r => r.txn_date).sort()[0] || 'N/A';
      const dateEnd = rows.map(r => r.txn_date).sort().reverse()[0] || 'N/A';

      return (
        <div className="bg-white rounded-xl shadow-sm border-2 border-green-200 p-6 flex flex-col items-center animate-fade-in">
            <div className="bg-green-100 p-3 rounded-full mb-3">
                <CheckCircle size={32} className="text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-green-800 mb-1">CSV Loaded & Validated</h3>
            <div className="text-green-700 font-mono text-sm mb-6">{safeRender(fileName)}</div>
            
            <div className="grid grid-cols-3 gap-4 w-full max-w-2xl mb-6">
                <div className="bg-white p-4 rounded-lg border border-green-100 shadow-sm text-center">
                    <div className="text-xs uppercase text-slate-400 font-bold">Rows</div>
                    <div className="text-2xl font-bold text-slate-700">{rows.length.toLocaleString()}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-green-100 shadow-sm text-center">
                    <div className="text-xs uppercase text-slate-400 font-bold">Loaded At</div>
                    <div className="text-sm font-bold text-slate-700 mt-2">{new Date(loadedAtIso || '').toLocaleTimeString()}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-green-100 shadow-sm text-center">
                    <div className="text-xs uppercase text-slate-400 font-bold">Range</div>
                    <div className="text-xs font-mono font-bold text-slate-700 mt-2">{safeRender(dateStart)}<br/>↓<br/>{safeRender(dateEnd)}</div>
                </div>
            </div>

            <button onClick={reset} className="text-slate-400 hover:text-red-500 text-sm flex items-center gap-1 transition-colors">
                <Trash2 size={14} /> Remove File & Reset
            </button>
        </div>
      );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center animate-fade-in">
      <div 
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-colors ${error ? 'border-red-300 bg-red-50/50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
          }}
      >
          {error ? (
              <>
                  <ShieldAlert size={48} className="text-red-500 mb-4" />
                  <h3 className="text-lg font-bold text-red-700 mb-2">CSV Validation Failed</h3>
                  <div className="text-left text-sm text-red-600 bg-white p-4 rounded border border-red-200 w-full max-w-2xl overflow-auto max-h-40">
                      <pre className="whitespace-pre-wrap font-sans">{safeRender(error)}</pre>
                      {rowErrors.length > 0 && (
                          <ul className="list-disc pl-5 mt-2 space-y-1">
                              {rowErrors.map((e, i) => <li key={i}>{safeRender(e)}</li>)}
                          </ul>
                      )}
                  </div>
                  <label className="mt-6 text-red-600 underline font-bold hover:text-red-800 cursor-pointer">
                      Try Another File
                      <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                  </label>
              </>
          ) : (
              <div className="w-full max-w-2xl">
                  <div className="flex gap-4">
                      <div className="flex-1 flex flex-col items-center p-6 border border-slate-100 rounded-xl bg-slate-50">
                          <div className="bg-indigo-100 p-3 rounded-full mb-3">
                              <FileSpreadsheet size={24} className="text-indigo-600" />
                          </div>
                          <h4 className="font-bold text-slate-700">I have a Master CSV</h4>
                          <p className="text-xs text-slate-500 mb-4 mt-1">Upload strict schema file.</p>
                          <label className="bg-white text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg font-bold hover:bg-indigo-50 transition-colors shadow-sm flex items-center gap-2 cursor-pointer text-sm w-full justify-center">
                              <Upload size={16} /> 
                              <span>{loading ? 'Validating...' : 'Select CSV'}</span>
                              <input type="file" accept=".csv" className="hidden" disabled={loading || aiNormalizing} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                          </label>
                      </div>

                      <div className="flex items-center text-slate-300 font-bold">OR</div>

                      <div className="flex-1 flex flex-col items-center p-6 border-2 border-indigo-100 rounded-xl bg-indigo-50/30">
                          <div className="bg-purple-100 p-3 rounded-full mb-3">
                              <Wand2 size={24} className="text-purple-600" />
                          </div>
                          <h4 className="font-bold text-slate-700">Use AI Ingest</h4>
                          <p className="text-xs text-slate-500 mb-4 mt-1">Merge raw bank files via Gemini.</p>
                          <label className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-2 cursor-pointer text-sm w-full justify-center">
                              {aiNormalizing ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                              <span>{aiNormalizing ? 'Thinking...' : 'Add Raw Files'}</span>
                              <input type="file" multiple accept=".csv" className="hidden" disabled={loading || aiNormalizing} onChange={onRawFiles} />
                          </label>
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
const MasterAnalysis: React.FC = () => {
    const { state, dispatch } = useStore();
    const [isProcessing, setIsProcessing] = useState(false);
    const [runError, setRunError] = useState<string | null>(null);

    const loadedRows = state.masterAnalysis?.rows || [];
    const result = state.masterAnalysis?.lastResult;
    const canRun = loadedRows.length > 0;

    const handleRunAnalysis = async () => {
        if (!canRun) return;
        setIsProcessing(true);
        setRunError(null);
        
        try {
            const mappedRows = loadedRows.map(r => ({
                id: r.txn_id,
                txnDate: r.txn_date, 
                description: r.description_clean, 
                amount: r.amount, 
                direction: r.direction,
                instrumentId: r.instrument_id,
                instrumentType: r.instrument_type,
                status: r.status,
                vendorName: r.entity_canonical, 
                categoryCode: r.category_code 
            }));

            const referenceData = {
                employees: [
                    ...(state.ledger.registries?.employees || []).map(e => e.employee_name_canonical),
                    "HRIDAM", "SABARI", "JOSHUA", "RIYA", "NARMADA", "GOPIKA", "TALIB", "KARTHI", "NAYAN", "MAHIKA", "SHUBASHINI"
                ],
                directors: ["VENKATRAMAN", "NEELAM LAL"], 
                officeHelp: ["MUKTI", "MUKTIKANTA", "MUKTHI"],
                companyInstruments: (Object.values(state.registry.instruments) as Instrument[]).filter(i => i.instrumentType.includes('COMPANY')),
                personalInstruments: (Object.values(state.registry.instruments) as Instrument[]).filter(i => i.instrumentType.includes('PERSONAL')),
                knownAliases: state.registry.aliasMap
            };

            const csvMeta = {
                rowCount: loadedRows.length,
                dateRange: [
                    loadedRows.map(r => r.txn_date).sort()[0] || '', 
                    loadedRows.map(r => r.txn_date).sort().reverse()[0] || ''
                ] as [string, string]
            };

            const res = await runMasterAnalysis(mappedRows, csvMeta, referenceData);
            
            if (res) {
                dispatch({ type: 'MASTER_ANALYSIS/SET_RESULT', payload: { result: res } });
            } else {
                setRunError("Analysis returned no data. Check API keys and quotas.");
            }
        } catch (e: any) {
            console.error("Master Analysis Execution Error:", e);
            const errMsg = safeRender(e) || "Critical Analysis Failure";
            setRunError(errMsg);
        } finally {
            setIsProcessing(false);
        }
    };

    const renderSection = (title: string, data: any) => {
        // Defensive: If data is missing or malformed, return null or empty state
        if (!data || typeof data !== 'object') return null;

        // Defensive: Extract summary safely
        const total = (data.summary?.total_amount || data.summary?.total_outflow || 0);
        
        // Defensive: Ensure rows is array
        const rows = Array.isArray(data.rows) ? data.rows : [];

        return (
            <MasterAnalysisErrorBoundary fallbackTitle={`Error rendering ${title}`}>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6 animate-fade-in-up">
                    <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 text-lg">{safeRender(title)}</h3>
                        {total > 0 && (
                            <div className="text-xs font-mono bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-bold">
                                Total: {formatCurrency(total)}
                            </div>
                        )}
                    </div>
                    <div className="p-4">
                        {rows.length > 0 ? (
                            <div className="overflow-x-auto max-h-[400px]">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-100 font-bold text-slate-600 sticky top-0 z-10">
                                        <tr>
                                            <th className="p-3">Date</th>
                                            <th className="p-3">Description</th>
                                            <th className="p-3 text-right">Amount</th>
                                            <th className="p-3">Instrument</th>
                                            <th className="p-3">Confidence</th>
                                            <th className="p-3">Reason</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {rows.map((row: any, idx: number) => {
                                            // Safely calculate confidence for rendering
                                            const conf = getSafeConfidence(row.confidence);
                                            return (
                                                <tr key={idx} className="hover:bg-slate-50">
                                                    <td className="p-3 font-mono text-slate-600 whitespace-nowrap">{safeRender(row.txnDate)}</td>
                                                    <td className="p-3 truncate max-w-xs text-slate-800 font-medium" title={safeRender(row.rawDescription)}>{safeRender(row.rawDescription)}</td>
                                                    <td className="p-3 text-right font-mono font-bold text-slate-700">{formatCurrency(row.amount)}</td>
                                                    <td className="p-3 text-slate-500 text-[10px] uppercase tracking-wide">{safeRender(row.instrument)}</td>
                                                    <td className="p-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-12 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                                <div className={`h-full ${conf > 0.8 ? 'bg-green-500' : conf > 0.5 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${conf * 100}%` }}></div>
                                                            </div>
                                                            <span className="text-[10px] text-slate-400">{Math.round(conf * 100)}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-slate-500 italic truncate max-w-xs">{safeRender(row.reason)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-slate-400 text-sm italic">No qualifying transactions found.</div>
                        )}
                    </div>
                </div>
            </MasterAnalysisErrorBoundary>
        );
    };

    const downloadJson = () => {
        if (!result) return;
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `master_analysis_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    };

    return (
        <MasterAnalysisErrorBoundary fallbackTitle="Master Analysis Crashed">
            <div className="space-y-6 pb-20">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-900 to-slate-900 p-6 rounded-xl text-white shadow-lg">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <BrainCircuit size={28} className="text-indigo-400" />
                                Master Analysis
                            </h2>
                            <p className="text-indigo-200 text-sm mt-1 max-w-xl">
                                Deep AI forensic analysis using Gemini 3 Pro Thinking Model. <br/>
                                Requires strictly validated "Master CSV" upload.
                            </p>
                        </div>
                        
                        {/* Run Button */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleRunAnalysis}
                                disabled={!canRun || isProcessing}
                                className={`px-6 py-3 rounded-lg font-bold flex items-center gap-2 shadow-xl transition-all ${canRun ? 'bg-white text-indigo-900 hover:bg-indigo-50' : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50'}`}
                            >
                                {isProcessing ? <Loader2 className="animate-spin" /> : <Play size={20} />}
                                {isProcessing ? 'Thinking...' : 'Run Master Analysis'}
                            </button>
                            {result && (
                                <button onClick={downloadJson} className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg transition-colors">
                                    <Download size={16}/> Export JSON
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Run Error */}
                {runError && (
                    <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-r-lg flex items-start gap-3 shadow-sm animate-shake">
                        <AlertTriangle size={20} className="mt-0.5 shrink-0" />
                        <div>
                            <h4 className="font-bold text-sm">Analysis Failed</h4>
                            <p className="text-xs mt-1 break-all">{safeRender(runError)}</p>
                            <button onClick={handleRunAnalysis} className="mt-2 text-xs font-bold underline flex items-center gap-1 hover:text-red-900">
                                <RefreshCw size={10} /> Retry
                            </button>
                        </div>
                    </div>
                )}

                {/* Upload Area */}
                {!result && (
                    <MasterAnalysisCsvUpload />
                )}

                {/* Results View */}
                {result && (
                    <div className="animate-fade-in space-y-8">
                        {/* Metadata Bar */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 uppercase">Input Source</h4>
                                    <div className="text-sm font-bold text-slate-800 mt-1 truncate max-w-[200px]" title={safeRender(state.masterAnalysis?.fileName)}>{safeRender(state.masterAnalysis?.fileName)}</div>
                                </div>
                                <FileSpreadsheet className="text-slate-300" />
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 uppercase">Analysis Engine</h4>
                                    <div className="text-sm font-bold text-indigo-600 mt-1">Gemini 3 Pro (Thinking)</div>
                                </div>
                                <BrainCircuit className="text-indigo-200" />
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 uppercase">Computed At</h4>
                                    <div className="text-sm font-bold text-slate-800 mt-1">{new Date().toLocaleTimeString()}</div>
                                </div>
                                <div className="text-xs text-slate-400 font-mono">v1.0</div>
                            </div>
                        </div>

                        {/* Sections */}
                        {renderSection("Venkat Paid on Behalf of Company", result.sections.venkat_on_behalf_company)}
                        {renderSection("Company → Venkat (Mgmt Overhead 1)", result.sections.mgmt_overhead_1_company_to_venkat)}
                        {renderSection("Company → Neelam (Mgmt Overhead 2)", result.sections.mgmt_overhead_2_company_to_neelam)}
                        {renderSection("Mukti / Office Help Tracker", result.sections.mukti_tracker)}
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderSection("IT Vendors", result.sections.it_vendors)}
                            {renderSection("MCO Vendors", result.sections.mco_vendors)}
                        </div>

                        {renderSection("Employee Salaries (Company)", result.sections.employee_salaries_company)}
                        {renderSection("Employee Payments (Personal)", result.sections.employee_payments_personal)}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderSection("Food Delivery", result.sections.food_delivery_tracker)}
                            {renderSection("Fuel Expenses", result.sections.fuel_tracker)}
                        </div>

                        {/* Additional Sections from Extended Prompt */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderSection("Company Inflows (Clients)", result.sections.company_inflows_clients)}
                            {renderSection("Venkat Inflows (Non-Company)", result.sections.venkat_inflows_non_company)}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderSection("Cafe & Diner", result.sections.cafe_diner_tracker)}
                            {renderSection("Hosting", result.sections.hosting_tracker)}
                        </div>

                        {/* Extra Insights */}
                        {result.sections.extra_insights && (
                            <MasterAnalysisErrorBoundary fallbackTitle="Insights Failed">
                                <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-8 rounded-xl shadow-lg border border-slate-700">
                                    <h3 className="font-bold text-xl mb-6 flex items-center gap-3">
                                        <BrainCircuit size={24} className="text-purple-400"/>
                                        AI Generated Strategic Insights
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {(Array.isArray(result.sections.extra_insights.ideas) ? result.sections.extra_insights.ideas : []).map((idea: string, i: number) => (
                                            <div key={i} className="flex gap-3 text-sm text-slate-300 bg-white/5 p-4 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                                                <span className="text-purple-400 font-bold text-lg leading-none mt-0.5">•</span>
                                                <span className="leading-relaxed">{safeRender(idea)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </MasterAnalysisErrorBoundary>
                        )}
                    </div>
                )}
            </div>
        </MasterAnalysisErrorBoundary>
    );
};

export default MasterAnalysis;
