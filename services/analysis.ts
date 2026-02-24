
import { Transaction, AppState, FinancialReport, EnrichmentRegistries, VendorEntry, ClientEntry, EmployeeEntry, IncomeRegisterEntry } from '../types';
import { getEffectiveTransaction } from './utils';

const EMPLOYEES_HARDCODED = [
    'HRIDAM', 'NIKHIL', 'GOPIKA', 'SABRI', 'NARMADA', 'TALIB', 'RIYA', 'MAHIKA', 'JOSHUA', 'KARTHI', 'NAYAN', 'SHUBASHINI'
];

// IDENTITY MAP (ADDENDUM I)
const DIRECTOR_IDENTIFIERS = ['VENKATRAMAN', 'SHANKARNARYAN', 'VENKAT', 'V SHANKARNARYAN'];
const SPOUSE_IDENTIFIERS = ['NEELAM LAL', 'NEELAMLAL', 'NEELAM'];

// Helper to check identity
const isDirector = (str: string) => DIRECTOR_IDENTIFIERS.some(id => str.toUpperCase().includes(id));
const isSpouse = (str: string) => SPOUSE_IDENTIFIERS.some(id => str.toUpperCase().includes(id));

export const resolveCanonical = (rawName: string, aliasMap: Record<string, string>): string => {
    if (!rawName) return 'Unknown';
    const upper = rawName.toUpperCase().trim();
    // 1. Direct Alias Map check
    if (aliasMap[upper]) return aliasMap[upper];
    
    // 2. Partial match check (expensive but useful)
    for (const [key, val] of Object.entries(aliasMap)) {
        if (upper.includes(key)) return val;
    }
    
    // 3. Employee Check
    for (const emp of EMPLOYEES_HARDCODED) {
        if (upper.includes(emp)) return emp;
    }

    return upper; // Default to normalized raw
};

export const isAnalyticsReady = (t: Transaction, options?: { includeDrafts: boolean }): boolean => {
    // 1. Status Check
    if (t.status === 'excluded') return false;
    
    if (!options?.includeDrafts) {
        if (t.status === 'draft') return false;
    }
    
    // 2. Amount > 0
    if (t.amount <= 0) return false;

    // 3. Valid Date
    if (!t.txnDate) return false;

    // 4. Valid Direction
    if (t.direction !== 'DEBIT' && t.direction !== 'CREDIT') return false;

    // 5. Description Sanity
    if (!t.description || t.description.length < 3 || t.description === 'UNDEFINED') return false;

    return true;
};

export const runAnalysis = (state: AppState): FinancialReport => {
    const period = state.context.selectedMonth;
    const txns = state.transactions.byMonth[period]?.map(id => state.transactions.byId[id]).filter(Boolean) || [];
    const aliasMap = state.registry.aliasMap;
    const includeDrafts = state.ui.ledgerView.filter.includeDraftsInAnalytics;
    
    // Convert to Effective Transactions
    const effectiveTxns = txns.map(t => getEffectiveTransaction(t));

    // Filter Ready Rows using global flag
    const readyTxns = effectiveTxns.filter(t => isAnalyticsReady(t, { includeDrafts }));

    // Initialize Report
    const report: FinancialReport = {
        generatedAt: Date.now(),
        period,
        coreHealth: {
            netCashFlow: 0,
            companyExpenses: 0,
            companyRevenue: 0,
            operatingMarginPercent: 0,
            top5ClientsContributionPercent: 0
        },
        controlLeakage: {
            unclassifiedSpendPercent: 0,
            personalOnCompanyPercent: 0,
            directorReimbursementTotal: 0,
            bankChargesTotal: 0,
            bankChargesCount: 0
        },
        toolsSubscriptions: {
            mcoSaasSpend: 0,
            itInfraSpend: 0,
            telInternetSpend: 0,
            subscriptionConcentrationPercent: 0
        },
        paymentsRisk: {
            ccSettlementTotal: 0,
            bnplDependencyPercent: 0,
            outstandingReimbursement: 0
        },
        personal: {
            outflowTotal: 0,
            inflowTotal: 0,
            netCashflow: 0,
            personalSpendOnCompanyCC: 0,
            transfersTotal: 0,
            transfersCount: 0
        },
        pnl: {
            revenue: { clientReceipt: 0, otherIncome: 0, refundReversal: 0, total: 0 },
            expenses: {},
            totalExpense: 0,
            netProfit: 0
        },
        directorIntelligence: {
            directorSalaryTotal: 0,
            directorDrawTotal: 0,
            spousePaymentsTotal: 0,
            personalSpendOnCompanyTotal: 0,
            netOutflowFromCompany: 0
        },
        salaryTotal: 0,
        topClients: []
    };

    // Client Revenue Map for Top 5
    const clientRevenueMap: Record<string, number> = {};

    let totalOutflow = 0; // All instruments
    let totalInflow = 0; // All instruments

    readyTxns.forEach(t => {
        // Resolve Canonical Name on the fly for aggregation
        const resolvedName = resolveCanonical(t.vendorName || t.clientName || t.description, aliasMap);

        // Global Cash Flow (All instruments, Ready only)
        if (t.direction === 'CREDIT') totalInflow += t.amount;
        else totalOutflow += t.amount;

        // Context Helpers
        const isCompanyContext = 
            t.transactionNature === 'COMPANY_TXN_FROM_COMPANY_INSTRUMENT' || 
            t.transactionNature === 'COMPANY_TXN_FROM_PERSONAL_INSTRUMENT' ||
            (t.instrumentId.includes('_company') || t.instrumentId.includes('_corporate')); // Fallback

        const isPersonalContext = !isCompanyContext;

        const cat = t.categoryCode || 'UNCATEGORIZED';
        const descUpper = t.description.toUpperCase();
        
        // Director / Spouse Identity Check
        const isDirectorEntity = isDirector(descUpper) || isDirector(t.vendorName || '') || t.counterpartyId === 'DIRECTOR';
        const isSpouseEntity = isSpouse(descUpper);

        // --- COMPANY LOGIC ---
        if (isCompanyContext) {
            // DIRECTOR INTELLIGENCE
            if (t.direction === 'DEBIT') {
                if (cat === 'EMPLOYEE_SALARY' && isDirectorEntity) {
                    report.directorIntelligence.directorSalaryTotal += t.amount;
                }
                if (cat === 'DIRECTOR_PAYMENT' || cat === 'DIRECTOR_REIMBURSEMENT') {
                    report.directorIntelligence.directorDrawTotal += t.amount;
                }
                if (isSpouseEntity) {
                    report.directorIntelligence.spousePaymentsTotal += t.amount;
                }
                if (t.transactionNature === 'PERSONAL_TXN_FROM_COMPANY_INSTRUMENT') {
                    report.directorIntelligence.personalSpendOnCompanyTotal += t.amount;
                }
            }

            // P&L EXPENSES
            if (t.direction === 'DEBIT' && cat !== 'COMPANY_TRANSFER' && cat !== 'INTERNAL_ADJUSTMENT') {
                
                // Exclude pure transfers or personal on company (unless reimbursement)
                // Director Reimbursement is EXPENSE per rules
                if (cat === 'DIRECTOR_REIMBURSEMENT') {
                    report.controlLeakage.directorReimbursementTotal += t.amount;
                    report.pnl.expenses[cat] = (report.pnl.expenses[cat] || 0) + t.amount;
                } 
                else if (t.transactionNature === 'PERSONAL_TXN_FROM_COMPANY_INSTRUMENT') {
                    // Personal Spend on Company CC -> Not P&L Expense, but is "Personal on Company"
                    report.personal.personalSpendOnCompanyCC += t.amount;
                }
                else {
                    // Standard Company Expense
                    report.pnl.expenses[cat] = (report.pnl.expenses[cat] || 0) + t.amount;

                    // KPI Aggregations - MCO
                    if (['SAAS_MCO_MARKETING_CREATIVE', 'MARKETING_AD_SPEND'].includes(cat)) {
                        report.toolsSubscriptions.mcoSaasSpend += t.amount;
                    }
                    
                    // KPI Aggregations - IT
                    if (['IT_INFRASTRUCTURE', 'SOFTWARE_SUBSCRIPTIONS'].includes(cat)) {
                        report.toolsSubscriptions.itInfraSpend += t.amount;
                    }
                    
                    if (cat === 'TELCO_INTERNET') report.toolsSubscriptions.telInternetSpend += t.amount;
                    
                    if (['EMPLOYEE_SALARY', 'EMPLOYEE_SALARY_ADVANCE', 'OFFICE_HELP_SALARY'].includes(cat)) {
                        report.salaryTotal = (report.salaryTotal || 0) + t.amount;
                    }
                    
                    if (cat === 'BANK_CHARGES') {
                        report.controlLeakage.bankChargesTotal += t.amount;
                        report.controlLeakage.bankChargesCount++;
                    }
                    
                    if (cat === 'CC_BILL_PAYMENT' || cat === 'BNPL_SETTLEMENT') report.paymentsRisk.ccSettlementTotal += t.amount;
                }
            }

            // P&L REVENUE
            if (t.direction === 'CREDIT' && cat !== 'COMPANY_TRANSFER') {
                if (cat === 'CLIENT_RECEIPT') {
                    report.pnl.revenue.clientReceipt += t.amount;
                    clientRevenueMap[resolvedName] = (clientRevenueMap[resolvedName] || 0) + t.amount;
                } else if (cat === 'REFUND_REVERSAL') {
                    report.pnl.revenue.refundReversal += t.amount; 
                } else if (cat === 'OTHER_INCOME') {
                    report.pnl.revenue.otherIncome += t.amount;
                }
            }
        }

        // --- PERSONAL LOGIC ---
        if (isPersonalContext) {
            if (t.direction === 'DEBIT') {
                report.personal.outflowTotal += t.amount;
                if (cat === 'PERSONAL_TRANSFER') {
                    report.personal.transfersTotal += t.amount;
                    report.personal.transfersCount++;
                }
            } else {
                report.personal.inflowTotal += t.amount;
            }
        }
    });

    // --- Final Calculations ---
    report.coreHealth.netCashFlow = totalInflow - totalOutflow;
    report.pnl.totalExpense = Object.values(report.pnl.expenses).reduce((a, b) => a + b, 0);
    report.coreHealth.companyExpenses = report.pnl.totalExpense;
    report.pnl.revenue.total = report.pnl.revenue.clientReceipt + report.pnl.revenue.otherIncome - Math.abs(report.pnl.revenue.refundReversal);
    report.coreHealth.companyRevenue = report.pnl.revenue.total;

    if (report.coreHealth.companyRevenue > 0) {
        report.coreHealth.operatingMarginPercent = Math.round(((report.coreHealth.companyRevenue - report.coreHealth.companyExpenses) / report.coreHealth.companyRevenue) * 100);
    }

    // Top Clients
    const sortedClients = Object.entries(clientRevenueMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const top3Total = sortedClients.reduce((acc, [, val]) => acc + val, 0);
    report.topClients = sortedClients.map(([name, amount]) => ({ name, amount }));
    
    if (report.pnl.revenue.clientReceipt > 0) {
        report.coreHealth.top5ClientsContributionPercent = Math.round((top3Total / report.pnl.revenue.clientReceipt) * 100);
    }

    const uncat = report.pnl.expenses['UNCATEGORIZED'] || 0;
    if (report.coreHealth.companyExpenses > 0) {
        report.controlLeakage.unclassifiedSpendPercent = Math.round((uncat / report.coreHealth.companyExpenses) * 100);
    }

    const personalOnCompSum = report.personal.personalSpendOnCompanyCC;
    if (report.coreHealth.companyExpenses > 0) {
        report.controlLeakage.personalOnCompanyPercent = Math.round((personalOnCompSum / report.coreHealth.companyExpenses) * 100);
    }

    const subTotal = report.toolsSubscriptions.mcoSaasSpend + report.toolsSubscriptions.itInfraSpend + report.toolsSubscriptions.telInternetSpend;
    if (report.coreHealth.companyExpenses > 0) {
        report.toolsSubscriptions.subscriptionConcentrationPercent = Math.round((subTotal / report.coreHealth.companyExpenses) * 100);
    }

    const bnplSpend = readyTxns
        .filter(t => t.direction === 'DEBIT' && (t.instrumentId.includes('bnpl') || t.categoryCode?.includes('BNPL')))
        .reduce((acc, t) => acc + t.amount, 0);
    if (totalOutflow > 0) {
        report.paymentsRisk.bnplDependencyPercent = Math.round((bnplSpend / totalOutflow) * 100);
    }

    report.personal.netCashflow = report.personal.inflowTotal - report.personal.outflowTotal;
    report.pnl.netProfit = report.pnl.revenue.total - report.pnl.totalExpense;

    report.directorIntelligence.netOutflowFromCompany = 
        report.directorIntelligence.directorSalaryTotal + 
        report.directorIntelligence.directorDrawTotal + 
        report.directorIntelligence.personalSpendOnCompanyTotal;

    return report;
};

export const buildRegistries = (state: AppState): EnrichmentRegistries => {
    const txns = state.transactions.allIds.map(id => state.transactions.byId[id]);
    const aliasMap = state.registry.aliasMap;

    const companyVendors: Record<string, VendorEntry> = {};
    const clients: Record<string, ClientEntry> = {};
    const employees: Record<string, EmployeeEntry> = {};
    const personalMerchants: Record<string, VendorEntry> = {};

    const includeDrafts = state.ui.ledgerView.filter.includeDraftsInAnalytics;

    txns
        .map(t => getEffectiveTransaction(t))
        .filter(t => isAnalyticsReady(t, { includeDrafts }))
        .forEach(t => {
            const canonical = resolveCanonical(t.vendorName || t.clientName || t.description, aliasMap);
            
            // Employee?
            if (EMPLOYEES_HARDCODED.includes(canonical)) {
                if (!employees[canonical]) employees[canonical] = { employee_name_canonical: canonical, total_paid: 0, txn_count: 0 };
                if (t.direction === 'DEBIT') {
                    employees[canonical].total_paid += t.amount;
                    employees[canonical].txn_count++;
                }
                return;
            }

            // Client?
            if (t.categoryCode === 'CLIENT_RECEIPT' || t.counterpartyType === 'Client') {
                if (!clients[canonical]) clients[canonical] = { client_name_canonical: canonical, total_received: 0, txn_count: 0 };
                clients[canonical].total_received += t.amount;
                clients[canonical].txn_count++;
                return;
            }

            // Vendor or Merchant?
            if (t.direction === 'DEBIT') {
                const isPersonal = t.transactionNature?.includes('PERSONAL') || t.categoryCode?.startsWith('PERSONAL_');
                if (isPersonal) {
                    if (!personalMerchants[canonical]) personalMerchants[canonical] = { vendor_name_canonical: canonical, total_spend: 0, txn_count: 0, category_distribution: {} };
                    personalMerchants[canonical].total_spend += t.amount;
                    personalMerchants[canonical].txn_count++;
                    const cat = t.categoryCode || 'UNCAT';
                    personalMerchants[canonical].category_distribution![cat] = (personalMerchants[canonical].category_distribution![cat] || 0) + t.amount;
                } else {
                    if (!companyVendors[canonical]) companyVendors[canonical] = { vendor_name_canonical: canonical, total_spend: 0, txn_count: 0, category_distribution: {} };
                    companyVendors[canonical].total_spend += t.amount;
                    companyVendors[canonical].txn_count++;
                    const cat = t.categoryCode || 'UNCAT';
                    companyVendors[canonical].category_distribution![cat] = (companyVendors[canonical].category_distribution![cat] || 0) + t.amount;
                }
            }
        });

    return {
        company_vendors: Object.values(companyVendors).sort((a,b) => b.total_spend - a.total_spend),
        personal_merchants: Object.values(personalMerchants).sort((a,b) => b.total_spend - a.total_spend),
        employees: Object.values(employees).sort((a,b) => b.total_paid - a.total_paid),
        clients: Object.values(clients).sort((a,b) => b.total_received - a.total_received),
        income_register: [] // Legacy
    };
};
