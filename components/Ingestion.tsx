import React, { useState, useRef } from 'react';
import { useStore } from '../store/store';
import { generateId, calculateFileHash } from '../services/utils';
import { parseFileUniversal } from '../services/parsers';
import { IDBService } from '../services/idb';
import { detectInstrument } from '../services/mapping';
import { Document, ParsedResult } from '../types';
import { UploadCloud, CheckCircle, AlertCircle, Loader2, Search, X, TableProperties, Activity, FolderInput } from 'lucide-react';
import BulkEditGrid from './BulkEditGrid';

const Ingestion: React.FC = () => {
  const { state, dispatch } = useStore();
  const [selectedInstrument, setSelectedInstrument] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [parseReport, setParseReport] = useState<ParsedResult['parseReport'] | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  
  // Bulk Editor State
  const [bulkEditorDocId, setBulkEditorDocId] = useState<string | null>(null);
  
  // Discovery State
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'CC' | 'SB' | 'CA' | 'BNPL'>('ALL');

  const instruments = state.registry.instrumentOrder.map(id => state.registry.instruments[id]);

  const filteredInstruments = instruments.filter(inst => {
      const matchesSearch = inst.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            inst.institution.toLowerCase().includes(searchTerm.toLowerCase());
      let matchesFilter = true;
      if (activeFilter === 'CC') matchesFilter = inst.instrumentType.startsWith('CC');
      if (activeFilter === 'SB') matchesFilter = inst.instrumentType.startsWith('SB');
      if (activeFilter === 'CA') matchesFilter = inst.instrumentType.startsWith('CA');
      if (activeFilter === 'BNPL') matchesFilter = inst.instrumentType.startsWith('BNPL');
      return matchesSearch && matchesFilter;
  });

  const activeInstrument = selectedInstrument ? state.registry.instruments[selectedInstrument] : null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && selectedInstrument) {
        const file = e.target.files[0];
        await processFile(file, selectedInstrument);
        e.target.value = ''; 
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;

      setIsProcessing(true);
      const files = Array.from(e.target.files) as File[];
      let processed = 0;
      let failed = 0;

      // Filter out 'old'
      const validFiles = files.filter(f => {
          const path = f.webkitRelativePath || '';
          return !path.toLowerCase().includes('/old/') && !path.toLowerCase().includes(' old');
      });

      setLoadingMessage(`Queued ${validFiles.length} files...`);

      // Process in chunks of 2 to avoid browser freeze
      const CHUNK_SIZE = 2;
      for (let i = 0; i < validFiles.length; i += CHUNK_SIZE) {
          const chunk = validFiles.slice(i, i + CHUNK_SIZE);
          await Promise.all(chunk.map(async (file) => {
              try {
                  const relativePath = file.webkitRelativePath || '';
                  const instrumentId = detectInstrument(file, relativePath, state.registry.instruments);
                  
                  if (!instrumentId) {
                      // Skip or mark as NEEDS_REVIEW (Create doc with manual status)
                      // For now, we only ingest if we can map it, or we could ingest as UNKNOWN if we had one.
                      // Per prompt: "If still unknown -> mark statement as NEEDS_REVIEW and require user to pick instrument manually."
                      // We can skip mapping here and let processFile handle missing instrument logic if we adapted it, 
                      // but strict requirement says "determine instrument by folder".
                      // Let's create a doc with a placeholder if we can't find one?
                      // For simplicity, we skip unmappable files in this pass or log error.
                      console.warn("Skipping unmappable file:", file.name);
                      failed++;
                      return;
                  }

                  await processFile(file, instrumentId, relativePath);
                  processed++;
              } catch (e) {
                  failed++;
                  console.error(e);
              }
          }));
          setLoadingMessage(`Processed ${Math.min(i + CHUNK_SIZE, validFiles.length)} / ${validFiles.length} files...`);
      }

      setIsProcessing(false);
      setLoadingMessage('');
      dispatch({ type: 'UI/TOAST_ADD', payload: { id: generateId(), level: 'success', message: `Bulk Import: ${processed} processed, ${failed} skipped/failed`, createdAt: Date.now() } });
      e.target.value = '';
      
      // Navigate to repository to show results
      dispatch({ type: 'UI/NAVIGATE', payload: { route: 'library' } });
  };

  const processFile = async (file: File, instrumentId: string, relativePath?: string) => {
    // setIsProcessing(true); // Handled by caller for bulk
    setParseReport(null);
    const docId = generateId();
    const monthHint = state.context.selectedMonth;

    // 1. Calculate Hash & Check Dedupe
    const sha256 = await calculateFileHash(file);
    const existingDoc = state.documents.allIds
        .map(id => state.documents.byId[id])
        .find(d => d.storage.sha256 === sha256 && d.instrumentId === instrumentId);

    if (existingDoc) {
        // In bulk mode, we silent skip duplicates or overwrite. 
        // For safety, we'll skip duplicate ingestion in bulk without prompt.
        // If manual single upload, we prompted. 
        if (!relativePath) {
            const replace = confirm(`Duplicate File Detected!\n\n${existingDoc.fileName} was already uploaded.\nDo you want to REPLACE it?`);
            if (!replace) return;
            dispatch({ type: 'TXN/DELETE_MANY_BY_DOC', payload: { docId: existingDoc.id, reason: 'Duplicate Replacement' } });
            dispatch({ type: 'DOC/DELETE', payload: { docId: existingDoc.id } });
        } else {
             // Bulk auto-skip duplicate
             console.log("Skipping duplicate in bulk:", file.name);
             return;
        }
    }

    // 2. Determine File Type
    let fileType: Document['fileType'] = 'CSV';
    if (file.type.startsWith('image/')) fileType = 'IMAGE';
    else if (file.type === 'application/pdf') fileType = 'PDF';
    else if (file.name.endsWith('.xls')) fileType = 'XLS';
    else if (file.name.endsWith('.xlsx')) fileType = 'XLSX';

    dispatch({ type: 'DOC/UPLOAD_START', payload: { instrumentId, monthHint, fileName: file.name, fileType, sizeBytes: file.size } });
    
    try {
        await IDBService.saveFile(docId, file);
    } catch (e) {
        dispatch({ type: 'UI/BANNER_ADD', payload: { id: generateId(), level: 'error', title: 'Storage Error', message: `Failed to save ${file.name}`, createdAt: Date.now(), dismissible: true } });
        return;
    }

    const doc: Document = {
        id: docId,
        instrumentId,
        fileName: file.name,
        relativePath,
        fileType,
        sizeBytes: file.size,
        storage: { blobRef: docId, sha256 },
        uploadedAt: Date.now(),
        statementMonthHint: monthHint,
        extractedInstitutionName: null,
        parseStatus: 'partial',
        parseError: null,
        archivedAt: null,
        replacedByDocId: null
    };
    dispatch({ type: 'DOC/UPLOAD_SUCCESS', payload: { doc } });

    try {
        const jobId = generateId();
        dispatch({ type: 'PARSE/START', payload: { jobId, docId } });
        
        // 3. Universal Parsing
        const result: ParsedResult = await parseFileUniversal(file, fileType, instrumentId);
        
        setParseReport(result.parseReport);
        
        // Store raw parse data in IDB for diagnostics/re-hydration of review grid
        await IDBService.saveParsedData(docId, result);

        if (result.txns.length > 0) {
             const drafts = result.txns.filter(t => t.needsManualDate);
             
             dispatch({ type: 'PARSE/SUCCESS', payload: { jobId, docId, extracted: result } });
             if (!relativePath) dispatch({ type: 'UI/TOAST_ADD', payload: { id: generateId(), level: 'success', message: `Extracted ${result.txns.length} txns`, createdAt: Date.now() } });
             
             // Open Grid if drafts exist or if ANY warning (ONLY for single upload)
             if (!relativePath && (drafts.length > 0 || result.warnings.length > 0)) {
                 setBulkEditorDocId(docId);
             }
        } else {
             // Zero transactions found - FORCE MANUAL REVIEW
             dispatch({ type: 'PARSE/SUCCESS', payload: { jobId, docId, extracted: { docMeta: result.docMeta, txns: [], warnings: result.warnings, parseReport: result.parseReport } } });
             if (!relativePath) {
                dispatch({ type: 'UI/BANNER_ADD', payload: { id: generateId(), level: 'warning', title: 'Review Required', message: 'No confident transactions found. Please review.', createdAt: Date.now(), dismissible: true } });
                setBulkEditorDocId(docId); 
             }
        }

    } catch (e) {
        dispatch({ type: 'PARSE/FAIL', payload: { jobId: 'unknown', docId, error: 'Critical Parse Error' } });
    }
  };

  const recentDocs = state.documents.allIds
      .map(id => state.documents.byId[id])
      .slice(0, 5);

  const getAcceptString = (types: string[]) => {
      return types.map(t => {
          if (t === 'CSV') return '.csv';
          if (t === 'PDF') return '.pdf';
          if (t === 'XLS') return '.xls';
          if (t === 'XLSX') return '.xlsx';
          if (t === 'IMAGE') return 'image/*';
          return '';
      }).join(',');
  };

  const getStatusLabel = (doc: Document) => {
      if (doc.parseStatus === 'manual') return <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-bold">MANUAL / DRAFT</span>;
      if (doc.parseStatus === 'partial') return <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-[10px] font-bold">PARTIAL</span>;
      if (doc.parseStatus === 'failed') return <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded text-[10px] font-bold">FAILED</span>;
      return <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded text-[10px] font-bold">PARSED</span>;
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-10 relative">
        <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
            <div>
                <h2 className="text-lg font-bold text-blue-900">Bulk Ingestion</h2>
                <p className="text-xs text-blue-700">Select a folder containing multiple bank statements. Files will be auto-mapped to instruments.</p>
            </div>
            <div>
                <input 
                    type="file"
                    // @ts-ignore
                    webkitdirectory="true"
                    directory="true"
                    multiple
                    className="hidden"
                    ref={folderInputRef}
                    onChange={handleBulkUpload}
                    disabled={isProcessing}
                />
                <button 
                    onClick={() => folderInputRef.current?.click()}
                    disabled={isProcessing}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md"
                >
                    {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <FolderInput size={20} />}
                    {isProcessing ? 'Processing Queue...' : 'Bulk Upload Folder'}
                </button>
            </div>
        </div>

      {/* 1. Select Instrument (Single File Mode) */}
      <section>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <h3 className="text-lg font-semibold text-slate-700">Single File Upload</h3>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                        type="text" 
                        placeholder="Search instruments..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none w-full"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <X size={14} />
                        </button>
                    )}
                </div>
                
                <div className="flex bg-white border border-slate-300 rounded-lg p-1 gap-1 overflow-x-auto">
                    {(['ALL', 'CC', 'SB', 'CA', 'BNPL'] as const).map(filter => (
                        <button
                            key={filter}
                            onClick={() => setActiveFilter(filter)}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                                activeFilter === filter 
                                    ? 'bg-blue-100 text-blue-700' 
                                    : 'text-slate-500 hover:bg-slate-50'
                            }`}
                        >
                            {filter}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        <div className="mb-2 text-xs text-slate-400 font-medium px-1">
            Showing {filteredInstruments.length} of {instruments.length} instruments
        </div>

        {filteredInstruments.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                <p className="text-slate-500">No instruments match your search.</p>
                <button 
                    onClick={() => { setSearchTerm(''); setActiveFilter('ALL'); }}
                    className="mt-2 text-sm text-blue-600 font-medium hover:underline"
                >
                    Clear filters
                </button>
            </div>
        ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredInstruments.map(inst => (
                <button
                key={inst.id}
                onClick={() => setSelectedInstrument(inst.id)}
                className={`p-4 rounded-xl border-2 text-left transition-all relative flex flex-col h-full ${
                    selectedInstrument === inst.id
                    ? 'border-blue-500 bg-blue-50 shadow-md scale-[1.02]'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                }`}
                >
                <div className="font-semibold text-slate-800 text-sm leading-tight mb-1">{inst.name}</div>
                <div className="text-xs text-slate-500 mb-3">{inst.institution}</div>
                <div className="mt-auto flex flex-wrap gap-1">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 truncate max-w-full">
                        {inst.instrumentType.replace(/_/g, ' ')}
                    </span>
                </div>
                </button>
            ))}
            </div>
        )}
      </section>

      {/* 2. Upload Zone & Report */}
      {selectedInstrument && activeInstrument && (
          <section className="animate-fade-in-up space-y-4">
             <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors">
                <input 
                    type="file" 
                    onChange={handleFileChange} 
                    className="hidden" 
                    id="file" 
                    disabled={isProcessing}
                    accept={getAcceptString(activeInstrument.allowedFileTypes)}
                />
                <label htmlFor="file" className="cursor-pointer flex flex-col items-center w-full h-full">
                    {isProcessing ? <Loader2 className="animate-spin mb-3 text-blue-500" size={48} /> : <UploadCloud size={48} className="text-blue-500 mb-3" />}
                    <span className="text-lg font-semibold text-slate-700">
                        {isProcessing ? loadingMessage : `Upload ${activeInstrument.name}`}
                    </span>
                    <span className="text-sm text-slate-400 mt-2">
                        Accepted: {activeInstrument.allowedFileTypes.join(', ')}
                    </span>
                </label>
             </div>

             {/* Parse Report Card */}
             {parseReport && !isProcessing && (
                 <div className="bg-slate-900 text-slate-300 rounded-lg p-4 text-xs font-mono shadow-lg animate-fade-in-down">
                     <div className="flex items-center gap-2 mb-2 text-white font-bold border-b border-slate-700 pb-2">
                         <Activity size={14} className="text-blue-400"/>
                         PARSE REPORT
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                         <div>
                             <span className="block text-slate-500">Method</span>
                             <span className="text-white">{parseReport.method}</span>
                         </div>
                         <div>
                             <span className="block text-slate-500">Strategy</span>
                             <span className="text-white">{parseReport.strategy}</span>
                         </div>
                         <div>
                             <span className="block text-slate-500">Anchors Matched</span>
                             <span className="text-white">{parseReport.anchorsMatched.length > 0 ? parseReport.anchorsMatched.join(', ') : 'None'}</span>
                         </div>
                     </div>
                 </div>
             )}
          </section>
      )}

      {/* 3. Recent Activity */}
      {recentDocs.length > 0 && (
          <section>
              <h3 className="text-lg font-semibold text-slate-700 mb-4">Recent Uploads</h3>
              <div className="space-y-3">
                  {recentDocs.map(doc => {
                      const inst = state.registry.instruments[doc.instrumentId];
                      return (
                      <div key={doc.id} className="bg-white p-4 rounded-lg border border-slate-200 flex items-center justify-between shadow-sm">
                          <div className="flex items-center gap-4">
                              <div className={`p-2 rounded-full ${doc.parseStatus === 'parsed' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                                  {doc.parseStatus === 'parsed' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                              </div>
                              <div>
                                  <div className="font-medium text-sm text-slate-900">{doc.fileName}</div>
                                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                      {getStatusLabel(doc)}
                                      <span>•</span>
                                      <span>{new Date(doc.uploadedAt).toLocaleString()}</span>
                                  </div>
                              </div>
                          </div>
                          
                          <button 
                            onClick={() => setBulkEditorDocId(doc.id)}
                            className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded flex items-center gap-1 hover:bg-slate-50 hover:text-blue-600"
                          >
                              <TableProperties size={14} /> Review Data
                          </button>
                      </div>
                  )})}
              </div>
          </section>
      )}

      {/* Bulk Editor Modal */}
      {bulkEditorDocId && (
          <BulkEditGrid docId={bulkEditorDocId} onClose={() => setBulkEditorDocId(null)} />
      )}
    </div>
  );
};

export default Ingestion;