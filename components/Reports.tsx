
import React, { useState, useMemo } from 'react';
import { useStore } from '../store/store';
import { runAnalysis, isAnalyticsReady } from '../services/analysis';
import { getEffectiveTransaction } from '../services/utils';
import { Transaction } from '../types';
import { ChevronLeft, ChevronRight, Download, TrendingUp, TrendingDown, Wallet, DollarSign, ArrowLeftRight, ReceiptText } from 'lucide-react';
import { exportLedgerToCsv } from '../services/export';

type ReportTab = 'pnl' | 'expenses' | 'revenue' | 'reimbursements' | 'director';

const Reports: React.FC = () => {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<ReportTab>('pnl');
  const month = state.context.selectedMonth;
  const filter = state.ui.ledgerView.filter;

  const report = useMemo(() => runAnalysis(state), [state.transactions, state.registry.aliasMap, month]);

  const fmt = (v: number) => v.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  const changeMonth = (offset: number) => {
    const d = new Date(month + "-01");
    d.setMonth(d.getMonth() + offset);
    dispatch({ type: 'CONTEXT/SET_MONTH', payload: { month: d.toISOString().slice(0, 7) } });
  };

  // Get categorized transaction subsets
  const monthTxns = useMemo(() => {
    const ids = state.transactions.byMonth[month] || [];
    return ids.map(id => {
      const t = state.transactions.byId[id];
      return t ? getEffectiveTransaction(t) : null;
    }).filter(Boolean) as Transaction[];
  }, [state.transactions, month]);

  const analyticsReady = useMemo(() => monthTxns.filter(t => isAnalyticsReady(t, { includeDrafts: filter.includeDraftsInAnalytics })), [monthTxns, filter]);

  const companyExpenses = analyticsReady.filter(t => t.scope === 'Company' && t.direction === 'DEBIT' && !['COMPANY_TRANSFER', 'CC_BILL_PAYMENT', 'BNPL_SETTLEMENT', 'INTERNAL_ADJUSTMENT'].includes(t.categoryCode || ''));
  const companyRevenue = analyticsReady.filter(t => t.scope === 'Company' && t.direction === 'CREDIT');
  const reimbursables = monthTxns.filter(t => t.reimbursable);
  const directorTxns = analyticsReady.filter(t => t.classificationFlags?.includes('MANAGEMENT_OVERHEAD') || t.entityType === 'ManagementOverhead' || t.categoryCode?.startsWith('DIRECTOR'));

  // Group by category
  const groupByCategory = (txns: Transaction[]) => {
    const groups: Record<string, { total: number; count: number; txns: Transaction[] }> = {};
    txns.forEach(t => {
      const cat = t.categoryCode || 'UNCATEGORIZED';
      if (!groups[cat]) groups[cat] = { total: 0, count: 0, txns: [] };
      groups[cat].total += t.amount;
      groups[cat].count++;
      groups[cat].txns.push(t);
    });
    return Object.entries(groups).sort((a, b) => b[1].total - a[1].total);
  };

  const tabs: { id: ReportTab; label: string; icon: any; count?: number }[] = [
    { id: 'pnl', label: 'P&L', icon: TrendingUp },
    { id: 'expenses', label: 'Expenses', icon: TrendingDown, count: companyExpenses.length },
    { id: 'revenue', label: 'Revenue', icon: DollarSign, count: companyRevenue.length },
    { id: 'reimbursements', label: 'Reimbursable', icon: ArrowLeftRight, count: reimbursables.length },
    { id: 'director', label: 'Director', icon: Wallet, count: directorTxns.length },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Reports</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-1 py-1 shadow-sm">
            <button onClick={() => changeMonth(-1)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400"><ChevronLeft size={16}/></button>
            <span className="font-mono text-sm font-bold text-slate-700 px-2 min-w-[90px] text-center">{month}</span>
            <button onClick={() => changeMonth(1)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400"><ChevronRight size={16}/></button>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon size={15} />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="text-[10px] font-mono bg-slate-200/80 px-1.5 py-0.5 rounded">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'pnl' && <PnLView report={report} fmt={fmt} month={month} />}
      {tab === 'expenses' && <CategoryView title="Company Expenses" txns={companyExpenses} groups={groupByCategory(companyExpenses)} fmt={fmt} />}
      {tab === 'revenue' && <CategoryView title="Company Revenue" txns={companyRevenue} groups={groupByCategory(companyRevenue)} fmt={fmt} isCredit />}
      {tab === 'reimbursements' && <ReimbursementView txns={reimbursables} groups={groupByCategory(reimbursables)} fmt={fmt} />}
      {tab === 'director' && <CategoryView title="Director & Management" txns={directorTxns} groups={groupByCategory(directorTxns)} fmt={fmt} />}
    </div>
  );
};

// ─── P&L View ───
const PnLView: React.FC<{ report: any; fmt: (v: number) => string; month: string }> = ({ report, fmt, month }) => (
  <div className="space-y-6">
    {/* Summary Cards */}
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="text-xs text-slate-400 font-medium uppercase">Revenue</div>
        <div className="text-2xl font-bold text-green-600 mt-1">{fmt(report.pnl.totalRevenue)}</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="text-xs text-slate-400 font-medium uppercase">Total Expenses</div>
        <div className="text-2xl font-bold text-slate-800 mt-1">{fmt(report.pnl.totalExpenses)}</div>
      </div>
      <div className={`bg-white border rounded-xl p-6 shadow-sm ${report.pnl.netProfit >= 0 ? 'border-green-200' : 'border-red-200'}`}>
        <div className="text-xs text-slate-400 font-medium uppercase">Net Profit</div>
        <div className={`text-2xl font-bold mt-1 ${report.pnl.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(report.pnl.netProfit)}</div>
        <div className="text-xs text-slate-400 mt-1">Margin: {report.coreHealth.operatingMarginPercent}%</div>
      </div>
    </div>

    {/* P&L Breakdown */}
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-700">Expense Breakdown</h3>
      </div>
      <div className="divide-y divide-slate-50">
        {Object.entries(report.pnl.expensesByGroup || {}).filter(([,v]: any) => v > 0).sort((a: any, b: any) => b[1] - a[1]).map(([group, amount]: any) => (
          <div key={group} className="px-5 py-3 flex items-center justify-between text-sm">
            <span className="text-slate-600">{group}</span>
            <span className="font-mono font-medium text-slate-800">{fmt(amount)}</span>
          </div>
        ))}
      </div>
    </div>

    {/* KPIs */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KPI label="MCO SaaS" value={fmt(report.toolsSubscriptions.mcoSaasSpend)} />
      <KPI label="IT Infra" value={fmt(report.toolsSubscriptions.itInfraSpend)} />
      <KPI label="Bank Charges" value={fmt(report.controlLeakage.bankChargesTotal)} color="text-red-600" />
      <KPI label="Unclassified" value={`${report.controlLeakage.unclassifiedSpendPercent}%`} color={report.controlLeakage.unclassifiedSpendPercent > 5 ? 'text-red-600' : 'text-slate-700'} />
    </div>
  </div>
);

const KPI: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = 'text-slate-800' }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
    <div className="text-[11px] text-slate-400 font-medium uppercase">{label}</div>
    <div className={`text-lg font-bold mt-1 ${color}`}>{value}</div>
  </div>
);

// ─── Category View (Expenses/Revenue/Director) ───
const CategoryView: React.FC<{ title: string; txns: Transaction[]; groups: [string, { total: number; count: number; txns: Transaction[] }][]; fmt: (v: number) => string; isCredit?: boolean }> = ({ title, txns, groups, fmt, isCredit }) => {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const total = txns.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-500">{txns.length} transactions • {fmt(total)} total</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {groups.map(([cat, data]) => (
          <div key={cat}>
            <button
              onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
              className="w-full px-5 py-3 flex items-center justify-between text-sm hover:bg-slate-50 transition-colors border-b border-slate-50"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${isCredit ? 'bg-green-500' : 'bg-blue-500'}`} />
                <span className="font-medium text-slate-700">{cat.replace(/_/g, ' ')}</span>
                <span className="text-xs text-slate-400">({data.count})</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${isCredit ? 'bg-green-400' : 'bg-blue-400'}`} style={{ width: `${Math.min(100, (data.total / total) * 100)}%` }} />
                </div>
                <span className="font-mono font-medium text-slate-800 min-w-[100px] text-right">{fmt(data.total)}</span>
              </div>
            </button>
            {expandedCat === cat && (
              <div className="bg-slate-50/50 border-b border-slate-100">
                {data.txns.sort((a, b) => b.amount - a.amount).map(t => (
                  <div key={t.id} className="px-8 py-2 flex items-center justify-between text-xs border-b border-slate-50/80 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-slate-400 font-mono w-20 shrink-0">{t.txnDate}</span>
                      <span className="text-slate-600 truncate">{t.vendorName || t.description}</span>
                      {t.reimbursable && <span className="text-[9px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded shrink-0">REIMB</span>}
                    </div>
                    <span className={`font-mono font-medium shrink-0 ${isCredit ? 'text-green-600' : 'text-slate-700'}`}>{t.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {groups.length === 0 && <div className="p-8 text-center text-slate-400 text-sm">No transactions in this category for {}</div>}
      </div>
    </div>
  );
};

// ─── Reimbursement View ───
const ReimbursementView: React.FC<{ txns: Transaction[]; groups: [string, { total: number; count: number; txns: Transaction[] }][]; fmt: (v: number) => string }> = ({ txns, groups, fmt }) => {
  const total = txns.reduce((s, t) => s + t.amount, 0);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-orange-900 flex items-center gap-2"><ReceiptText size={20}/> Reimbursable (Personal → Company)</h2>
            <p className="text-sm text-orange-700/70 mt-1">{txns.length} transactions paid from personal instruments for company purposes</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-orange-700">{fmt(total)}</div>
            <div className="text-xs text-orange-500">This month</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {groups.map(([cat, data]) => (
          <div key={cat}>
            <button
              onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
              className="w-full px-5 py-3 flex items-center justify-between text-sm hover:bg-slate-50 transition-colors border-b border-slate-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-orange-400" />
                <span className="font-medium text-slate-700">{cat.replace(/_/g, ' ')}</span>
                <span className="text-xs text-slate-400">({data.count})</span>
              </div>
              <span className="font-mono font-medium text-orange-700">{fmt(data.total)}</span>
            </button>
            {expandedCat === cat && (
              <div className="bg-orange-50/30 border-b border-slate-100">
                {data.txns.sort((a, b) => b.amount - a.amount).map(t => (
                  <div key={t.id} className="px-8 py-2 flex items-center justify-between text-xs border-b border-slate-50/80 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-slate-400 font-mono w-20 shrink-0">{t.txnDate}</span>
                      <span className="text-slate-600 truncate">{t.vendorName || t.description}</span>
                      {t.scopeOverrideReason && <span className="text-[9px] text-orange-500 truncate max-w-[200px]" title={t.scopeOverrideReason}>⚡{t.scopeOverrideReason}</span>}
                    </div>
                    <span className="font-mono font-medium text-orange-700 shrink-0">{t.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {groups.length === 0 && <div className="p-8 text-center text-slate-400 text-sm">No reimbursable transactions this month. Run the classifier on the Ledger first.</div>}
      </div>
    </div>
  );
};

export default Reports;
