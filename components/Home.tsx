
import React, { useMemo, useState, useRef } from 'react';
import { useStore } from '../store/store';
import { runAnalysis } from '../services/analysis';
import { generateId } from '../services/utils';
import { parseFileUniversal } from '../services/parsers';
import { IDBService } from '../services/idb';
import { detectInstrument } from '../services/mapping';
import { Document, ParsedResult } from '../types';
import { 
  Upload, TrendingUp, TrendingDown, Wallet, ArrowRight, Database, 
  BarChart3, ChevronLeft, ChevronRight, Loader2, CheckCircle, 
  AlertCircle, FolderInput, Zap, FileText
} from 'lucide-react';

const Home: React.FC = () => {
  const { state, dispatch } = useStore();
  const month = state.context.selectedMonth;
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [lastUploadCount, setLastUploadCount] = useState(0);
  const [showInstrumentPicker, setShowInstrumentPicker] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState('');
  const folderRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const report = useMemo(() => runAnalysis(state), [state.transactions, state.registry.aliasMap, month]);
  const fmt = (v: number) => v.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  const changeMonth = (offset: number) => {
    const d = new Date(month + "-01");
    d.setMonth(d.getMonth() + offset);
    dispatch({ type: 'CONTEXT/SET_MONTH', payload: { month: d.toISOString().slice(0, 7) } });
  };

  // Quick Upload (folder or files)
  const handleFiles = async (files: FileList | File[], forceInstrumentId?: string) => {
    const arr = Array.from(files).filter(f => {
      const path = (f as any).webkitRelativePath || '';
      return !path.toLowerCase().includes('/old/') && !path.toLowerCase().includes(' old') && !f.name.startsWith('.') && !f.name.includes('DS_Store');
    });
    if (arr.length === 0) return;

    // For single/multiple files without folder paths, try auto-detect first
    if (!forceInstrumentId) {
      const hasFolder = arr.some(f => (f as any).webkitRelativePath);
      if (!hasFolder) {
        const testId = detectInstrument(arr[0], '', state.registry.instruments);
        if (!testId) {
          setPendingFiles(arr);
          setShowInstrumentPicker(true);
          return;
        }
      }
    }

    setUploading(true);
    setUploadMsg(`Processing ${arr.length} file${arr.length > 1 ? 's' : ''}...`);
    let processed = 0;
    let failed = 0;
    let skipped = 0;
    let needsApiKey = false;

    for (const file of arr) {
      try {
        const relativePath = (file as any).webkitRelativePath || '';
        const instrumentId = forceInstrumentId || detectInstrument(file, relativePath, state.registry.instruments);
        if (!instrumentId) { skipped++; continue; }

        // Determine file type
        const ext = file.name.split('.').pop()?.toUpperCase() || '';
        let fileType: Document['fileType'];
        if (ext === 'CSV') fileType = 'CSV';
        else if (ext === 'XLS') fileType = 'XLS';
        else if (ext === 'XLSX') fileType = 'XLSX';
        else if (ext === 'PDF') fileType = 'PDF';
        else if (['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP'].includes(ext)) fileType = 'IMAGE';
        else { skipped++; continue; }

        // Hash for dedup
        const arrayBuf = await file.arrayBuffer();
        const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuf);
        const sha256 = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        // Check duplicate by hash
        const isDup = state.documents.allIds.some(id => state.documents.byId[id]?.storage?.sha256 === sha256);
        if (isDup) { skipped++; continue; }

        // Extract month hint from filename
        const monthHint = extractMonthHint(file.name);

        // Create document
        const docId = generateId();
        const doc: Document = {
          id: docId,
          instrumentId,
          fileName: file.name,
          relativePath: relativePath || undefined,
          fileType,
          sizeBytes: file.size,
          storage: { blobRef: docId, sha256 },
          uploadedAt: Date.now(),
          statementMonthHint: monthHint,
          extractedInstitutionName: null,
          parseStatus: 'partial',
          parseError: null,
          archivedAt: null,
          replacedByDocId: null,
        };

        // Store blob
        await IDBService.saveFile(docId, file);
        
        // Register doc
        dispatch({ type: 'DOC/UPLOAD_SUCCESS', payload: { doc } });

        // Parse
        const jobId = generateId();
        dispatch({ type: 'PARSE/START', payload: { jobId, docId } });
        
        const result: ParsedResult = await parseFileUniversal(file, fileType, instrumentId);
        
        // Store raw parse data
        await IDBService.saveParsedData(docId, result);

        // Dispatch results
        dispatch({ type: 'PARSE/SUCCESS', payload: { jobId, docId, extracted: result } });
        
        // Track warnings for image files with no results (likely API key issue)
        if (result.txns.length === 0 && fileType === 'IMAGE') {
          const noKeyWarning = result.warnings?.some(w => w.includes('NO_GEMINI_API_KEY'));
          if (noKeyWarning) {
            needsApiKey = true;
          }
          failed++;
        } else {
          processed++;
        }

        setUploadMsg(`Processed ${processed}/${arr.length}...`);
      } catch (e) {
        console.error('Upload error for', file.name, e);
        failed++;
      }
    }

    setUploading(false);
    setLastUploadCount(processed);
    const parts = [];
    if (processed > 0) parts.push(`${processed} ingested`);
    if (failed > 0) parts.push(`${failed} failed`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    if (needsApiKey) parts.push('⚠️ Image files need Gemini API key (Settings → General)');
    setUploadMsg(parts.join(', ') || 'No files processed');
    setTimeout(() => setUploadMsg(''), 6000);
  };

  // Extract month hint from filename like "April_25" or "JANUARY_2026"
  const extractMonthHint = (name: string): string | null => {
    const months: Record<string, string> = { 
      'january': '01', 'february': '02', 'march': '03', 'april': '04', 
      'may': '05', 'june': '06', 'july': '07', 'august': '08', 
      'september': '09', 'october': '10', 'november': '11', 'december': '12',
      'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 
      'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09', 
      'oct': '10', 'nov': '11', 'dec': '12'
    };
    const lower = name.toLowerCase();
    for (const [mName, mNum] of Object.entries(months)) {
      if (lower.includes(mName)) {
        // Find year
        const yearMatch = lower.match(/20(\d{2})/);
        const shortYearMatch = lower.match(/[_\s](\d{2})[_\s.]/);
        let year = '2025';
        if (yearMatch) year = `20${yearMatch[1]}`;
        else if (shortYearMatch) year = `20${shortYearMatch[1]}`;
        else if (lower.includes('26') || lower.includes('2026')) year = '2026';
        return `${year}-${mNum}`;
      }
    }
    return null;
  };

  const handleInstrumentConfirm = () => {
    if (selectedInstrument && pendingFiles.length) {
      setShowInstrumentPicker(false);
      handleFiles(pendingFiles, selectedInstrument);
      setPendingFiles([]);
      setSelectedInstrument('');
    }
  };

  const txnCount = state.transactions.allIds.length;
  const classifiedCount = state.transactions.allIds.filter(id => {
    const t = state.transactions.byId[id];
    return t?.categoryCode && t.categoryCode !== 'UNCATEGORIZED';
  }).length;
  const classifiedPct = txnCount > 0 ? Math.round((classifiedCount / txnCount) * 100) : 0;
  const monthTxns = (state.transactions.byMonth[month] || []).length;
  const reimbursableCount = state.transactions.allIds.filter(id => state.transactions.byId[id]?.reimbursable).length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      {/* Hero Section */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">blu<span className="text-blue-600">Fin</span> Classify</h1>
          <p className="text-sm text-slate-500 mt-1">
            {txnCount === 0 ? 'Upload bank statements to get started' : `${txnCount.toLocaleString()} transactions across ${state.documents.allIds.length} files`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-1 py-1 shadow-sm">
          <button onClick={() => changeMonth(-1)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"><ChevronLeft size={16}/></button>
          <span className="font-mono text-sm font-bold text-slate-700 px-2 min-w-[90px] text-center">{month}</span>
          <button onClick={() => changeMonth(1)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"><ChevronRight size={16}/></button>
        </div>
      </div>

      {/* Quick Stats */}
      {txnCount > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Revenue</div>
            <div className="text-xl font-bold text-green-600 mt-2">{fmt(report.coreHealth.companyRevenue)}</div>
            <div className="text-[11px] text-slate-400 mt-1">{month}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Expenses</div>
            <div className="text-xl font-bold text-slate-800 mt-2">{fmt(report.coreHealth.companyExpenses)}</div>
            <div className="text-[11px] text-slate-400 mt-1">{month}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Net Cash Flow</div>
            <div className={`text-xl font-bold mt-2 ${report.coreHealth.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fmt(report.coreHealth.netCashFlow)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{month}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Classified</div>
            <div className="text-xl font-bold text-blue-600 mt-2">{classifiedPct}%</div>
            <div className="text-[11px] text-slate-400 mt-1">{classifiedCount}/{txnCount} total</div>
          </div>
        </div>
      )}

      {/* Upload Zone */}
      <div 
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${uploading ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'}`}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); handleFiles(e.dataTransfer.files); }}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="text-blue-500 animate-spin" />
            <p className="text-sm font-medium text-blue-700">{uploadMsg}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
              <Upload size={22} className="text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">Drop files here or choose an upload method</p>
              <p className="text-xs text-slate-400 mt-1">CSV, XLS, XLSX, PDF — auto-detects instrument from filename/folder</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => fileRef.current?.click()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
              >
                <FileText size={15}/> Select Files
              </button>
              <button 
                onClick={() => folderRef.current?.click()}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
              >
                <FolderInput size={15}/> Upload Folder
              </button>
            </div>
            {uploadMsg && (
              <div className={`flex items-center gap-2 text-sm font-medium ${lastUploadCount > 0 ? 'text-green-600' : 'text-amber-600'}`}>
                {lastUploadCount > 0 ? <CheckCircle size={14}/> : <AlertCircle size={14}/>}
                {uploadMsg}
              </div>
            )}
          </div>
        )}
        <input ref={fileRef} type="file" multiple accept=".csv,.xls,.xlsx,.pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
        <input ref={folderRef} type="file" multiple className="hidden" {...{ webkitdirectory: '', directory: '' } as any} onChange={e => e.target.files && handleFiles(e.target.files)} />
      </div>

      {/* Quick Actions */}
      {txnCount > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={() => dispatch({ type: 'UI/NAVIGATE', payload: { route: 'ledger' } })}
            className="bg-white border border-slate-200 rounded-xl p-5 text-left hover:border-blue-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between">
              <Database size={20} className="text-blue-600" />
              <ArrowRight size={16} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mt-3">Master Ledger</h3>
            <p className="text-xs text-slate-500 mt-1">{monthTxns} transactions this month • Classify & review</p>
          </button>

          <button 
            onClick={() => dispatch({ type: 'UI/NAVIGATE', payload: { route: 'reports' } })}
            className="bg-white border border-slate-200 rounded-xl p-5 text-left hover:border-green-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between">
              <BarChart3 size={20} className="text-green-600" />
              <ArrowRight size={16} className="text-slate-300 group-hover:text-green-400 transition-colors" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mt-3">Reports</h3>
            <p className="text-xs text-slate-500 mt-1">P&L, expenses, revenue, reimbursements</p>
          </button>

          <button 
            onClick={() => dispatch({ type: 'UI/NAVIGATE', payload: { route: 'ledger' } })}
            className="bg-white border border-slate-200 rounded-xl p-5 text-left hover:border-orange-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between">
              <Zap size={20} className="text-orange-500" />
              <ArrowRight size={16} className="text-slate-300 group-hover:text-orange-400 transition-colors" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mt-3">Quick Classify</h3>
            <p className="text-xs text-slate-500 mt-1">
              {reimbursableCount > 0 ? `${reimbursableCount} reimbursable flagged • ` : ''}
              Run No-AI classifier from Ledger
            </p>
          </button>
        </div>
      )}

      {/* Instruments Overview (compact) */}
      {txnCount > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">Instruments Summary</div>
          <div className="divide-y divide-slate-50">
            {state.registry.instrumentOrder.map(id => {
              const inst = state.registry.instruments[id];
              const count = state.transactions.allIds.filter(tid => state.transactions.byId[tid]?.instrumentId === id).length;
              if (count === 0) return null;
              return (
                <div key={id} className="px-5 py-2.5 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${inst.instrumentType.includes('COMPANY') || inst.instrumentType.includes('CA') ? 'bg-blue-500' : inst.instrumentType.includes('BNPL') ? 'bg-purple-500' : 'bg-green-500'}`} />
                    <span className="font-medium text-slate-700">{inst.name}</span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">{count} txns</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Instrument Picker Modal */}
      {showInstrumentPicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => { setShowInstrumentPicker(false); setPendingFiles([]); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Select Instrument</h3>
              <p className="text-xs text-slate-500 mt-1">Which account do these {pendingFiles.length} file(s) belong to?</p>
            </div>
            <div className="p-4 max-h-60 overflow-y-auto space-y-1">
              {state.registry.instrumentOrder.map(id => {
                const inst = state.registry.instruments[id];
                return (
                  <button
                    key={id}
                    onClick={() => setSelectedInstrument(id)}
                    className={`w-full px-4 py-3 rounded-lg text-sm text-left transition-colors flex items-center gap-3 ${
                      selectedInstrument === id ? 'bg-blue-50 border border-blue-200 text-blue-800' : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${inst.instrumentType.includes('COMPANY') || inst.instrumentType.includes('CA') ? 'bg-blue-500' : inst.instrumentType.includes('BNPL') ? 'bg-purple-500' : 'bg-green-500'}`} />
                    <div>
                      <div className="font-medium">{inst.name}</div>
                      <div className="text-[10px] text-slate-400">{inst.institution} • {inst.instrumentType}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => { setShowInstrumentPicker(false); setPendingFiles([]); }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button
                onClick={handleInstrumentConfirm}
                disabled={!selectedInstrument}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
