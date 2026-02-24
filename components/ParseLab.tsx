
import React, { useState } from 'react';
import { useStore } from '../store/store';
import { ParsedResult, Document, Transaction } from '../types';
import { parseFileUniversal } from '../services/parsers';
import { generateId, calculateFileHash } from '../services/utils';
import { IDBService } from '../services/idb';
import { Play, Save, FileText, AlertTriangle, CheckCircle, Info, Download, Bug, TestTube, BarChart3 } from 'lucide-react';

const ParseLab: React.FC = () => {
    const { state, dispatch } = useStore();
    const [selectedInstrument, setSelectedInstrument] = useState<string>('');
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<ParsedResult | null>(null);
    const [docId, setDocId] = useState<string>('');

    const instruments = state.registry.instrumentOrder.map(id => state.registry.instruments[id]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setResult(null);
            setDocId(generateId());
        }
    };

    const runAnalysis = async () => {
        if (!file || !selectedInstrument) return;
        setIsProcessing(true);
        try {
            // Determine type
            let fileType: Document['fileType'] = 'CSV';
            if (file.type.startsWith('image/')) fileType = 'IMAGE';
            else if (file.type === 'application/pdf') fileType = 'PDF';
            else if (file.name.endsWith('.xls')) fileType = 'XLS';
            else if (file.name.endsWith('.xlsx')) fileType = 'XLSX';

            const res = await parseFileUniversal(file, fileType, selectedInstrument);
            setResult(res);
        } catch (e) {
            console.error(e);
            alert(`Analysis Failed: ${e}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const persistToRepo = async () => {
        if (!file || !selectedInstrument || !result) return;
        
        try {
            // 1. Save File
            const sha256 = await calculateFileHash(file);
            let fileType: Document['fileType'] = 'CSV';
            if (file.type.startsWith('image/')) fileType = 'IMAGE';
            else if (file.type === 'application/pdf') fileType = 'PDF';
            else if (file.name.endsWith('.xls')) fileType = 'XLS';
            else if (file.name.endsWith('.xlsx')) fileType = 'XLSX';

            await IDBService.saveFile(docId, file);
            await IDBService.saveParsedData(docId, result);

            const doc: Document = {
                id: docId,
                instrumentId: selectedInstrument,
                fileName: file.name,
                fileType,
                sizeBytes: file.size,
                storage: { blobRef: docId, sha256 },
                uploadedAt: Date.now(),
                statementMonthHint: state.context.selectedMonth,
                extractedInstitutionName: result.docMeta.extractedInstitutionName,
                parseStatus: result.txns.every(t => !t.needsAttention) ? 'parsed' : 'partial',
                parseError: null,
                archivedAt: null,
                replacedByDocId: null,
                parseReport: result.parseReport
            };

            dispatch({ type: 'DOC/UPLOAD_SUCCESS', payload: { doc } });
            dispatch({ type: 'PARSE/SUCCESS', payload: { jobId: generateId(), docId, extracted: result } });
            
            dispatch({ type: 'UI/TOAST_ADD', payload: { id: generateId(), level: 'success', message: 'Persisted to Repository', createdAt: Date.now() } });
            dispatch({ type: 'UI/NAVIGATE', payload: { route: 'library' } });

        } catch (e) {
            alert("Failed to persist: " + e);
        }
    };

    return (
        <div className="space-y-6 pb-20">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <TestTube className="text-blue-500" /> Parse Lab (Diagnostic Mode)
                </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Configuration */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                    <h3 className="font-semibold text-slate-700 border-b pb-2">1. Input Configuration</h3>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Instrument</label>
                        <select 
                            className="w-full border border-slate-300 rounded p-2 text-sm"
                            value={selectedInstrument}
                            onChange={(e) => setSelectedInstrument(e.target.value)}
                        >
                            <option value="">-- Select Instrument --</option>
                            {instruments.map(inst => (
                                <option key={inst.id} value={inst.id}>{inst.name} ({inst.institution})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">File</label>
                        <input type="file" onChange={handleFileChange} className="w-full text-sm border border-slate-300 rounded p-2" />
                    </div>
                    {file && (
                        <div className="bg-slate-50 p-3 rounded text-xs font-mono space-y-1">
                            <div className="flex justify-between"><span>Name:</span> <span className="font-bold">{file.name}</span></div>
                            <div className="flex justify-between"><span>Size:</span> <span>{(file.size / 1024).toFixed(2)} KB</span></div>
                            <div className="flex justify-between"><span>Type:</span> <span>{file.type}</span></div>
                        </div>
                    )}
                    <button 
                        onClick={runAnalysis} 
                        disabled={!file || !selectedInstrument || isProcessing}
                        className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isProcessing ? 'Processing...' : <><Play size={16} /> Run Analysis</>}
                    </button>
                </div>

                {/* 2. Routing Decision & Stats */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                    <h3 className="font-semibold text-slate-700 border-b pb-2">2. Normalization & Stats</h3>
                    {result ? (
                        <div className="space-y-4">
                            {/* Stats Grid */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
                                    <div className="text-[10px] uppercase text-slate-400 font-bold">Extracted</div>
                                    <div className="text-lg font-bold text-slate-700">{result.parseReport.linesExtracted}</div>
                                </div>
                                <div className="bg-green-50 p-2 rounded border border-green-100 text-center">
                                    <div className="text-[10px] uppercase text-green-600 font-bold">Ready</div>
                                    <div className="text-lg font-bold text-green-700">{result.txns.filter(t => !t.needsAttention).length}</div>
                                </div>
                                <div className="bg-amber-50 p-2 rounded border border-amber-100 text-center">
                                    <div className="text-[10px] uppercase text-amber-600 font-bold">Dates Missing</div>
                                    <div className="text-lg font-bold text-amber-700">{result.txns.filter(t => !t.txnDate).length}</div>
                                </div>
                            </div>
                            
                            <div className="text-xs space-y-2 pt-2 border-t">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Dates Normalized:</span>
                                    <span className="font-mono font-bold text-blue-600">{result.txns.filter(t => t.txnDate).length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Method Strategy:</span>
                                    <span className="font-mono">{result.parseReport.strategy}</span>
                                </div>
                            </div>

                            {result.warnings.length > 0 && (
                                <div className="bg-amber-50 p-2 rounded text-xs text-amber-800 border border-amber-200">
                                    <strong>Warnings:</strong>
                                    <ul className="list-disc pl-4 mt-1">
                                        {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-slate-400 text-sm text-center py-10">Run analysis to view normalization stats.</div>
                    )}
                </div>
            </div>

            {/* 3. Output Preview */}
            {result && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Raw Preview */}
                    <div className="lg:col-span-1 bg-slate-900 text-slate-300 p-6 rounded-xl shadow-lg overflow-hidden flex flex-col h-[500px]">
                        <h3 className="font-bold text-white mb-2 flex items-center gap-2"><FileText size={16}/> Raw Extraction (Draft)</h3>
                        <div className="flex-1 overflow-auto text-[10px] font-mono whitespace-pre-wrap bg-black/30 p-2 rounded border border-white/10">
                            {result.txns.map((t, i) => (
                                <div key={i} className="mb-2 border-b border-white/10 pb-1">
                                    <span className="text-blue-400">Row {i+1}:</span> {t.descriptionRaw}
                                    <br/>
                                    <span className="text-slate-500">Date Raw: </span>
                                    <span className={t.txnDate ? 'text-green-400' : 'text-red-400'}>{t.txnDate || 'NULL'}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Parsed Table */}
                    <div className="lg:col-span-2 bg-white p-0 rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[500px]">
                        <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700">Normalized Transactions</h3>
                            <div className="flex gap-2 text-xs">
                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded font-bold">
                                    Valid: {result.txns.filter(t => !t.needsAttention).length}
                                </span>
                                <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded font-bold">
                                    Drafts: {result.txns.filter(t => t.needsAttention).length}
                                </span>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                                    <tr>
                                        <th className="p-2">Date (ISO)</th>
                                        <th className="p-2">Description</th>
                                        <th className="p-2 text-right">Amount</th>
                                        <th className="p-2">Issues</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {result.txns.slice(0, 100).map((t, i) => (
                                        <tr key={i} className={`hover:bg-slate-50 ${t.needsAttention ? 'bg-amber-50' : ''}`}>
                                            <td className={`p-2 font-mono ${!t.txnDate ? 'text-red-500 font-bold' : 'text-green-600'}`}>
                                                {t.txnDate || 'MISSING_DATE'}
                                            </td>
                                            <td className="p-2 max-w-[200px] truncate" title={t.description}>
                                                {t.description}
                                            </td>
                                            <td className={`p-2 text-right font-mono ${t.amount === 0 ? 'text-red-500 font-bold' : ''}`}>
                                                {t.direction === 'DEBIT' ? '-' : '+'}{t.amount.toFixed(2)}
                                            </td>
                                            <td className="p-2 text-amber-600">
                                                {t.issues?.join(', ')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {result.txns.length === 0 && (
                                <div className="p-10 text-center text-slate-400">No transactions found.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 4. Action Bar */}
            {result && (
                <div className="fixed bottom-0 left-64 right-0 p-4 bg-white border-t shadow-lg flex justify-between items-center z-40">
                    <div className="text-sm text-slate-600">
                        Ready to persist <strong>{result.txns.length}</strong> transactions to local database.
                    </div>
                    <div className="flex gap-4">
                        <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded hover:bg-slate-50 text-slate-600">
                            <Download size={16} /> Debug JSON
                        </button>
                        <button onClick={persistToRepo} className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700 shadow-md">
                            <Save size={16} /> Persist to Repository
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ParseLab;
