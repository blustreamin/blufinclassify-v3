
import React, { useState, useMemo } from 'react';
import { useStore } from '../store/store';
import { buildRegistries } from '../services/analysis';
import { Search, Merge, Edit2, Users, Building, ShoppingBag, Briefcase } from 'lucide-react';

const Registries: React.FC = () => {
    const { state, dispatch } = useStore();
    const [activeTab, setActiveTab] = useState<'VENDORS' | 'MERCHANTS' | 'CLIENTS' | 'EMPLOYEES'>('VENDORS');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Memoize registry build to avoid lag
    const registries = useMemo(() => buildRegistries(state), [state.transactions, state.registry.aliasMap]);

    // Modal State
    const [mergeTarget, setMergeTarget] = useState<string | null>(null);
    const [aliasInput, setAliasInput] = useState('');

    const handleAddAlias = (canonical: string) => {
        const alias = prompt(`Enter new alias for ${canonical}:`);
        if (alias) {
            dispatch({ type: 'REGISTRY/ADD_ALIAS', payload: { alias, canonical } });
        }
    };

    const handleMerge = (targetCanonical: string) => {
        const source = prompt(`Enter the name of the duplicate entity to merge INTO ${targetCanonical}:`);
        if (source && source !== targetCanonical) {
            if (confirm(`Merge all transactions from "${source}" into "${targetCanonical}"? This creates an alias rule.`)) {
                dispatch({ type: 'REGISTRY/MERGE_CANONICAL', payload: { oldCanonical: source, newCanonical: targetCanonical } });
            }
        }
    };

    const renderTable = (data: any[], type: string) => {
        const filtered = data.filter(d => {
            const name = d.vendor_name_canonical || d.client_name_canonical || d.employee_name_canonical;
            return name.toLowerCase().includes(searchTerm.toLowerCase());
        });

        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                            <th className="p-4">Name</th>
                            <th className="p-4 text-right">Count</th>
                            <th className="p-4 text-right">Total</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.map((row, i) => {
                            const name = row.vendor_name_canonical || row.client_name_canonical || row.employee_name_canonical;
                            const total = row.total_spend || row.total_received || row.total_paid;
                            const count = row.txn_count;
                            return (
                                <tr key={i} className="hover:bg-slate-50 group">
                                    <td className="p-4 font-mono font-bold text-slate-700">{name}</td>
                                    <td className="p-4 text-right">{count}</td>
                                    <td className="p-4 text-right font-mono">{total.toLocaleString()}</td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleAddAlias(name)} className="p-1 hover:bg-blue-50 text-blue-600 rounded" title="Add Alias">
                                                <Edit2 size={14} />
                                            </button>
                                            <button onClick={() => handleMerge(name)} className="p-1 hover:bg-purple-50 text-purple-600 rounded" title="Merge Another Into This">
                                                <Merge size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {filtered.length === 0 && <div className="p-8 text-center text-slate-400">No entities found.</div>}
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Users className="text-blue-600" /> Entity Registries
                </h2>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                        type="text" 
                        placeholder="Search entities..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 pr-4 py-2 text-sm border border-slate-300 rounded-lg w-64 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                </div>
            </div>

            <div className="flex gap-2 border-b border-slate-200">
                <button onClick={() => setActiveTab('VENDORS')} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'VENDORS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>
                    <Building size={16}/> Company Vendors
                </button>
                <button onClick={() => setActiveTab('MERCHANTS')} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'MERCHANTS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>
                    <ShoppingBag size={16}/> Personal Merchants
                </button>
                <button onClick={() => setActiveTab('CLIENTS')} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'CLIENTS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>
                    <Briefcase size={16}/> Clients
                </button>
                <button onClick={() => setActiveTab('EMPLOYEES')} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'EMPLOYEES' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>
                    <Users size={16}/> Employees
                </button>
            </div>

            {activeTab === 'VENDORS' && renderTable(registries.company_vendors, 'VENDOR')}
            {activeTab === 'MERCHANTS' && renderTable(registries.personal_merchants, 'MERCHANT')}
            {activeTab === 'CLIENTS' && renderTable(registries.clients, 'CLIENT')}
            {activeTab === 'EMPLOYEES' && renderTable(registries.employees, 'EMPLOYEE')}
        </div>
    );
};

export default Registries;
