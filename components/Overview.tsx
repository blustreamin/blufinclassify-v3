
import React, { useMemo } from 'react';
import { useStore } from '../store/store';
import { runAnalysis } from '../services/analysis';
import { ArrowDownRight, ArrowUpRight, AlertTriangle, Activity, Briefcase, TrendingUp, CreditCard, ShieldAlert, User, Repeat } from 'lucide-react';

const Overview: React.FC = () => {
  const { state, dispatch } = useStore();
  const currentMonth = state.context.selectedMonth;
  
  // Calculate report on the fly to ensure freshness
  const report = useMemo(() => runAnalysis(state), [state.transactions, state.registry.aliasMap, currentMonth]);

  const formatCurrency = (val: number) => val.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  const changeMonth = (offset: number) => {
      const d = new Date(currentMonth + "-01");
      d.setMonth(d.getMonth() + offset);
      const newM = d.toISOString().slice(0, 7);
      dispatch({ type: 'CONTEXT/SET_MONTH', payload: { month: newM } });
  };

  return (
    <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Activity className="text-blue-600" />
                    Monthly Overview
                </h2>
                <p className="text-xs text-slate-500 mt-1">15 Key Performance Indicators (Ready Data Only)</p>
            </div>
            <div className="flex items-center gap-2">
                 <button onClick={() => changeMonth(-1)} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 text-sm font-medium">Prev</button>
                 <span className="font-mono font-bold text-lg px-2 text-slate-700">{currentMonth}</span>
                 <button onClick={() => changeMonth(1)} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 text-sm font-medium">Next</button>
            </div>
        </div>

        {/* 1. Core Health */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-32">
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Net Cash Flow</div>
                <div className={`text-2xl font-bold ${report.coreHealth.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(report.coreHealth.netCashFlow)}
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-32 cursor-pointer hover:border-blue-300 transition-colors" onClick={() => dispatch({ type: 'UI/NAVIGATE', payload: { route: 'company_expenses' } })}>
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1"><ArrowUpRight size={14} className="text-red-500"/> Company Expenses</div>
                <div className="text-2xl font-bold text-slate-800">
                    {formatCurrency(report.coreHealth.companyExpenses)}
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-32 cursor-pointer hover:border-green-300 transition-colors" onClick={() => dispatch({ type: 'UI/NAVIGATE', payload: { route: 'company_revenue' } })}>
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1"><ArrowDownRight size={14} className="text-green-500"/> Company Revenue</div>
                <div className="text-2xl font-bold text-slate-800">
                    {formatCurrency(report.coreHealth.companyRevenue)}
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-32 cursor-pointer hover:border-purple-300 transition-colors" onClick={() => dispatch({ type: 'UI/NAVIGATE', payload: { route: 'p_n_l' } })}>
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Operating Margin</div>
                <div className={`text-2xl font-bold ${report.coreHealth.operatingMarginPercent >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {report.coreHealth.operatingMarginPercent}%
                </div>
                <div className="text-[10px] text-slate-400">Net Profit: {formatCurrency(report.pnl.netProfit)}</div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 2. Control & Leakage */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b pb-2"><ShieldAlert size={18} className="text-amber-500"/> Control & Leakage</h3>
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Unclassified Spend</span>
                        <span className={`font-mono font-bold ${report.controlLeakage.unclassifiedSpendPercent > 5 ? 'text-red-600' : 'text-slate-700'}`}>
                            {report.controlLeakage.unclassifiedSpendPercent}%
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Personal on Company</span>
                        <span className={`font-mono font-bold ${report.controlLeakage.personalOnCompanyPercent > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                            {report.controlLeakage.personalOnCompanyPercent}%
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Director Reimbursements</span>
                        <span className="font-mono font-bold text-slate-700">{formatCurrency(report.controlLeakage.directorReimbursementTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Bank Charges ({report.controlLeakage.bankChargesCount})</span>
                        <span className="font-mono font-bold text-red-600">{formatCurrency(report.controlLeakage.bankChargesTotal)}</span>
                    </div>
                </div>
            </div>

            {/* 3. Tools & Payments */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b pb-2"><CreditCard size={18} className="text-blue-500"/> Tools & Payments</h3>
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">MCO SaaS Spend</span>
                        <span className="font-mono font-bold text-slate-700">{formatCurrency(report.toolsSubscriptions.mcoSaasSpend)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">IT Infrastructure</span>
                        <span className="font-mono font-bold text-slate-700">{formatCurrency(report.toolsSubscriptions.itInfraSpend)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Subscription Concentration</span>
                        <span className="font-mono font-bold text-blue-600">{report.toolsSubscriptions.subscriptionConcentrationPercent}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">BNPL Dependency</span>
                        <span className="font-mono font-bold text-purple-600">{report.paymentsRisk.bnplDependencyPercent}%</span>
                    </div>
                </div>
            </div>

            {/* 4. Personal & Director */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:border-indigo-300 transition-colors" onClick={() => dispatch({ type: 'UI/NAVIGATE', payload: { route: 'director_personal' } })}>
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b pb-2"><User size={18} className="text-indigo-500"/> Personal & Director</h3>
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Personal Inflow</span>
                        <span className="font-mono font-bold text-green-600">{formatCurrency(report.personal.inflowTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Personal Outflow</span>
                        <span className="font-mono font-bold text-red-600">{formatCurrency(report.personal.outflowTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Spend on Company CC</span>
                        <span className="font-mono font-bold text-amber-600">{formatCurrency(report.personal.personalSpendOnCompanyCC)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600 flex items-center gap-1"><Repeat size={12}/> Transfers ({report.personal.transfersCount})</span>
                        <span className="font-mono font-bold text-slate-500">{formatCurrency(report.personal.transfersTotal)}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default Overview;
