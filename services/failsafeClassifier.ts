
import { Transaction, Instrument, FailsafeSuggestion, FailsafeResult, Scope, Flow, EntityTypeOverride } from '../types';
import { 
    CATEGORIES_COMPANY_EXPENSE, 
    CATEGORIES_COMPANY_INCOME, 
    CATEGORIES_PERSONAL_EXPENSE, 
    CATEGORIES_PERSONAL_INCOME 
} from './taxonomy';
import { normalizeMerchantSuffix } from './utils';

// --- CONSTANTS & LISTS ---

const CLIENT_CANONICALS = [
    'SYNUP', 'CHANGES ADVERTISING', 'IMERSIVE', 'RSPL', 'ISB', 'KALPAVRIKSHA', 
    'SHANKARA BUILDPRO', 'APCER', 'IIT BOMBAY', 'BLUSTREAM'
];

const EMPLOYEES = [
    'HRIDAM', 'NIKHIL', 'GOPIKA', 'SABARI', 'SABARI HARI VASAN C', 'NARMADA', 
    'TALIB', 'RIYA', 'MAHIKA', 'JOSHUA', 'KARTHI', 'NAYAN', 'SHUBASHINI'
];

const IT_VENDORS = [
    'WPMU DEV', 'HOSTINGER', 'CLOUDNOW', 'DIGITAL OCEAN', 'GOOGLE CLOUD', 
    'CLOUDFLARE', 'AWS', 'AMAZON WEB SERVICES', 'GODADDY', 'NAMECHEAP'
];

const MCO_VENDORS = [
    'LINKEDIN', 'OPENAI', 'CHATGPT', 'FIREFLIES', 'ADOBE', 'CANVA', 'SLACK', 
    'ZOOM', 'ELEVENLABS', 'HEYGEN', 'MAILCHIMP', 'ICLOUD', 'GOOGLE ONE', 
    'PLAY PASS', 'LINKTREE', 'META VERIFIED', 'FIGMA', 'PREQUEL', 'TOON APP', 'MIDJOURNEY'
];

const TELCO_VENDORS = [
    'VI', 'VODAFONE', 'IDEA', 'JIO', 'AIRTEL', 'BROADBAND', 'ACT FIBERNET', 'BSNL'
];

const FOOD_DELIVERY = ['SWIGGY', 'ZOMATO', 'ZEPTO', 'BLINKIT', 'BIGBASKET', 'DUNZO'];
const CAFE_DINING = ['CAFE', 'BAKERY', 'RESTAURANT', 'BARISTA', 'STARBUCKS', 'HOTEL', 'DINER', 'MCDONALDS', 'KFC', 'PIZZA HUT', 'DOMINOS', 'BURGER KING'];
const FUEL_TOKENS = ['FUEL', 'PETROL', 'DIESEL', 'HPCL', 'IOCL', 'BPCL', 'INDIAN OIL', 'SHELL'];
const REPAIR_TOKENS = ['SERVICE', 'WORKSHOP', 'GARAGE', 'TYRE', 'BATTERY', 'SPARES', 'CAR CARE', 'AUTO'];
const UTILITIES_TOKENS = ['ELECTRICITY', 'TNEB', 'BESCOM', 'MSEB', 'EB BILL', 'UTILITY', 'WATER', 'GAS', 'BWSSB', 'METRO WATER'];
const RENT_TOKENS = ['RENT', 'PETALSRENT', 'RENTOMOJO', 'NOBROKER'];
const BANK_CHARGE_TOKENS = ['CHARGE', 'BANK CHARGES', 'LATE FEE', 'PENALTY', 'ECS RETURN', 'INSUFF', 'GST @', 'IGST', 'NEFT RETURN', 'RETURN', 'BOUNCE', 'ANNUAL FEE'];
const LOAN_TOKENS = ['HERO FINCORP', 'HEROFINCORP', 'HFCL', 'BAJAJ FINANCE', 'EMI'];

const DIRECTORS = ['VENKATRAMAN', 'VENKAT', 'SHANKARNARYAN', 'SVIJAY19'];
const SPOUSE = ['NEELAM', 'NEELAM LAL'];
const HELP = ['MUKTI', 'MUKTIKANTA', 'MUKTHI'];

// --- HELPERS ---

const normalizeText = (s: string): string => {
    if (!s) return '';
    const suffixCleaned = normalizeMerchantSuffix(s);
    return suffixCleaned.toUpperCase()
        .replace(/[^A-Z0-9@/\s]/g, '') // Keep @ and /
        .replace(/\s+/g, ' ')
        .trim();
};

const getInstrumentScope = (t: Transaction, instruments: Record<string, Instrument>): Scope => {
    const inst = instruments[t.instrumentId];
    if (!inst) return 'Company'; // Default safe
    const type = inst.instrumentType.toUpperCase();
    if (type.includes('COMPANY') || type.includes('CA_')) return 'Company';
    if (type.includes('PERSONAL') || type.includes('SB_') || type.includes('CC_PERSONAL')) return 'Personal';
    
    // Name fallback
    const name = inst.name.toUpperCase();
    if (name.includes('ICICI CA') || name.includes('AXIS CA')) return 'Company';
    if (name.includes('ICICI SB') || name.includes('AXIS SB')) return 'Personal';
    
    return 'Company';
};

const containsAny = (text: string, tokens: string[]): string | null => {
    for (const token of tokens) {
        if (text.includes(token)) return token;
    }
    return null;
};

// --- CORE ENGINE ---

export const runFailsafeClassification = (
    transactions: Transaction[],
    registries: any, // Not strictly used for logic, using hardcoded lists per prompt
    aliasMap: Record<string, string>,
    instruments: Record<string, Instrument>
): FailsafeResult => {
    
    const suggestions: FailsafeSuggestion[] = [];
    const stats = { total: 0, highConfidence: 0, mediumConfidence: 0, lowConfidence: 0 };

    for (const txn of transactions) {
        // Skip if already overridden? No, the propmt says "allow bulk-apply into manualOverride".
        // We generate suggestions for ALL, user decides what to apply.
        
        const scope = getInstrumentScope(txn, instruments);
        const flow = txn.direction === 'CREDIT' ? 'Income' : 'Expense';
        const descNorm = normalizeText(txn.description);
        const rawDescNorm = normalizeText(txn.descriptionRaw); // Backup
        const combinedDesc = descNorm + ' ' + rawDescNorm;

        let categoryCode = 'UNCATEGORIZED';
        let entityType: EntityTypeOverride = 'Unknown';
        let entityName: string | null = null;
        let confidence = 0.30;
        let reason = 'Default fallback';
        const flags: string[] = [];

        // 2. ENTITY EXTRACTION & MATCHING
        
        // 2.1 Alias Map
        let aliasMatch = false;
        for (const [alias, canonical] of Object.entries(aliasMap)) {
            if (combinedDesc.includes(alias.toUpperCase())) {
                entityName = canonical;
                aliasMatch = true;
                confidence += 0.50;
                reason = `MATCH: Alias ${alias} -> ${canonical}`;
                break;
            }
        }

        // 2.2 Clients
        if (!entityName) {
            const client = CLIENT_CANONICALS.find(c => combinedDesc.includes(c));
            if (client) {
                entityName = client;
                entityType = 'Client';
                confidence += 0.40;
                reason = `MATCH: Client ${client}`;
            }
        }

        // 2.3 Employees
        if (!entityName) {
            const emp = EMPLOYEES.find(e => combinedDesc.includes(e));
            if (emp) {
                entityName = emp;
                entityType = 'Employee';
                confidence += 0.40;
                reason = `MATCH: Employee ${emp}`;
            }
        }

        // 2.4 Office Help
        if (!entityName) {
            const help = HELP.find(h => combinedDesc.includes(h));
            if (help) {
                entityName = 'MUKTI'; // Canonical
                entityType = 'Employee';
                flags.push('MUKTI_TRACK');
                confidence += 0.40;
                reason = `MATCH: Office Help ${help}`;
            }
        }

        // 2.5 Directors
        if (!entityName) {
            const dir = DIRECTORS.find(d => combinedDesc.includes(d));
            if (dir) {
                entityName = 'VENKATRAMAN';
                entityType = 'ManagementOverhead';
                flags.push('MANAGEMENT_OVERHEAD');
                confidence += 0.40;
                reason = `MATCH: Director ${dir}`;
            } else {
                const sp = SPOUSE.find(s => combinedDesc.includes(s));
                if (sp) {
                    entityName = 'NEELAM';
                    entityType = 'ManagementOverhead';
                    flags.push('MANAGEMENT_OVERHEAD');
                    confidence += 0.40;
                    reason = `MATCH: Spouse ${sp}`;
                }
            }
        }

        // 2.6 Fallback Entity Type
        if (!entityName) {
            if (scope === 'Personal') entityType = 'PersonalMerchant';
            else entityType = 'CompanyVendor';
        } else if (entityType === 'Unknown') {
             // If we found a name via Alias Map but didn't set type yet
             // Check known lists again or infer from Scope
             if (scope === 'Personal') entityType = 'PersonalMerchant';
             else entityType = 'CompanyVendor';
        }

        // 3. CATEGORY LOGIC

        // 3.1 Client Receipt
        if (entityType === 'Client' && flow === 'Income' && scope === 'Company') {
            categoryCode = 'CLIENT_RECEIPT';
            reason += ' -> Client Receipt';
        }

        // 3.2 Employee Logic
        else if (entityType === 'Employee') {
            if (entityName === 'MUKTI') {
                if (combinedDesc.includes('SALARY')) {
                    categoryCode = 'OFFICE_HELP_SALARY';
                } else {
                    categoryCode = 'OFFICE_HELP_ERRANDS';
                }
            } else {
                // Regular Employee
                if (combinedDesc.includes('SALARY') || combinedDesc.includes('PAYROLL')) categoryCode = 'EMPLOYEE_SALARY';
                else if (combinedDesc.includes('ADVANCE')) categoryCode = 'EMPLOYEE_SALARY_ADVANCE';
                else if (combinedDesc.includes('REIMB')) categoryCode = 'EMPLOYEE_REIMBURSEMENT';
                else if (scope === 'Company' && flow === 'Expense') categoryCode = 'EMPLOYEE_SALARY';
                else if (scope === 'Personal' && flow === 'Expense') {
                    categoryCode = 'PERSONAL_OTHER';
                    flags.push('PERSONAL_PAY_TO_EMPLOYEE');
                }
            }
        }

        // 3.3 Management Overhead
        else if (entityType === 'ManagementOverhead') {
            if (scope === 'Company' && flow === 'Expense') {
                if (combinedDesc.includes('REIMB') || combinedDesc.includes('REFUND') || combinedDesc.includes('EXPENSE')) {
                    categoryCode = 'DIRECTOR_REIMBURSEMENT';
                } else {
                    categoryCode = 'DIRECTOR_PAYMENT';
                }
            } else if (scope === 'Personal' && flow === 'Income') {
                // Likely salary or reimb received
                // We don't categorize Inflow on Personal usually unless it's specific
                categoryCode = 'PERSONAL_TRANSFER'; 
            }
        }

        // 3.4 Bank Charges
        else if (containsAny(combinedDesc, BANK_CHARGE_TOKENS)) {
            categoryCode = 'BANK_CHARGES';
            entityType = 'BankCharge';
            entityName = 'BANK';
            confidence += 0.25;
            reason = 'MATCH: Bank Charge Keywords';
        }

        // 3.5 Rent / Utilities
        else if (containsAny(combinedDesc, RENT_TOKENS)) {
            categoryCode = scope === 'Company' ? 'OFFICE_RENT' : 'PERSONAL_RENT';
            confidence += 0.25;
            reason = 'MATCH: Rent Keywords';
        }
        else if (containsAny(combinedDesc, UTILITIES_TOKENS)) {
            categoryCode = scope === 'Company' ? 'OFFICE_UTILITIES' : 'PERSONAL_UTILITIES';
            confidence += 0.25;
            reason = 'MATCH: Utility Keywords';
        }

        // 3.6 IT / MCO / Telco
        else if (containsAny(combinedDesc, IT_VENDORS)) {
            categoryCode = 'IT_INFRASTRUCTURE';
            confidence += 0.40;
            reason = 'MATCH: IT Vendor List';
        }
        else if (containsAny(combinedDesc, MCO_VENDORS)) {
            categoryCode = 'SAAS_MCO_MARKETING_CREATIVE';
            confidence += 0.40;
            reason = 'MATCH: MCO Vendor List';
        }
        else if (containsAny(combinedDesc, TELCO_VENDORS)) {
            categoryCode = 'TELCO_INTERNET';
            confidence += 0.40;
            reason = 'MATCH: Telco Vendor List';
        }

        // 3.7 Food / Cafe
        else if (containsAny(combinedDesc, FOOD_DELIVERY)) {
            if (scope === 'Company' && (combinedDesc.includes('OFFICE') || combinedDesc.includes('TEAM') || combinedDesc.includes('MEETING'))) {
                categoryCode = 'MEALS_CLIENTS_TEAM';
            } else {
                categoryCode = 'PERSONAL_FOOD_DELIVERY';
            }
            confidence += 0.30;
            reason = 'MATCH: Food Delivery List';
        }
        else if (containsAny(combinedDesc, CAFE_DINING)) {
            if (scope === 'Company') categoryCode = 'MEALS_CLIENTS_TEAM';
            else categoryCode = 'PERSONAL_DINING_CAFES';
            confidence += 0.25;
            reason = 'MATCH: Cafe/Dining Keywords';
        }

        // 3.8 Vehicle
        else if (containsAny(combinedDesc, FUEL_TOKENS)) {
            categoryCode = scope === 'Company' ? 'VEHICLE_FUEL' : 'PERSONAL_FUEL';
            confidence += 0.25;
            reason = 'MATCH: Fuel Keywords';
        }
        else if (containsAny(combinedDesc, REPAIR_TOKENS)) {
            categoryCode = scope === 'Company' ? 'VEHICLE_REPAIR_MAINTENANCE' : 'PERSONAL_VEHICLE_REPAIR_MAINTENANCE';
            confidence += 0.25;
            reason = 'MATCH: Vehicle Repair Keywords';
        }

        // 3.9 Loans
        else if (containsAny(combinedDesc, LOAN_TOKENS)) {
            categoryCode = 'PERSONAL_LOAN_EMI';
            confidence += 0.40;
            reason = 'MATCH: Loan/EMI Keywords';
        }

        // 3.10 Transfers
        else if (combinedDesc.includes('TRANSFER')) {
            if (scope === 'Personal' && (combinedDesc.includes('SELF') || combinedDesc.includes('OWN'))) {
                categoryCode = 'PERSONAL_TRANSFER';
                reason = 'MATCH: Personal Transfer';
            }
            else if (scope === 'Company' && flow === 'Expense') {
                categoryCode = 'COMPANY_TRANSFER'; // Default for company transfers
                reason = 'MATCH: Company Transfer';
            }
        }

        // Cap Confidence
        confidence = Math.min(confidence, 0.95);
        if (categoryCode === 'UNCATEGORIZED') confidence = 0.10;

        // Flags
        if (txn.amount === 0) flags.push('ZERO_AMOUNT');
        if (!txn.txnDate) flags.push('MISSING_DATE');
        if (confidence < 0.55) flags.push('NEEDS_REVIEW_LOW_CONFIDENCE');

        suggestions.push({
            txnId: txn.id,
            scope,
            flow,
            categoryCode,
            entityType,
            entityName,
            confidence,
            reason,
            flags
        });

        // Stats
        stats.total++;
        if (confidence >= 0.8) stats.highConfidence++;
        else if (confidence >= 0.5) stats.mediumConfidence++;
        else stats.lowConfidence++;
    }

    return { suggestions, stats };
};
