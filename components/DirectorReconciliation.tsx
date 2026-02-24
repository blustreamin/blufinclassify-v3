
import React, { useMemo } from 'react';
import { useStore } from '../store/store';
import { calculateDirectorNetPosition, detectSettlementPairs } from '../services/reconciliation';
import { getEffectiveTransaction } from '../services/utils';
import { Transaction } from '../types';
import { ArrowLeftRight, Building, User, AlertCircle, CheckCircle2, Wallet, Landmark, TrendingUp, TrendingDown, Scale } from 'lucide-react';

const TransactionTable: React.FC<{ txns: Transaction[], title: string, badgeColor: string }> = ({ txns, title, badgeColor }) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[400px]">
        <div className="p-4 border-b bg-slate-50 font-bold text-slate-700 flex justify-between items-center">
            <span className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${badgeColor}`}></div>
                {title} <span className="text-slate-400 font-normal ml-1">({txns.length})</span>
            </span>
            <span className="font-mono text-sm font-bold text-slate-700">
                {txns.reduce((a,b) => a + b.amount, 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            </span>
        </div>
        <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 z-10 border-b">
                    <tr>
                        <th className="p-3 w-28">Date</th>
                        <th className="p-3">Description</th>
                        <th className="p-3 w-24">Category</th>
                        <th className="p-3 w-24 text-right">Amount</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {txns.length === 0 ? (
                        <tr><td colSpan={4} className="p-8 text-center text-slate-400 text-xs">No transactions.</td></tr>
                    ) : (
                        txns.map(t => (
                            <tr key={t.id} className="hover:bg-slate-50">
                                <td className="p-3 font-mono text-xs text-slate-600">{t.txnDate}</td>
                                <td className="p-3 truncate max-w-xs text-xs">
                                    <div className="font-medium text-slate-800">{t.description}</div>
                                    <div className="text-[10px] text-slate-400">{t.vendorName || t.instrumentId}</div>
                                </td>
                                <td className="p-3 text-[10px] text-slate-500 truncate max-w-[100px]" title={t.categoryCode || ''}>{t.categoryCode}</td>
                                <td className="p-3 text-right font-mono text-xs font-bold text-slate-700">
                                    {t.amount.toLocaleString()}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

const SettlementPairsTable: React.FC<{ pairs: any[] }> = ({ pairs }) => (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-6">
        <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <ArrowLeftRight size={16} className="text-blue-500"/> Detected Settlement Pairs (Auto-Matched)
        </h3>
        {pairs.length === 0 ? (
            <div className="text-xs text-slate-400 italic">No direct matching settlements found within 7 days.</div>
        ) : (
            <div className="space-y-2">
                {pairs.map(p => (
                    <div key={p.id} className="bg-white border border-slate-200 rounded p-3 flex justify-between items-center text-xs">
                        <div className="flex gap-4 items-center">
                            <div className="text-right">
                                <div className="font-bold text-slate-700">Company</div>
                                <div className="text-slate-400">{p.companyTxn.txnDate}</div>
                            </div>
                            <ArrowLeftRight size={14} className="text-slate-300"/>
                            <div>
                                <div className="font-bold text-slate-700">Director</div>
                                <div className="text-slate-400">{p.directorTxn.txnDate}</div>
                            </div>
                        </div>
                        <div className="flex gap-4 items-center">
                            <div className="bg-green-100 text-green-700 px-2 py-1 rounded font-bold">{p.confidence === 'HIGH' ? 'Exact Date' : `${p.dateDiff}d Diff`}</div>
                            <div className="font-mono font-bold text-lg text-slate-800">{p.amount.toLocaleString()}</div>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
);

const DirectorReconciliation: React.FC = () => {
    const { state } = useStore();
    const period = state.context.selectedMonth;

    const { report, pairs } = useMemo(() => {
        // 1. Get Effective Transactions for Period
        const allTxns = (state.transactions.byMonth[period] || [])
            .map(id => state.transactions.byId[id])
            .filter(Boolean)
            .map(t => getEffectiveTransaction(t));

        // 2. Run Reconciliation Engine
        const report = calculateDirectorNetPosition(allTxns, state.registry.instruments);
        const pairs = detectSettlementPairs(allTxns, state.registry.instruments);

        return { report, pairs };
    }, [state.transactions, period, state.registry.instruments]);

    const formatCurrency = (val: number) => val.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    return (
        <div className="space-y-8 pb-20 animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Scale className="text-indigo-600" />
                        Director Reconciliation
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Deterministic Net Position • {period}</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-xs text-slate-400 font-bold uppercase">Net Position</div>
                        <div className={`text-xl font-bold ${report.netPosition.direction === 'COMPANY_OWES_DIRECTOR' ? 'text-red-600' : 'text-green-600'}`}>
                            {report.netPosition.direction === 'COMPANY_OWES_DIRECTOR' ? 'Company Owes Director' : 'Director Owes Company'}
                        </div>
                    </div>
                    <div className="bg-slate-900 text-white px-4 py-2 rounded-lg font-mono text-2xl font-bold shadow-lg">
                        {formatCurrency(report.netPosition.amount)}
                    </div>
                </div>
            </div>

            {/* Top Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border border-orange-100 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 p-3 opacity-10"><User size={48} className="text-orange-500"/></div>
                    <div className="text-xs text-orange-600 font-bold uppercase tracking-wider mb-1">Director Paid on Behalf</div>
                    <div className="text-2xl font-bold text-slate-800">{formatCurrency(report.directorPaidOnBehalf)}</div>
                    <div className="text-[10px] text-slate-400 mt-2">Add to Owed</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 p-3 opacity-10"><Building size={48} className="text-blue-500"/></div>
                    <div className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">Co. Paid Personal</div>
                    <div className="text-2xl font-bold text-slate-800">{formatCurrency(report.companyPersonalLeakage)}</div>
                    <div className="text-[10px] text-slate-400 mt-2">Deduct from Owed</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-green-100 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 p-3 opacity-10"><Landmark size={48} className="text-green-500"/></div>
                    <div className="text-xs text-green-600 font-bold uppercase tracking-wider mb-1">Settled to Director</div>
                    <div className="text-2xl font-bold text-slate-800">{formatCurrency(report.companyToDirectorSettlement)}</div>
                    <div className="text-[10px] text-slate-400 mt-2">Deduct from Owed</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-purple-100 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 p-3 opacity-10"><Wallet size={48} className="text-purple-500"/></div>
                    <div className="text-xs text-purple-600 font-bold uppercase tracking-wider mb-1">Settled to Company</div>
                    <div className="text-2xl font-bold text-slate-800">{formatCurrency(report.directorToCompanySettlement)}</div>
                    <div className="text-[10px] text-slate-400 mt-2">Add to Owed</div>
                </div>
            </div>

            {/* Formula Bar */}
            <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 flex items-center justify-center gap-2 text-xs font-mono text-slate-600 overflow-x-auto whitespace-nowrap">
                <span className="font-bold">NET = </span>
                <span className="text-orange-600" title="Paid on Behalf">( {formatCurrency(report.directorPaidOnBehalf)} </span>
                <span>+</span>
                <span className="text-purple-600" title="Director to Company">{formatCurrency(report.directorToCompanySettlement)} )</span>
                <span className="font-bold mx-2">-</span>
                <span className="text-blue-600" title="Personal Leakage">( {formatCurrency(report.companyPersonalLeakage)} </span>
                <span>+</span>
                <span className="text-green-600" title="Company to Director">{formatCurrency(report.companyToDirectorSettlement)} )</span>
            </div>

            {/* Detailed Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TransactionTable txns={report.txns.directorOnBehalf} title="Director Paid (Biz)" badgeColor="bg-orange-500" />
                <TransactionTable txns={report.txns.personalLeakage} title="Company Paid (Personal)" badgeColor="bg-blue-500" />
                <TransactionTable txns={report.txns.settlements} title="Settlement Transfers" badgeColor="bg-green-500" />
                <TransactionTable txns={report.txns.salary} title="Salary (Excluded)" badgeColor="bg-slate-400" />
            </div>

            {/* Settlement Pairs */}
            <SettlementPairsTable pairs={pairs} />
        </div>
    );
};

export default DirectorReconciliation;
