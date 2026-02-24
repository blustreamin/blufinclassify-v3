
import React, { useMemo } from 'react';
import { useStore } from '../store/store';
import { runAnalysis, isAnalyticsReady } from '../services/analysis';
import { getEffectiveTransaction } from '../services/utils';
import { Transaction } from '../types';
import { BarChart2, PieChart, TrendingUp, TrendingDown, ArrowRight, Wallet, User, Building, Landmark, Percent } from 'lucide-react';

// Reusable Table Component (Visualizes VISIBLE_SET)
const TransactionTable: React.FC<{ txns: Transaction[], title: string, showCredit?: boolean }> = ({ txns, title, showCredit = false }) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[500px]">
        <div className="p-4 border-b bg-slate-50 font-bold text-slate-700 flex justify-between items-center">
            <span>{title} ({txns.length})</span>
            <span className="text-[10px] bg-slate-200 px-2 py-1 rounded text-slate-600 font-medium">
                Showing Visible Rows
            </span>
        </div>
        <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 z-10 shadow-sm border-b">
                    <tr>
                        <th className="p-3 w-32">Date</th>
                        <th className="p-3">Description</th>
                        <th className="p-3 w-24 text-center">Status</th>
                        <th className="p-3 w-40">Category</th>
                        <th className="p-3 text-right w-32">Amount</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {txns.length === 0 ? (
                        <tr><td colSpan={5} className="p-8 text-center text-slate-400">No transactions found.</td></tr>
                    ) : (
                        txns.map(t => (
                            <tr key={t.id} className={`hover:bg-slate-50 ${t.status === 'draft' ? 'bg-amber-50/30' : ''}`}>
                                <td className={`p-3 font-mono ${!t.txnDate ? 'text-red-500' : 'text-slate-600'}`}>{t.txnDate || 'MISSING'}</td>
                                <td className="p-3 truncate max-w-xs" title={t.description}>
                                    <div className="font-medium text-slate-900">{t.vendorName || t.clientName || t.description}</div>
                                    {t.status === 'draft' && <div className="text-[10px] text-amber-600 mt-0.5">DRAFT • Not in totals</div>}
                                </td>
                                <td className="p-3 text-center">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${t.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                        {t.status}
                                    </span>
                                </td>
                                <td className="p-3 text-xs text-slate-500">{t.categoryCode}</td>
                                <td className={`p-3 text-right font-mono font-bold ${showCredit ? 'text-green-600' : 'text-slate-800'}`}>
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

export const CompanyExpenses: React.FC = () => {
    const { state } = useStore();
    // 1. Analytics Report (Strictly Ready Data Only)
    const report = runAnalysis(state);
    
    // 2. Visual Table Data (Respects Global Visibility Filters)
    const visibleTxns = useMemo(() => {
        const period = state.context.selectedMonth;
        const filter = state.ui.ledgerView.filter;
        const all = state.transactions.byMonth[period]?.map(id => state.transactions.byId[id]).filter(Boolean) || [];
        
        return all
            .map(t => getEffectiveTransaction(t))
            .filter(t => {
                // Visibility Check
                if (!filter.showDrafts && t.status === 'draft') return false;
                if (!filter.showExcluded && t.status === 'excluded') return false;

                // Logic Check (Company Expense Definition)
                if (t.direction !== 'DEBIT') return false;
                const isCompany = t.transactionNature?.startsWith('COMPANY') || t.instrumentId.includes('_company') || t.instrumentId.includes('_corporate');
                if (!isCompany) return false;
                if (t.categoryCode === 'COMPANY_TRANSFER' || t.categoryCode === 'PERSONAL_TRANSFER') return false;
                if (t.transactionNature === 'PERSONAL_TXN_FROM_COMPANY_INSTRUMENT') return false;
                
                return true;
            }).sort((a,b) => b.amount - a.amount);
    }, [state.transactions, state.context.selectedMonth, state.ui.ledgerView.filter]);

    return (
        <div className="space-y-6 animate-fade-in">
            {/* KPI Cards - Always Ready Data */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm">
                    <div className="text-xs text-red-500 font-bold uppercase">Total Expenses</div>
                    <div className="text-2xl font-bold text-slate-800">{report.coreHealth.companyExpenses.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-400 mt-1">Ready data only</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 font-bold uppercase">MCO & SaaS</div>
                    <div className="text-xl font-bold text-slate-700">{report.toolsSubscriptions.mcoSaasSpend.toLocaleString()}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 font-bold uppercase">Salary</div>
                    <div className="text-xl font-bold text-slate-700">{(report.salaryTotal || 0).toLocaleString()}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 font-bold uppercase">Uncategorized</div>
                    <div className={`text-xl font-bold ${report.controlLeakage.unclassifiedSpendPercent > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                        {report.pnl.expenses['UNCATEGORIZED']?.toLocaleString() || 0}
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <TransactionTable txns={visibleTxns} title="Expense Transactions" />
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 h-[500px] overflow-auto">
                    <h3 className="font-bold text-slate-700 mb-4 border-b pb-2">Category Breakdown (Ready)</h3>
                    <table className="w-full text-sm">
                        <tbody>
                            {Object.entries(report.pnl.expenses).sort((a,b) => b[1] - a[1]).map(([cat, amt]) => (
                                <tr key={cat} className="border-b border-slate-50 last:border-0">
                                    <td className="py-2 text-slate-600">{cat}</td>
                                    <td className="py-2 text-right font-mono font-bold">{amt.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export const CompanyRevenue: React.FC = () => {
    const { state } = useStore();
    const report = runAnalysis(state);
    
    const visibleTxns = useMemo(() => {
        const period = state.context.selectedMonth;
        const filter = state.ui.ledgerView.filter;
        const all = state.transactions.byMonth[period]?.map(id => state.transactions.byId[id]).filter(Boolean) || [];
        
        return all
            .map(t => getEffectiveTransaction(t))
            .filter(t => {
                if (!filter.showDrafts && t.status === 'draft') return false;
                if (!filter.showExcluded && t.status === 'excluded') return false;

                if (t.direction !== 'CREDIT') return false;
                const isCompany = t.transactionNature?.startsWith('COMPANY') || t.instrumentId.includes('_company');
                if (!isCompany) return false;
                if (t.categoryCode === 'COMPANY_TRANSFER') return false;
                return true;
            }).sort((a,b) => b.amount - a.amount);
    }, [state.transactions, state.context.selectedMonth, state.ui.ledgerView.filter]);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                    <div className="text-xs text-green-600 font-bold uppercase">Total Revenue</div>
                    <div className="text-2xl font-bold text-slate-800">{report.coreHealth.companyRevenue.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-400 mt-1">Ready data only</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 font-bold uppercase">Client Receipts</div>
                    <div className="text-xl font-bold text-slate-700">{report.pnl.revenue.clientReceipt.toLocaleString()}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 font-bold uppercase">Top Client</div>
                    <div className="text-xl font-bold text-slate-700 truncate" title={report.topClients?.[0]?.name}>{report.topClients?.[0]?.name || 'None'}</div>
                    <div className="text-xs text-green-600">{report.topClients?.[0]?.amount.toLocaleString()}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <TransactionTable txns={visibleTxns} title="Revenue Transactions" showCredit />
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h3 className="font-bold text-slate-700 mb-4 border-b pb-2">Top Clients (Ready)</h3>
                    <table className="w-full text-sm">
                        <tbody>
                            {report.topClients?.map((c, i) => (
                                <tr key={i} className="border-b border-slate-50 last:border-0">
                                    <td className="py-2 text-slate-600 truncate max-w-[150px]">{c.name}</td>
                                    <td className="py-2 text-right font-mono font-bold text-green-600">{c.amount.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export const CompanyPnL: React.FC = () => {
    const { state } = useStore();
    const report = runAnalysis(state);

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Building size={20}/> Profit & Loss (Cash Basis)</h2>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="p-4 text-left font-bold text-slate-600">Line Item</th>
                            <th className="p-4 text-right font-bold text-slate-600">Amount (Ready)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {/* Revenue */}
                        <tr className="bg-green-50/50">
                            <td className="p-4 font-bold text-green-900">Total Revenue</td>
                            <td className="p-4 text-right font-bold text-green-900">{report.pnl.revenue.total.toLocaleString()}</td>
                        </tr>
                        <tr><td className="p-4 pl-8 text-slate-600">Client Receipts</td><td className="p-4 text-right">{report.pnl.revenue.clientReceipt.toLocaleString()}</td></tr>
                        <tr><td className="p-4 pl-8 text-slate-600">Other Income</td><td className="p-4 text-right">{report.pnl.revenue.otherIncome.toLocaleString()}</td></tr>
                        <tr><td className="p-4 pl-8 text-slate-600">Refunds / Reversals</td><td className="p-4 text-right text-red-500">({Math.abs(report.pnl.revenue.refundReversal).toLocaleString()})</td></tr>
                        
                        {/* Expenses */}
                        <tr className="bg-red-50/50">
                            <td className="p-4 font-bold text-red-900">Total Expenses</td>
                            <td className="p-4 text-right font-bold text-red-900">{report.pnl.totalExpense.toLocaleString()}</td>
                        </tr>
                        {Object.entries(report.pnl.expenses).sort((a,b) => b[1] - a[1]).map(([cat, amt]) => (
                            <tr key={cat}>
                                <td className="p-4 pl-8 text-slate-600">{cat}</td>
                                <td className="p-4 text-right font-mono">{amt.toLocaleString()}</td>
                            </tr>
                        ))}

                        {/* Net */}
                        <tr className="bg-slate-100 border-t-2 border-slate-200">
                            <td className="p-4 font-bold text-lg text-slate-800">Net Profit (Cash)</td>
                            <td className={`p-4 text-right font-bold text-lg ${report.pnl.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                {report.pnl.netProfit.toLocaleString()}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export const DirectorPersonal: React.FC = () => {
    const { state } = useStore();
    const report = runAnalysis(state);

    const visibleTxns = useMemo(() => {
        const period = state.context.selectedMonth;
        const filter = state.ui.ledgerView.filter;
        const all = state.transactions.byMonth[period]?.map(id => state.transactions.byId[id]).filter(Boolean) || [];
        
        // Explicit list of Personal Categories to force visibility even if instrument is corporate
        const PERSONAL_CATEGORIES = [
            'FUEL', 'VEHICLE_REPAIR_MAINTENANCE', 'FOOD_DELIVERY', 'DINING_CAFES', 
            'GROCERIES_DAILY_NEEDS', 'MEDICAL_HEALTHCARE', 'PERSONAL_GROCERIES', 
            'RIDE_HAILING_LOCAL', 'TRAVEL_INTERCITY', 'PERSONAL_SHOPPING', 
            'ENTERTAINMENT_LEISURE', 'FITNESS_WELLNESS', 'PERSONAL_SUBSCRIPTIONS', 
            'EDUCATION_LEARNING', 'GIFTS_DONATIONS', 'RENT_HOUSING', 
            'PERSONAL_UTILITIES', 'INSURANCE_PREMIUM', 'OTHER_PERSONAL_EXPENSE',
            'PERSONAL_TRANSFER',
            // Director Specific
            'DIRECTOR_REIMBURSEMENT', 'SALARY', 'SALARY_ADVANCE'
        ];

        return all
            .map(t => getEffectiveTransaction(t))
            .filter(t => {
                if (!filter.showDrafts && t.status === 'draft') return false;
                if (!filter.showExcluded && t.status === 'excluded') return false;

                const isPersonal = t.transactionNature?.includes('PERSONAL') || t.instrumentId.includes('_personal');
                const isPersonalOnComp = t.transactionNature === 'PERSONAL_TXN_FROM_COMPANY_INSTRUMENT';
                const isPersonalCategory = t.categoryCode && PERSONAL_CATEGORIES.includes(t.categoryCode);
                // Include Director related rows even if on Company instrument
                const isDirectorRelated = t.categoryCode === 'DIRECTOR_REIMBURSEMENT' || 
                                          (t.categoryCode === 'SALARY' && t.vendorName?.includes('VENKATRAMAN')) ||
                                          (t.vendorName?.includes('NEELAM'));

                return isPersonal || isPersonalOnComp || isPersonalCategory || isDirectorRelated;
            }).sort((a,b) => b.amount - a.amount);
    }, [state.transactions, state.context.selectedMonth, state.ui.ledgerView.filter]);

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Director Intelligence Card */}
            <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg border border-slate-800">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-lg font-bold flex items-center gap-2"><Landmark className="text-yellow-400"/> Director Compensation & Draw</h3>
                        <p className="text-xs text-slate-400 mt-1">Founders' total extraction from company accounts</p>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-slate-400 uppercase font-bold">Net Outflow</div>
                        <div className="text-2xl font-mono font-bold text-yellow-400">{report.directorIntelligence.netOutflowFromCompany.toLocaleString()}</div>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <div className="bg-white/10 p-3 rounded-lg border border-white/5">
                        <div className="text-xs text-slate-400 uppercase mb-1">Formal Salary</div>
                        <div className="font-mono font-bold">{report.directorIntelligence.directorSalaryTotal.toLocaleString()}</div>
                    </div>
                    <div className="bg-white/10 p-3 rounded-lg border border-white/5">
                        <div className="text-xs text-slate-400 uppercase mb-1">Director Draw / Reimb.</div>
                        <div className="font-mono font-bold text-blue-300">{report.directorIntelligence.directorDrawTotal.toLocaleString()}</div>
                    </div>
                    <div className="bg-white/10 p-3 rounded-lg border border-white/5">
                        <div className="text-xs text-slate-400 uppercase mb-1">Spouse (Neelam)</div>
                        <div className="font-mono font-bold text-pink-300">{report.directorIntelligence.spousePaymentsTotal.toLocaleString()}</div>
                    </div>
                    <div className="bg-white/10 p-3 rounded-lg border border-white/5">
                        <div className="text-xs text-slate-400 uppercase mb-1">Personal on Company</div>
                        <div className="font-mono font-bold text-amber-300">{report.directorIntelligence.personalSpendOnCompanyTotal.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                    <div className="text-xs text-green-600 font-bold uppercase">Personal Inflow</div>
                    <div className="text-2xl font-bold text-slate-800">{report.personal.inflowTotal.toLocaleString()}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm">
                    <div className="text-xs text-red-500 font-bold uppercase">Personal Outflow</div>
                    <div className="text-2xl font-bold text-slate-800">{report.personal.outflowTotal.toLocaleString()}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 font-bold uppercase">Net Personal Flow</div>
                    <div className={`text-xl font-bold ${report.personal.netCashflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {report.personal.netCashflow.toLocaleString()}
                    </div>
                </div>
            </div>

            <TransactionTable txns={visibleTxns} title="Director & Personal Transactions" />
        </div>
    );
};
