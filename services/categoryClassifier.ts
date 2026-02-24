
import { Transaction, Instrument, TransactionNature, Scope, Flow } from '../types';
import { normalizeMerchantSuffix } from './utils';

// --- CONFIG: MAPPINGS & VENDOR LISTS ---

const CATEGORY_MAPPINGS: Record<TransactionNature, {
    Company: string;
    Personal: string;
    fallback?: string;
    flags?: string[];
}> = {
    'NATURE_IT_INFRA_SAAS': {
        Company: 'IT_INFRASTRUCTURE',
        Personal: 'PERSONAL_SUBSCRIPTIONS'
    },
    'NATURE_LOCAL_TRAVEL': {
        Company: 'TRAVEL_LOCAL',
        Personal: 'PERSONAL_LOCAL_RIDES'
    },
    'NATURE_TRAVEL_BOOKING': {
        Company: 'TRAVEL_INTERCITY',
        Personal: 'PERSONAL_INTERCITY_TRAVEL'
    },
    'NATURE_FOOD_DINING': {
        Company: 'MEALS_CLIENTS_TEAM',
        Personal: 'PERSONAL_DINING_CAFES'
    },
    'NATURE_PERSONAL_SHOPPING': {
        Company: 'OTHER_COMPANY_EXPENSE', // Conservative fallback
        Personal: 'PERSONAL_SHOPPING_GENERAL',
        flags: ['needs_review']
    },
    'NATURE_OFFICE_SUPPLIES': {
        Company: 'OFFICE_SUPPLIES',
        Personal: 'PERSONAL_SHOPPING_ECOMMERCE'
    },
    'NATURE_MEDICAL': {
        Company: 'STAFF_WELFARE',
        Personal: 'PERSONAL_MEDICAL_HEALTHCARE'
    },
    'NATURE_BANK_CHARGE': {
        Company: 'BANK_CHARGES',
        Personal: 'PERSONAL_OTHER'
    },
    'NATURE_CASH_WITHDRAWAL': {
        Company: 'OTHER_COMPANY_EXPENSE',
        Personal: 'PERSONAL_CASH_WITHDRAWAL',
        flags: ['needs_review']
    },
    'NATURE_LOAN_REPAYMENT': {
        Company: 'OTHER_COMPANY_EXPENSE',
        Personal: 'PERSONAL_LOAN_EMI',
        flags: ['needs_review']
    },
    'NATURE_CC_BILL_SETTLEMENT': {
        Company: 'CC_BILL_PAYMENT',
        Personal: 'PERSONAL_TRANSFER'
    },
    'NATURE_INTERNAL_TRANSFER': {
        Company: 'INTERNAL_ADJUSTMENT',
        Personal: 'PERSONAL_TRANSFER'
    },
    'NATURE_DIRECTOR_LOAN_FLOW': {
        Company: 'DIRECTOR_PAYMENT',
        Personal: 'PERSONAL_TRANSFER'
    },
    'REVERSAL_CHARGEBACK': {
        Company: 'REFUND_REVERSAL',
        Personal: 'PERSONAL_TRANSFER'
    },
    'OPERATING_EXPENSE': {
        Company: 'OTHER_COMPANY_EXPENSE',
        Personal: 'PERSONAL_OTHER',
        flags: ['needs_review']
    },
    'OPERATING_INCOME': {
        Company: 'OTHER_INCOME',
        Personal: 'PERSONAL_TRANSFER',
        flags: ['needs_review']
    },
    'TRANSFER_DIRECTOR': {
        Company: 'DIRECTOR_PAYMENT',
        Personal: 'PERSONAL_TRANSFER'
    },
    'TRANSFER_INTERNAL': {
        Company: 'INTERNAL_ADJUSTMENT',
        Personal: 'PERSONAL_TRANSFER'
    },
    'SETTLEMENT_CC_BILL': {
        Company: 'CC_BILL_PAYMENT',
        Personal: 'PERSONAL_TRANSFER'
    },
    'SETTLEMENT_LOAN_EMI': {
        Company: 'OTHER_COMPANY_EXPENSE',
        Personal: 'PERSONAL_LOAN_EMI'
    },
    'CASH_WITHDRAWAL': {
        Company: 'OTHER_COMPANY_EXPENSE',
        Personal: 'PERSONAL_CASH_WITHDRAWAL'
    },
    'CASH_DEPOSIT': {
        Company: 'OTHER_INCOME',
        Personal: 'PERSONAL_TRANSFER'
    },
    'BANK_CHARGES_TAX': {
        Company: 'BANK_CHARGES',
        Personal: 'PERSONAL_OTHER'
    },
    'UNKNOWN_NEEDS_REVIEW': {
        Company: 'UNCATEGORIZED',
        Personal: 'UNCATEGORIZED'
    },
    'NATURE_UNKNOWN': {
        Company: 'UNCATEGORIZED',
        Personal: 'UNCATEGORIZED'
    }
};

const VENDOR_CANONICALS: Record<string, string> = {
    'GOOGLE': 'GOOGLE',
    'DIGITALOCEAN': 'DIGITALOCEAN',
    'DATAFORSEO': 'DATAFORSEO',
    'BIGROCK': 'BIGROCK',
    'APPLE': 'APPLE',
    'ICLOUD': 'APPLE',
    'AWS': 'AWS',
    'AMAZON': 'AMAZON',
    'ADYAR MEGA DIGITAL': 'ADYAR MEGA DIGITAL',
    'AMAZON WEB SERVICES': 'AWS',
    'UBER': 'UBER',
    'OLA': 'OLA',
    'RAPIDO': 'RAPIDO',
    'ZUDIO': 'ZUDIO',
    'WESTSIDE': 'WESTSIDE',
    'H&M': 'H&M',
    'TRENT': 'TRENT',
    'SWIGGY': 'SWIGGY',
    'ZOMATO': 'ZOMATO',
    'STARBUCKS': 'STARBUCKS',
    'MAKEMYTRIP': 'MAKEMYTRIP',
    'MMT': 'MAKEMYTRIP',
    'BAJAJ FINANCE': 'BAJAJ FINANCE',
    'HERO FINCORP': 'HERO FINCORP',
    'PASTEUR': 'PASTEUR HEALTHCARE'
};

// --- HELPERS ---

const getScopeFromInstrument = (type: string): Scope => {
    const t = type.toUpperCase();
    if (t.includes('COMPANY') || t.includes('CA_') || t.includes('CORPORATE')) return 'Company';
    return 'Personal'; // Default safe fallback
};

const getFlowFromDirection = (dir: 'DEBIT' | 'CREDIT'): Flow => {
    return dir === 'CREDIT' ? 'Income' : 'Expense';
};

const resolveCanonicalVendor = (desc: string): string | null => {
    for (const [key, canonical] of Object.entries(VENDOR_CANONICALS)) {
        if (desc.includes(key)) return canonical;
    }
    return null;
};

// --- MAIN SUGGESTION ENGINE V1 ---

export const computeDeterministicSuggestionV1 = (
    txn: Partial<Transaction>, 
    instrument: Instrument
): Partial<Transaction> => {
    
    // 1. Safety Gate: Only for Unclassified/Partial without overrides
    if (txn.manualOverride) return {}; 
    if (txn.categoryCode && txn.categoryCode !== 'UNCATEGORIZED') return {}; // Already classified

    const nature = txn.nature_v1 || 'NATURE_UNKNOWN';
    const rawDesc = txn.description || txn.descriptionRaw || '';
    
    // 2. Normalization (Suffix Strip)
    const descClean = normalizeMerchantSuffix(rawDesc).toUpperCase()
        .replace(/[\*\/_\-]/g, ' ') 
        .replace(/\s+/g, ' ')
        .trim();

    // 3. Scope / Flow Inference
    const scope = getScopeFromInstrument(instrument.instrumentType);
    const flow = getFlowFromDirection(txn.direction || 'DEBIT');

    // 4. Category Mapping
    const mapping = CATEGORY_MAPPINGS[nature] || CATEGORY_MAPPINGS['NATURE_UNKNOWN'];
    let category = mapping[scope] || 'UNCATEGORIZED';
    const reasonParts = [`nature_v1=${nature}`];
    let confidence = (txn.nature_confidence_v1 || 0.5);

    // Special Guard: Personal Shopping on Company
    if (nature === 'NATURE_PERSONAL_SHOPPING' && scope === 'Company') {
        category = 'OTHER_COMPANY_EXPENSE';
        reasonParts.push('Guard: Personal Retail on Company Instrument');
        confidence = 0.7; // Lower confidence
    }

    // Special Guard: Cash on Company
    if (nature === 'NATURE_CASH_WITHDRAWAL' && scope === 'Company') {
        reasonParts.push('Guard: Cash Withdrawal on Company');
    }

    // 5. Vendor Canonical Match
    const canonical = resolveCanonicalVendor(descClean);
    if (canonical) {
        reasonParts.push(`vendor=${canonical} exact`);
        confidence = Math.min(0.95, confidence + 0.10);
    } else {
        reasonParts.push('map->' + scope + '.' + category);
    }

    // 6. Flags
    if (mapping.flags) {
        reasonParts.push(`Flags: ${mapping.flags.join(',')}`);
    }

    // Cap Confidence
    if (category === 'OTHER_COMPANY_EXPENSE' || category === 'UNCATEGORIZED') {
        confidence = Math.min(0.70, confidence);
    } else {
        confidence = Math.min(0.95, confidence);
    }

    return {
        suggested_scope_v1: scope,
        suggested_flow_v1: flow,
        suggested_category_v1: category,
        suggested_entity_canonical_v1: canonical || undefined,
        suggested_confidence_v1: confidence,
        suggested_reason_v1: reasonParts.join('; '),
        suggested_version_v1: "v1",
        suggested_source_v1: "deterministic"
    };
};

export const classifyCategoryV2 = (txn: Partial<Transaction>): Partial<Transaction> => {
    return {}; 
};
