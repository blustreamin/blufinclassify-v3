
import React from 'react';
import { useStore } from '../store/store';
import { runAnalysis } from '../services/analysis';
import { ArrowDownRight, ArrowUpRight, AlertTriangle, Activity, Briefcase, TrendingUp, CreditCard, ShieldAlert } from 'lucide-react';

const Dashboard: React.FC = () => {
  const { state, dispatch } = useStore();
  const currentMonth = state.context.selectedMonth;
  
  // Calculate on fly for Overview to ensure freshness
  const report = runAnalysis(state);

  const formatCurrency = (val: number) => val.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  const changeMonth = (offset: number) => {
      const d = new Date(currentMonth + "-01");
      d.setMonth(d.getMonth() + offset);
      const newM = d.toISOString().slice(0, 7);
      dispatch({ type: 'CONTEXT/SET_MONTH', payload: { month: newM } });
  };

  return (
    <div className="space-y-8">
        {/* Top Controls */}
        <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Activity className="text-blue-600" />
                Monthly Overview
            </h2>
            <div className="flex items-center gap-2">
                 <button onClick={() => changeMonth(-1)} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 text-sm">Prev</button>
                 <span className="font-mono font-bold text-lg px-2">{currentMonth}</span>
                 <button onClick={() => changeMonth(1)} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 text-sm">Next</button>
            </div>
        </div>

        {/* 1. Core Health */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Net Cash Flow</div>
                <div className={`text-2xl font-bold ${report.coreHealth.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(report.coreHealth.netCashFlow)}
                </div>
                <div className="text-xs text-slate-400 mt-1">All Instruments</div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1"><ArrowUpRight size={14} className="text-red-500"/> Company Expenses</div>
                <div className="text-2xl font-bold text-slate-800">
                    {formatCurrency(report.coreHealth.companyExpenses)}
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1"><ArrowDownRight size={14} className="text-green-500"/> Company Revenue</div>
                <div className="text-2xl font-bold text-slate-800">
                    {formatCurrency(report.coreHealth.companyRevenue)}
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Operating Margin</div>
                <div className={`text-2xl font-bold ${report.coreHealth.operatingMarginPercent >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {report.coreHealth.operatingMarginPercent}%
                </div>
            </div>
        </div>

        {/* 2. Control & Risk */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><ShieldAlert size={18} /> Control & Leakage</h3>
                <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                        <span className="text-sm text-slate-600">Unclassified Spend</span>
                        <span className={`font-mono font-bold ${report.controlLeakage.unclassifiedSpendPercent > 5 ? 'text-red-600' : 'text-slate-700'}`}>
                            {report.controlLeakage.unclassifiedSpendPercent}%
                        </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                        <span className="text-sm text-slate-600">Personal on Company Instruments</span>
                        <span className="font-mono font-bold text-amber-600">{report.controlLeakage.personalOnCompanyPercent}%</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                        <span className="text-sm text-slate-600">Director Reimbursements</span>
                        <span className="font-mono font-bold text-slate-700">{formatCurrency(report.controlLeakage.directorReimbursementTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Bank Charges</span>
                        <span className="font-mono font-bold text-red-600">{formatCurrency(report.controlLeakage.bankChargesTotal)}</span>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><CreditCard size={18} /> Tools & Payments</h3>
                <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                        <span className="text-sm text-slate-600">MCO SaaS Spend</span>
                        <span className="font-mono font-bold text-slate-700">{formatCurrency(report.toolsSubscriptions.mcoSaasSpend)}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                        <span className="text-sm text-slate-600">IT Infrastructure</span>
                        <span className="font-mono font-bold text-slate-700">{formatCurrency(report.toolsSubscriptions.itInfraSpend)}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                        <span className="text-sm text-slate-600">Subscription Concentration</span>
                        <span className="font-mono font-bold text-blue-600">{report.toolsSubscriptions.subscriptionConcentrationPercent}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">BNPL Dependency (Outflow %)</span>
                        <span className="font-mono font-bold text-purple-600">{report.paymentsRisk.bnplDependencyPercent}%</span>
                    </div>
                </div>
            </div>
        </div>

        {/* 3. Shortcuts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button onClick={() => dispatch({ type: 'UI/NAVIGATE', payload: { route: 'company_expenses' } })} className="p-6 bg-blue-50 border border-blue-100 rounded-xl hover:shadow-md transition-shadow text-left">
                <Briefcase className="text-blue-600 mb-2" />
                <h4 className="font-bold text-blue-900">Company Expenses</h4>
                <p className="text-xs text-blue-700 mt-1">Review vendor spend & classify</p>
            </button>
            <button onClick={() => dispatch({ type: 'UI/NAVIGATE', payload: { route: 'company_revenue' } })} className="p-6 bg-green-50 border border-green-100 rounded-xl hover:shadow-md transition-shadow text-left">
                <TrendingUp className="text-green-600 mb-2" />
                <h4 className="font-bold text-green-900">Company Revenue</h4>
                <p className="text-xs text-green-700 mt-1">Track client receipts & income</p>
            </button>
            <button onClick={() => dispatch({ type: 'UI/NAVIGATE', payload: { route: 'p_n_l' } })} className="p-6 bg-purple-50 border border-purple-100 rounded-xl hover:shadow-md transition-shadow text-left">
                <Activity className="text-purple-600 mb-2" />
                <h4 className="font-bold text-purple-900">Profit & Loss</h4>
                <p className="text-xs text-purple-700 mt-1">View cash P&L statement</p>
            </button>
        </div>
    </div>
  );
};

export default Dashboard;
