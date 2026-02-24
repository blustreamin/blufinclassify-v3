
import React, { useState } from 'react';
import { useStore } from '../store/store';
import { Document, ParsedResult } from '../types';
import { parseFileUniversal } from '../services/parsers';
import { IDBService } from '../services/idb';
import { generateId } from '../services/utils';
import { FileText, Trash2, RefreshCw, Eye, AlertTriangle, CheckCircle, Search, Filter, Database, BarChart2, PieChart, Activity } from 'lucide-react';
import BulkEditGrid from './BulkEditGrid';

const Library: React.FC = () => {
    const { state, dispatch } = useStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'parsed' | 'partial' | 'manual' | 'failed'>('ALL');
    const [reviewDocId, setReviewDocId] = useState<string | null>(null);
    const [isReparsing, setIsReparsing] = useState<string | null>(null);

    const docs = state.documents.allIds.map(id => state.documents.byId[id]).filter(Boolean);

    const filteredDocs = docs.filter(doc => {
        const matchesSearch = doc.fileName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              state.registry.instruments[doc.instrumentId]?.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'ALL' || doc.parseStatus === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'parsed': return <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Parsed</span>;
            case 'partial': return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Partial</span>;
            case 'manual': return <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Manual</span>;
            case 'failed': return <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Failed</span>;
            default: return null;
        }
    };

    // --- KPI CALCULATION ---
    const totalFiles = docs.length;
    const totalTxns = state.transactions.allIds.length;
    const totalDrafts = state.transactions.needsAttention.length;
    const successRate = totalFiles > 0 ? Math.round((docs.filter(d => d.parseStatus === 'parsed').length / totalFiles) * 100) : 0;
    
    // Aggregated Stats
    let totalRejected = 0;
    let totalLinesScanned = 0;
    docs.forEach(d => {
        if (d.stats) {
            totalRejected += d.stats.rejectedRows;
            totalLinesScanned += d.stats.totalRows;
        } else if (d.parseReport) {
             totalLinesScanned += d.parseReport.linesExtracted;
        }
    });

    const handleDelete = (docId: string) => {
        if (confirm('Are you sure you want to delete this statement and all its transactions? This cannot be undone.')) {
            dispatch({ type: 'TXN/DELETE_MANY_BY_DOC', payload: { docId, reason: 'User Delete' } });
            dispatch({ type: 'DOC/DELETE', payload: { docId } });
        }
    };

    const handleReparse = async (doc: Document) => {
        setIsReparsing(doc.id);
        try {
            const fileData = await IDBService.getFile(doc.id);
            if (!fileData) throw new Error("File not found in storage");

            // Reconstruct file object (mocking mostly for parser)
            const file = new File([fileData.blob], fileData.name, { type: fileData.type });
            
            const jobId = generateId();
            dispatch({ type: 'PARSE/START', payload: { jobId, docId: doc.id } });
            
            const result: ParsedResult = await parseFileUniversal(file, doc.fileType, doc.instrumentId);
            
            // Persist raw parse
            await IDBService.saveParsedData(doc.id, result);

            if (result.txns.length > 0) {
                 dispatch({ type: 'PARSE/SUCCESS', payload: { jobId, docId: doc.id, extracted: result } });
                 dispatch({ type: 'UI/TOAST_ADD', payload: { id: generateId(), level: 'success', message: 'Re-parsed successfully', createdAt: Date.now() } });
            } else {
                 dispatch({ type: 'PARSE/SUCCESS', payload: { jobId, docId: doc.id, extracted: { docMeta: result.docMeta, txns: [], warnings: result.warnings, parseReport: result.parseReport } } });
                 dispatch({ type: 'UI/BANNER_ADD', payload: { id: generateId(), level: 'warning', title: 'Re-parse Empty', message: 'No transactions found during re-parse.', createdAt: Date.now(), dismissible: true } });
            }

        } catch (e) {
            dispatch({ type: 'UI/BANNER_ADD', payload: { id: generateId(), level: 'error', title: 'Re-parse Failed', message: 'Could not load file or parse error.', createdAt: Date.now(), dismissible: true } });
        } finally {
            setIsReparsing(null);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Database className="text-blue-500" /> Upload Insights
                </h2>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input 
                            type="text" 
                            placeholder="Search files..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 pr-4 py-2 text-sm border border-slate-300 rounded-lg w-64 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                    </div>
                    <select 
                        value={statusFilter} 
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="parsed">Parsed</option>
                        <option value="partial">Partial</option>
                        <option value="manual">Manual</option>
                        <option value="failed">Failed</option>
                    </select>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
                    <div className="flex justify-between items-start">
                        <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Volume</div>
                        <BarChart2 size={16} className="text-blue-400"/>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-slate-800">{totalTxns}</div>
                        <div className="text-xs text-slate-400 mt-1">transactions ingested</div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
                    <div className="flex justify-between items-start">
                        <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">File Health</div>
                        <Activity size={16} className="text-green-400"/>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-green-600">{successRate}%</div>
                        <div className="text-xs text-slate-400 mt-1">{totalFiles} files total</div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
                    <div className="flex justify-between items-start">
                        <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Review Queue</div>
                        <AlertTriangle size={16} className="text-amber-400"/>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-amber-600">{totalDrafts}</div>
                        <div className="text-xs text-slate-400 mt-1">drafts needing attention</div>
                    </div>
                </div>

                 <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
                    <div className="flex justify-between items-start">
                        <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Rejection Rate</div>
                        <PieChart size={16} className="text-red-400"/>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-red-600">
                           {totalLinesScanned > 0 ? Math.round((totalRejected / totalLinesScanned) * 100) : 0}%
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{totalRejected} rows dropped (garbage)</div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                            <th className="p-4 w-40">Uploaded</th>
                            <th className="p-4">Filename</th>
                            <th className="p-4">Instrument</th>
                            <th className="p-4 w-24">Status</th>
                            <th className="p-4 w-48">Quality Audit</th>
                            <th className="p-4 text-center w-24">Txns</th>
                            <th className="p-4 text-right w-32">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredDocs.length === 0 ? (
                            <tr><td colSpan={7} className="p-8 text-center text-slate-400">No statements found.</td></tr>
                        ) : (
                            filteredDocs.map(doc => {
                                const txnIds = state.transactions.byDoc[doc.id] || [];
                                const total = txnIds.length;
                                const drafts = txnIds.filter(id => state.transactions.byId[id]?.needsAttention).length;
                                const valid = total - drafts;
                                
                                const totalScanned = doc.stats ? doc.stats.totalRows : (doc.parseReport?.linesExtracted || total);
                                const rejected = doc.stats ? doc.stats.rejectedRows : 0;
                                
                                // Quality Bar Calculation
                                const pValid = totalScanned > 0 ? (valid / totalScanned) * 100 : 0;
                                const pDraft = totalScanned > 0 ? (drafts / totalScanned) * 100 : 0;
                                const pReject = totalScanned > 0 ? (rejected / totalScanned) * 100 : 0;

                                return (
                                <tr key={doc.id} className="hover:bg-slate-50 group transition-colors">
                                    <td className="p-4 text-slate-500">
                                        <div className="text-xs font-mono">{new Date(doc.uploadedAt).toISOString().split('T')[0]}</div>
                                        {doc.relativePath && <div className="text-[10px] text-slate-400 truncate max-w-[150px] mt-1" title={doc.relativePath}>{doc.relativePath}</div>}
                                    </td>
                                    <td className="p-4 font-medium text-slate-900">
                                        <div className="flex flex-col">
                                            <span className="truncate max-w-[200px]" title={doc.fileName}>{doc.fileName}</span>
                                            {doc.parseError && <span className="text-[10px] text-red-500 flex items-center gap-1"><AlertTriangle size={10} /> Parse Error</span>}
                                        </div>
                                    </td>
                                    <td className="p-4 text-slate-600">
                                        <span className="bg-slate-100 px-2 py-1 rounded text-xs truncate max-w-[150px] inline-block" title={state.registry.instruments[doc.instrumentId]?.name}>
                                            {state.registry.instruments[doc.instrumentId]?.name || doc.instrumentId}
                                        </span>
                                    </td>
                                    <td className="p-4">{getStatusBadge(doc.parseStatus)}</td>
                                    <td className="p-4">
                                        {/* Quality Bar */}
                                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                                            <div className="bg-green-500 h-full" style={{ width: `${pValid}%` }} title={`Valid: ${valid}`}></div>
                                            <div className="bg-amber-400 h-full" style={{ width: `${pDraft}%` }} title={`Drafts: ${drafts}`}></div>
                                            <div className="bg-red-300 h-full" style={{ width: `${pReject}%` }} title={`Rejected: ${rejected}`}></div>
                                        </div>
                                        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                            <span>{Math.round(pValid)}% OK</span>
                                            <span>{rejected} dropped</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-center font-mono font-bold text-slate-700">
                                        {total}
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => setReviewDocId(doc.id)} 
                                                className="p-1.5 hover:bg-blue-50 text-blue-600 rounded" 
                                                title="Audit & Review"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            <button 
                                                onClick={() => handleReparse(doc)} 
                                                disabled={isReparsing === doc.id}
                                                className={`p-1.5 hover:bg-slate-100 text-slate-600 rounded ${isReparsing === doc.id ? 'animate-spin' : ''}`} 
                                                title="Re-run Parse"
                                            >
                                                <RefreshCw size={16} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(doc.id)} 
                                                className="p-1.5 hover:bg-red-50 text-red-600 rounded" 
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )})
                        )}
                    </tbody>
                </table>
            </div>

            {reviewDocId && (
                <BulkEditGrid docId={reviewDocId} onClose={() => setReviewDocId(null)} />
            )}
        </div>
    );
};

export default Library;
