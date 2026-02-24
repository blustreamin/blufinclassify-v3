
import { Transaction, Instrument, TransactionNature } from '../types';
import { normalizeMerchantSuffix } from './utils';

// --- DEFINITIONS ---

interface NatureRule {
    id: string;
    priority: number;
    match: (desc: string, txn: Partial<Transaction>) => boolean;
    result: {
        code: TransactionNature;
        confidence: number;
        reason: string;
    };
}

// --- CONSTANTS ---

const IT_VENDORS = ['RAZBIG', 'BIGROCK', 'DATAFORSEO', 'DIGITALOCEAN', 'WPMU', 'HOSTINGER', 'NAMECHEAP', 'CLOUDFLARE', 'GODADDY', 'GITHUB', 'VERCEL', 'NETLIFY', 'ADOBE'];
const TRAVEL_LOCAL = ['UBER', 'OLA', 'RAPIDO', 'BLUSMART', 'NAMMA YATRI'];
const TRAVEL_BOOKING = ['MAKEMYTRIP', 'MMT', 'CLEARTRIP', 'IRCTC', 'INDIGO', 'AIR INDIA', 'VISTARA', 'IXIGO'];
const FOOD_DINING = ['STARBUCKS', 'TATA COFFEE', 'TRAVEL FOOD SERVICES', 'MCDONALDS', 'KFC', 'DOMINOS', 'PIZZA HUT', 'BURGER KING', 'SWIGGY', 'ZOMATO', 'ZEPTO', 'BLINKIT', 'EATS'];
const RETAIL_FASHION = ['ZUDIO', 'WESTSIDE', 'H&M', 'TRENT', 'MYNTRA', 'NYKAA', 'AJIO', 'UNIQLO', 'ZARA'];
const MEDICAL = ['PASTEUR', 'PHARMACY', 'APOLLO', '1MG', 'PHARMEASY', 'DR LAL', 'METROPOLIS'];
const LOAN_VENDORS = ['BAJAJ', 'HERO FINCORP', 'HDFC LTD', 'CAPITAL FLOAT', 'KISHT', 'NAVI', 'KREDITBEE', 'MONEYVIEW'];
const OFFICE_SUPPLY_VENDORS = ['AMAZON', 'ADYAR MEGA DIGITAL', 'OFFICE', 'STATIONERY'];

const DIRECTOR_TOKENS = ['SVIJAY19', 'VENKATRAMAN', 'VENKAT', 'SHANKARNARYAN', 'NEELAM', 'MUKTI', 'MUKTIKANTA', 'MUKTHI'];

// --- RULES ENGINE ---

const RULES: NatureRule[] = [
    // 1. Reversals (Top Priority)
    {
        id: 'REVERSAL_EXPLICIT',
        priority: 100,
        match: (d) => d.includes('REVERSAL') || d.includes('REFUND') || d.includes('CHARGEBACK') || d.includes('RETURNED'),
        result: { code: 'REVERSAL_CHARGEBACK', confidence: 0.95, reason: 'Matched Reversal keywords' }
    },

    // 2. Cash
    {
        id: 'ATM_CASH',
        priority: 90,
        match: (d) => d.includes('ATM CASH') || d.includes('ATM WDL'),
        result: { code: 'NATURE_CASH_WITHDRAWAL', confidence: 0.95, reason: 'Explicit ATM Cash' }
    },

    // 3. IT / SaaS (High Confidence Vendors)
    {
        id: 'IT_INFRA_EXPLICIT',
        priority: 80,
        match: (d) => IT_VENDORS.some(v => d.includes(v)),
        result: { code: 'NATURE_IT_INFRA_SAAS', confidence: 0.9, reason: 'Matched IT Vendor List' }
    },
    {
        id: 'GOOGLE_CLOUD',
        priority: 80,
        match: (d) => d.includes('GOOGLE') && (d.includes('CLOUD') || d.includes('GSUITE') || d.includes('WORKSPACE')),
        result: { code: 'NATURE_IT_INFRA_SAAS', confidence: 0.9, reason: 'Google Cloud/Workspace' }
    },
    {
        id: 'GOOGLE_GENERIC_GUARDED',
        priority: 75,
        match: (d) => d.includes('GOOGLE') && !d.includes('ADS') && !d.includes('ADWORDS') && !d.includes('PLAY'),
        result: { code: 'NATURE_IT_INFRA_SAAS', confidence: 0.8, reason: 'Google Generic (Guarded)' }
    },
    {
        id: 'APPLE_STORAGE',
        priority: 80,
        match: (d) => d.includes('APPLE') && (d.includes('ICLOUD') || d.includes('STORAGE') || d.includes('BILL')),
        result: { code: 'NATURE_IT_INFRA_SAAS', confidence: 0.85, reason: 'Apple Services' }
    },
    {
        id: 'AWS_CLOUD',
        priority: 80,
        match: (d) => d.includes('AWS') || d.includes('AMAZON WEB SERVICES'),
        result: { code: 'NATURE_IT_INFRA_SAAS', confidence: 0.9, reason: 'AWS' }
    },

    // 4. Travel
    {
        id: 'LOCAL_TRAVEL',
        priority: 70,
        match: (d) => TRAVEL_LOCAL.some(v => d.includes(v)),
        result: { code: 'NATURE_LOCAL_TRAVEL', confidence: 0.9, reason: 'Ride Hailing Vendor' }
    },
    {
        id: 'LOCAL_TRAVEL_UPI',
        priority: 70,
        match: (d) => d.includes('UPI') && (d.includes('AUTO') || d.includes('CAB') || d.includes('TAXI')),
        result: { code: 'NATURE_LOCAL_TRAVEL', confidence: 0.85, reason: 'UPI Local Travel Pattern' }
    },
    {
        id: 'TRAVEL_BOOKING',
        priority: 70,
        match: (d) => TRAVEL_BOOKING.some(v => d.includes(v)),
        result: { code: 'NATURE_TRAVEL_BOOKING', confidence: 0.9, reason: 'Travel Portal / Airline' }
    },

    // 5. Lifestyle / Office
    {
        id: 'FOOD_DINING',
        priority: 65,
        match: (d) => FOOD_DINING.some(v => d.includes(v)),
        result: { code: 'NATURE_FOOD_DINING', confidence: 0.85, reason: 'Food/Dining Vendor' }
    },
    {
        id: 'PERSONAL_SHOPPING',
        priority: 65,
        match: (d) => RETAIL_FASHION.some(v => d.includes(v)),
        result: { code: 'NATURE_PERSONAL_SHOPPING', confidence: 0.9, reason: 'Fashion Retail Vendor' }
    },
    {
        id: 'MEDICAL',
        priority: 65,
        match: (d) => MEDICAL.some(v => d.includes(v)),
        result: { code: 'NATURE_MEDICAL', confidence: 0.85, reason: 'Medical Vendor' }
    },
    {
        id: 'OFFICE_SUPPLIES_GENERIC',
        priority: 60, // Lower than Medical/IT
        match: (d) => OFFICE_SUPPLY_VENDORS.some(v => d.includes(v)),
        result: { code: 'NATURE_OFFICE_SUPPLIES', confidence: 0.8, reason: 'Generic Office/Retail Vendor' }
    },

    // 6. Financial
    {
        id: 'LOAN_REPAYMENT',
        priority: 85,
        match: (d, t) => (LOAN_VENDORS.some(v => d.includes(v)) || (d.includes('EMI') && !d.includes('PAY IN'))) && t.direction === 'DEBIT', 
        result: { code: 'NATURE_LOAN_REPAYMENT', confidence: 0.9, reason: 'Loan/EMI Vendor or keyword' }
    },
    {
        id: 'BANK_CHARGES',
        priority: 80,
        match: (d) => d.includes('BANK CHARGES') || d.includes('CONSOLIDATED CHARGES') || d.includes('ANNUAL FEE') || d.includes('GST @ 18'),
        result: { code: 'NATURE_BANK_CHARGE', confidence: 0.9, reason: 'Bank Charge keywords' }
    },
    {
        id: 'CC_SETTLEMENT',
        priority: 80,
        match: (d) => d.includes('CREDIT CARD PAYMENT') || d.includes('AUTODEBIT') || (d.includes('BILLPAY') && d.includes('CARD')),
        result: { code: 'NATURE_CC_BILL_SETTLEMENT', confidence: 0.85, reason: 'CC Payment Pattern' }
    },

    // 7. Internal / Director
    {
        id: 'DIRECTOR_FLOW',
        priority: 60,
        match: (d) => DIRECTOR_TOKENS.some(t => d.includes(t)),
        result: { code: 'NATURE_DIRECTOR_LOAN_FLOW', confidence: 0.8, reason: 'Matched Director Token' }
    },
    {
        id: 'INTERNAL_SELF',
        priority: 60,
        match: (d) => d.includes('SELF') || d.includes('OWN ACC') || d.includes('TRF TO'),
        result: { code: 'NATURE_INTERNAL_TRANSFER', confidence: 0.7, reason: 'Internal Transfer keywords' }
    }
];

// --- MAIN CLASSIFIER ---

export const classifyTransactionNature = (txn: Partial<Transaction>, instrument: Instrument): Partial<Transaction> => {
    // 1. Safety Check: Only compute for minimally valid transactions
    if (!txn.amount || !txn.txnDate || (!txn.description && !txn.descriptionRaw)) {
        return {
            nature_v1: 'NATURE_UNKNOWN',
            nature_confidence_v1: 0,
            nature_reason_v1: 'Data incomplete'
        };
    }

    // 2. Normalization
    const rawDesc = txn.description || txn.descriptionRaw || '';
    // Strip "Pay in EMIs" suffix strictly before matching
    const descClean = normalizeMerchantSuffix(rawDesc).toUpperCase()
        .replace(/[\*\/_\-]/g, ' ') 
        .replace(/\s+/g, ' ')
        .trim();

    // 3. Compute Scope/Flow (Helper)
    let scope: 'Company' | 'Personal' = 'Company';
    const iType = instrument.instrumentType.toUpperCase();
    if (iType.includes('PERSONAL') || iType.includes('SB_') || iType.includes('BNPL_') || iType.includes('CC_PERSONAL')) {
        scope = 'Personal';
    } else {
        scope = 'Company';
    }

    let flow: 'In' | 'Out' = 'Out';
    if (txn.direction === 'CREDIT') flow = 'In';
    else flow = 'Out';

    // 4. Rule Engine Execution
    // Sort rules by priority desc
    const sortedRules = [...RULES].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
        if (rule.match(descClean, txn)) {
            return {
                scope_v1: scope,
                flow_v1: flow,
                nature_v1: rule.result.code,
                nature_confidence_v1: rule.result.confidence,
                nature_reason_v1: rule.result.reason,
                nature_flags_v1: []
            };
        }
    }

    // 5. Fallback (Legacy Mapping for Safety)
    let legacyNature: TransactionNature = 'UNKNOWN_NEEDS_REVIEW';
    if (flow === 'In') legacyNature = 'OPERATING_INCOME';
    else legacyNature = 'OPERATING_EXPENSE';

    return {
        scope_v1: scope,
        flow_v1: flow,
        nature_v1: legacyNature,
        nature_confidence_v1: 0.5,
        nature_reason_v1: 'Default Fallback',
        nature_flags_v1: []
    };
};

export const runNatureClassifierTests = () => {
    // ... test function remains same
};
