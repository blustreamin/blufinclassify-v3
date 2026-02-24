
import { Transaction, Instrument, FailsafeSuggestion, FailsafeResult, Scope, Flow, EntityTypeOverride } from '../types';
import { normalizeMerchantSuffix } from './utils';

// ════════════════════════════════════════════════════════════════
// REGISTRIES — All known entities from strategy V3
// ════════════════════════════════════════════════════════════════

// --- CLIENTS (from Invoice sheets + bank statement patterns) ---
const CLIENT_MAP: Record<string, string[]> = {
    'AMOL KADAM': ['AMOL ANKUS', 'AMOL ANKUSH'],
    'SYNUP': ['SYNUP'],
    'RSPL GROUP': ['RSPL'],
    'JASMINE CONCRETE': ['JASMINE CONCRETE', 'JASMINE'],
    'CHANGES ADVERTISING': ['CHANGES ADV', 'MYEVENTZ'],
    'SAGITTAL PHARMA': ['SAGITTAL PHA', 'SAGITTAL'],
    'APCER LIFE SCIENCES': ['APCER LIFE', 'APCER'],
    'COVERTREE': ['COVERTREE'],
    'KALPAVRIKSHA': ['KVF KALPAV', 'KALPAVRIKSHA'],
    'ISB': ['INDIAN SCHOOL OF BUSINESS', 'ISB MOHALI'],
    'IMERSIVE': ['IMERSIVE'],
    'DOLLAR SHAVE CLUB': ['DOLLAR SHAVE'],
    'SHANKARA BUILDPRO': ['SHANKARA BUILDING', 'SHANKARA BUILDPRO'],
    'WHITE HOUSE APPARELS': ['WHITE HOUSE'],
    'GAITONDE SHOES': ['GAITONDE'],
    'PHOENIX MARKETING': ['PHOENIX MARK'],
    'PRAKRUTHI TRUST': ['PRAKRUTHI'],
    'DILON KIRBY': ['DILON KIRBY'],
    'ANVESHAN': ['ANVESHAN'],
    'OML': ['OML'],
    'IITB': ['IIT BOMBAY', 'IITB'],
    'GENEU EXTRUSIONS': ['GENEU'],
    'KAPAREVA': ['KAPAREVA'],
    'TRIVENKEM': ['TRIVENKEM'],
    'PERFUMATICS': ['PERFUMATICS'],
    'NRI WAY': ['NRI WAY'],
    'TIRRENT BOOSTER': ['TIRRENT'],
    'PAYGLOCAL': ['PAYGLOCAL'],
};

// --- EMPLOYEES (from Payroll sheets, all months) ---
const EMPLOYEES: Record<string, string[]> = {
    'HRIDAM': ['HRIDAM', 'HRIDAMKAR'],
    'NIKHIL': ['NIKHIL'],
    'GOPIKA': ['GOPIKA'],
    'SABARI': ['SABARI', 'SABRI'],
    'NARMADA': ['NARMADA'],
    'TALIB': ['TALIB'],
    'RIYA': ['RIYA'],
    'MAHIKA': ['MAHIKA'],
    'JOSHUA': ['JOSHUA'],
    'KARTHI': ['KARTHI'],
    'NAYAN': ['NAYAN'],
    'SHUBASHINI': ['SHUBASHINI'],
    'YOGALAKSHMI': ['YOGALAKSHMI', 'YOGA'],
};

// --- OFFICE SUPPORT STAFF ---
const OFFICE_SUPPORT: Record<string, string[]> = {
    'MUKTI': ['MUKTI', 'MUKTIKANTA', 'MUKTHI'],
    'VIJAYA': ['VIJAYA', 'VIJAYAMAID'],
    'SARATHY': ['SARATHY'],
    'MANJULA': ['MANJULA'],
};

// --- DIRECTORS ---
const DIRECTORS: Record<string, string[]> = {
    'VENKATRAMAN': ['VENKATRAMAN', 'VENKAT', 'VENKY', 'SVIJAY19'],
    'NEELAM': ['NEELAM', 'NEELAM LAL', 'NEELAMDLAL'],
};

// --- PARENTS ---
const PARENTS: Record<string, string[]> = {
    'SHANKARNARAYAN': ['SHANKARNARAYAN', 'SHANKARNAR', 'SHANKARNA', 'VSN1254'],
    'USHA': ['SUSHA6859', 'SUSHA'],
};

// --- VENDORS PAID PERSONALLY (Reimbursable) ---
const PERSONAL_PAID_VENDORS: Record<string, { aliases: string[]; category: string; reimbursable: boolean }> = {
    'AJITH KUMAR': { aliases: ['AJITHYOGESH', 'KARIKALAN', 'AJITH'], category: 'VENDOR_PAYMENT_COGS', reimbursable: true },
    'MONESH KUMAR': { aliases: ['MONESHKUMA', 'MONESHKUMAR'], category: 'FREELANCER_PAYMENT', reimbursable: true },
};

// --- PERSONAL LOAN (Friend - separate tracker) ---
const PERSONAL_LOAN_FRIENDS: Record<string, string[]> = {
    'MAYURESH': ['MAYURESH', 'M.MAYURESH'],
};

// --- MCO VENDORS (from IT & MCO Vendor sheet) ---
const MCO_VENDORS = [
    'LINKEDIN', 'OPENAI', 'CHATGPT', 'FIREFLIES', 'ADOBE', 'CANVA', 'SLACK',
    'ZOOM', 'ZOOMCOM', 'ELEVENLABS', 'ELEVEN LABS', 'HEYGEN', 'MAILCHIMP',
    'APPLE MED', 'APPLE STORAGE', 'ICLOUD', 'GOOGLE ONE', 'GOOGLE PLAY',
    'PLAY PASS', 'PLAYSTORE', 'LINKTREE', 'LINK TREE', 'META VERIFIED',
    'FIGMA', 'PREQUEL', 'TOON APP', 'MIDJOURNEY', 'MANYCHAT', 'SPOTIFY',
    'TAPO', 'COURSIV', 'DEEP SEARCH', 'HEARTIN', 'LIFTPRO',
    'GOOGLE INDIA DIGITAL', 'GOOGLEPLAY',
];

// --- IT VENDORS ---
const IT_VENDORS = [
    'WPMU DEV', 'WPMU', 'HOSTINGER', 'RAZHOSTINGER', 'CLOUDNOW',
    'DIGITAL OCEAN', 'DIGITALOCEAN', 'GOOGLE CLOUD', 'GOOGLE WORKSPACE', 'GOOGLEWORKSP',
    'CLOUDFLARE', 'AWS', 'AMAZON WEB', 'GODADDY', 'NAMECHEAP',
    'BIGROCK', 'RAZBIG', 'RAZSPACE', 'SPACESHIP', 'RAZCLOUDNOW',
    'ENVATO', 'ELFSIGHT', 'PADDLE', 'PADDLENET', 'ZAPIER', 'RAZKONGU',
    'EMBERLIGHT',
];

// --- TELCO ---
const TELCO_VENDORS = [
    'VODAFONE', 'VI POSTPAID', 'VI PREPAID', 'VI MOBILE',
    'IDEA', 'JIO', 'JIOPOSTPA', 'JIOMOBILI',
    'AIRTEL', 'BROADBAND', 'ACT FIBERNET', 'BSNL', 'DREAMPLUG', 'CRED.TELECOM',
];

// --- FOOD (for Staff Welfare from personal = reimbursable) ---
const FOOD_DELIVERY = ['SWIGGY', 'ZOMATO', 'ZEPTO', 'BLINKIT', 'BIGBASKET', 'DUNZO', 'SWIGGYGENIE', 'SWIGGYINSTAMAR', 'ZEPTONOW'];
const CAFE_MEETING = ['STARBUCKS', 'DOU ', 'BEACHVILLE COFFEE', 'SOROCO', 'TONIQUE'];
const CAFE_DINING_GENERAL = ['CAFE', 'BAKERY', 'RESTAURANT', 'BARISTA', 'HOTEL', 'DINER', 'MCDONALDS', 'KFC', 'PIZZA HUT', 'DOMINOS', 'BURGER KING', 'GOOD TIME BAR', 'SOUL ', 'LITTLE ITALY'];

// --- FUEL (including misleading names!) ---
const FUEL_VENDORS = ['SHELL', 'BPCL', 'HPCL', 'IOCL', 'INDIAN OIL', 'HP PETROL', 'BP PETROL', 'NAYARA', 'RELIANCE PET', 'BHARAT PET'];
const FUEL_VENDOR_ALIASES = ['SHIVAISH', 'MEENA BALA']; // Misleading names — actually fuel stations
const FUEL_KEYWORDS = ['PETROL', 'DIESEL', 'FUEL', 'FILLING', 'FILLUP'];

// --- VEHICLE SERVICE (with ICD exception) ---
const VEHICLE_SERVICE_REIMBURSABLE = ['SELVARAJ', 'SELVASX', 'GODSPEED', 'GOD SPEED', 'BALAJI MOTOR', 'AIE CAR', 'MARUTI', 'SUZUKI', 'NEXA', 'GOMECHANIC', 'GOWTHAMAN', 'THEJAMEDIASAND'];
const VEHICLE_SERVICE_PERSONAL = ['ICD TUNING', 'ICD AUTO']; // NOT reimbursable
const VEHICLE_KEYWORDS = ['CAR REPAIR', 'CAR SERVICE', 'INNOVA', 'SCROSS', 'S-CROSS', 'S CROSS', 'TYRE', 'TIRE', 'WINDSHIELD', 'DENT', 'BODY SHOP', 'SERVICING'];

// --- BNPL ---
const BNPL_REPAYMENT_PATTERNS = ['LAZYPAY', 'LAZYPAYREPAYME', 'RAZORPAYSOFTWAREPRIV-LAZYPAY', 'SIMPL', 'GETSIMPL', 'ONE SIGMA'];

// --- BANK / TRANSFERS ---
const BANK_CHARGE_TOKENS = ['CHARGE', 'BANK CHARGES', 'LATE FEE', 'PENALTY', 'ECS RETURN', 'INSUFF', 'GST @', 'NEFT RETURN', 'BOUNCE', 'ANNUAL FEE'];
const OD_INTEREST_TOKENS = ['INT.COLL', 'INTEREST COLL', 'OD INTEREST', 'SB::INT.PD'];
const OD_TRANSFER_TOKENS = ['BLUSTREAMMARKETINGS', 'BLUSTREAM MARKETING', 'BLUSTREAMMARKET'];
const GST_PAYMENT_TOKENS = ['TAXOLOGISTS', 'GST PAYMENT', 'GST PAY'];
const RENT_TOKENS = ['PETALSRENT', 'PETALS RENT', 'RENT MAINTENANC'];
const ELECTRICITY_TOKENS = ['ELECTRICITY', 'TNEB', 'TAMIL NADU/ELECTRICITY', 'TAMILNADU'];
const LOAN_EMI_TOKENS = ['HERO FINCORP', 'HEROFINCORP', 'HFCL', 'BAJAJ FINANCE', 'EMI'];
const INVESTMENT_TOKENS = ['MUTUAL FUND', 'BSE STAR', 'BSESTARMF', 'INDIAN CLEARING CORP'];
const CC_BILL_TOKENS = [
    'CC BILL', 'CCBILL', 'CC/5474', 'CCPAYMENT', 'CC BILLPAY', 'AUTO DEBIT CC',
    'CREDIT CARD', 'PAVC',  // ICICI "Pay any Visa credit card"
    'VENKYICICI',  // Alias for CC payment from CA to SB
];
// Patterns that look like CC bill but need the CC-specific sub-pattern
const CC_BILL_BIL_PATTERN = /BIL\/\d+\/CC\//i;  // BIL/000996848831/Cc/547467...
const FACEBOOK_ADS = ['FACEBOOK', 'WWW FACEBOOK COM', 'META ADS'];
const GOOGLE_ADS = ['GOOGLE ADS'];
const UBER_TOKENS = ['UBER', 'UBERINDIA', 'UBERRIDE'];
const TRAVEL_TOKENS = ['MAKEMYTRIP', 'MAKE MY TRIP', 'REDBUS', 'NUEGO', 'MOVEINN', 'ANJALI TOUR', 'IRCTC'];
// --- OFFICE MISC ---
const OFFICE_REPAIR_TOKENS = ['URBANCOMP', 'URBAN COMPANY', 'URBAN CLAP', 'PLUMBER', 'ELECTRICIAN', 'AC SERVICE', 'AC REPAIR'];
const ADVANCE_SALARY_TOKENS_SB = ['HRIDAM', 'RIYA', 'JOSHUA', 'NAYAN', 'MAHIKA', 'SABARI', 'KARTHI', 'NARMADA', 'GOPIKA', 'NIKHIL', 'TALIB', 'SHUBASHINI', 'YOGALAKSHMI', 'MUKTI', 'MUKTIKANTA'];
const OFFICE_SUPPLY_TOKENS = ['AMAZON', 'FLIPKART', 'PEPPERFRY', 'IKEA', 'DECATHLON', 'CROMA', 'RELIANCE DIGITAL'];

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

const normalizeText = (s: string): string => {
    if (!s) return '';
    const suffixCleaned = normalizeMerchantSuffix(s);
    return suffixCleaned.toUpperCase()
        .replace(/[^A-Z0-9@/.\s-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const isPersonalInstrument = (instrumentId: string, instruments: Record<string, Instrument>): boolean => {
    const inst = instruments[instrumentId];
    if (!inst) return false;
    const type = inst.instrumentType.toUpperCase();
    return type.includes('PERSONAL') || type.includes('SB_') || type.includes('BNPL');
};

const isCompanyInstrument = (instrumentId: string, instruments: Record<string, Instrument>): boolean => {
    const inst = instruments[instrumentId];
    if (!inst) return false;
    const type = inst.instrumentType.toUpperCase();
    return type.includes('COMPANY') || type.includes('CA_');
};

const isBnplInstrument = (instrumentId: string, instruments: Record<string, Instrument>): boolean => {
    const inst = instruments[instrumentId];
    if (!inst) return false;
    return inst.instrumentType.toUpperCase().includes('BNPL');
};

const getInstrumentScope = (t: Transaction, instruments: Record<string, Instrument>): Scope => {
    if (isCompanyInstrument(t.instrumentId, instruments)) return 'Company';
    return 'Personal';
};

const containsAny = (text: string, tokens: string[]): string | null => {
    for (const token of tokens) {
        if (text.includes(token)) return token;
    }
    return null;
};

const matchRegistry = (text: string, registry: Record<string, string[]>): string | null => {
    for (const [canonical, aliases] of Object.entries(registry)) {
        for (const alias of aliases) {
            if (text.includes(alias.toUpperCase())) return canonical;
        }
    }
    return null;
};

// ════════════════════════════════════════════════════════════════
// CORE CLASSIFICATION ENGINE — Strategy V3 Decision Tree
// ════════════════════════════════════════════════════════════════

export const runFailsafeClassification = (
    transactions: Transaction[],
    registries: any,
    aliasMap: Record<string, string>,
    instruments: Record<string, Instrument>
): FailsafeResult => {

    const suggestions: FailsafeSuggestion[] = [];
    const stats = { total: 0, highConfidence: 0, mediumConfidence: 0, lowConfidence: 0 };

    for (const txn of transactions) {
        const defaultScope = getInstrumentScope(txn, instruments);
        const flow: Flow = txn.direction === 'CREDIT' ? 'Income' : 'Expense';
        const descNorm = normalizeText(txn.description);
        const rawDescNorm = normalizeText(txn.descriptionRaw || '');
        const text = descNorm + ' ' + rawDescNorm;
        const isPersonal = isPersonalInstrument(txn.instrumentId, instruments);
        const isCompany = isCompanyInstrument(txn.instrumentId, instruments);
        const isBnpl = isBnplInstrument(txn.instrumentId, instruments);

        let scope: Scope = defaultScope;
        let categoryCode = 'UNCATEGORIZED';
        let entityType: EntityTypeOverride = 'Unknown';
        let entityName: string | null = null;
        let confidence = 0.30;
        let reason = 'Default fallback';
        let reimbursable = false;
        let scopeOverrideReason: string | undefined;
        const flags: string[] = [];

        // Helper to push & continue
        const emit = () => {
            confidence = Math.min(confidence, 0.95);
            if (categoryCode === 'UNCATEGORIZED') confidence = 0.10;
            if (txn.amount === 0) flags.push('ZERO_AMOUNT');
            if (!txn.txnDate) flags.push('MISSING_DATE');
            if (confidence < 0.55) flags.push('NEEDS_REVIEW');

            suggestions.push({
                txnId: txn.id, scope, flow, categoryCode, entityType, entityName,
                confidence, reason, flags,
                reimbursable: reimbursable || undefined,
                splitRatio: flags.includes('BNPL_50_50_SPLIT') ? { personal: 0.5, company: 0.5 } : undefined,
                scopeOverrideReason
            });
            stats.total++;
            if (confidence >= 0.8) stats.highConfidence++;
            else if (confidence >= 0.5) stats.mediumConfidence++;
            else stats.lowConfidence++;
        };

        let classified = false;

        // ─── STEP 1: BNPL REPAYMENT CHECK (from SB statements) ───
        if (!isBnpl && containsAny(text, BNPL_REPAYMENT_PATTERNS)) {
            categoryCode = 'BNPL_COMPANY_SHARE';
            scope = 'Company';
            entityType = 'CompanyVendor';
            entityName = text.includes('LAZYPAY') ? 'LAZYPAY' : 'SIMPL';
            confidence = 0.85;
            reason = 'BNPL Repayment → 50/50 Split';
            reimbursable = true;
            flags.push('BNPL_50_50_SPLIT', 'PERSONAL_PAID_FOR_COMPANY');
            scopeOverrideReason = 'BNPL 50/50 rule: half company, half personal';
            emit(); classified = true;
        }

        // ─── STEP 2: PARENT TRANSFER CHECK ───
        if (!classified) {
            const parentMatch = matchRegistry(text, PARENTS);
            if (parentMatch) {
                entityName = parentMatch;
                entityType = 'ManagementOverhead';
                flags.push('PARENT_TRANSFER');

                if (flow === 'Income') {
                    if (text.includes('LOAN') || text.includes('LOANTOVIJAY') || text.includes('LOANTOBLUSTREAM')) {
                        categoryCode = isCompany ? 'PARENT_LOAN_TO_COMPANY' : 'PARENT_LOAN_INFLOW';
                        reason = `Parent Loan from ${parentMatch}`;
                        flags.push('PARENT_LOAN');
                    } else if (text.includes('MUTUAL') || text.includes('MUTUALFUND') || text.includes('FORMUTUALFUND')) {
                        categoryCode = 'PARENT_SUPPORT_INVESTMENT';
                        reason = `Parent MF Support from ${parentMatch}`;
                    } else if (text.includes('GIFT') || text.includes('DIWALI') || text.includes('BIRTHDAY') || text.includes('ANNIVERS')) {
                        categoryCode = 'PARENT_GIFT';
                        reason = `Parent Gift from ${parentMatch}`;
                    } else if (text.includes('CLG') || text.includes('CHEQUE')) {
                        categoryCode = 'PARENT_LOAN_INFLOW';
                        reason = `Parent Cheque/CLG from ${parentMatch}`;
                        flags.push('PARENT_LOAN');
                    } else {
                        categoryCode = 'PARENT_GIFT';
                        reason = `Parent Transfer from ${parentMatch} (default: gift)`;
                    }
                    confidence = 0.85;
                } else {
                    categoryCode = 'PERSONAL_OTHER';
                    reason = `Payment to parent ${parentMatch}`;
                    confidence = 0.70;
                }
                emit(); classified = true;
            }
        }

        // ─── STEP 3: PERSONAL LOAN FRIEND (Mayuresh) ───
        if (!classified) {
            const friendMatch = matchRegistry(text, PERSONAL_LOAN_FRIENDS);
            if (friendMatch) {
                entityName = friendMatch;
                entityType = 'PersonalMerchant';
                categoryCode = 'PERSONAL_LOAN_FRIEND';
                scope = 'Personal';
                confidence = 0.90;
                reason = `Personal Loan: ${friendMatch} (${flow === 'Income' ? 'borrowed' : 'repaid'})`;
                flags.push('PERSONAL_DEBT_TRACKER', flow === 'Income' ? 'LOAN_BORROWED' : 'LOAN_REPAID');
                emit(); classified = true;
            }
        }

        // ─── STEP 4: VENDORS PAID PERSONALLY (Ajith, Monesh) ───
        if (!classified) {
            let vendorMatch: string | null = null;
            let vendorInfo: typeof PERSONAL_PAID_VENDORS[string] | null = null;
            for (const [name, info] of Object.entries(PERSONAL_PAID_VENDORS)) {
                if (info.aliases.some(a => text.includes(a.toUpperCase()))) {
                    vendorMatch = name;
                    vendorInfo = info;
                    break;
                }
            }
            if (vendorMatch && vendorInfo) {
                entityName = vendorMatch;
                entityType = 'CompanyVendor';
                categoryCode = vendorInfo.category;
                reimbursable = vendorInfo.reimbursable && isPersonal;
                if (isPersonal) {
                    scope = 'Company';
                    scopeOverrideReason = `${vendorMatch} is a company vendor paid from personal`;
                    flags.push('PERSONAL_PAID_FOR_COMPANY');
                }
                confidence = 0.85;
                reason = `Vendor: ${vendorMatch} → ${categoryCode}`;
                emit(); classified = true;
            }
        }

        // ─── STEP 5: FUEL CHECK (expanded with misleading names) ───
        if (!classified) {
            const fuelVendor = containsAny(text, FUEL_VENDORS) || containsAny(text, FUEL_VENDOR_ALIASES);
            const fuelKeyword = containsAny(text, FUEL_KEYWORDS);
            if (fuelVendor || fuelKeyword) {
                categoryCode = 'VEHICLE_FUEL';
                scope = 'Company';
                entityName = fuelVendor || 'FUEL STATION';
                entityType = 'CompanyVendor';
                reimbursable = isPersonal;
                confidence = fuelVendor ? 0.85 : 0.75;
                reason = fuelVendor
                    ? `Fuel: ${fuelVendor}${containsAny(text, FUEL_VENDOR_ALIASES) ? ' (ALIAS)' : ''}`
                    : `Fuel keyword: ${fuelKeyword}`;
                if (isPersonal) {
                    scopeOverrideReason = 'Fuel expense — company reimbursable';
                    flags.push('PERSONAL_PAID_FOR_COMPANY');
                }
                emit(); classified = true;
            }
        }

        // ─── STEP 6: VEHICLE SERVICE (with ICD exception) ───
        if (!classified) {
            const icdMatch = containsAny(text, VEHICLE_SERVICE_PERSONAL);
            if (icdMatch) {
                categoryCode = 'PERSONAL_VEHICLE_REPAIR_MAINTENANCE';
                scope = 'Personal';
                entityName = 'ICD TUNING';
                entityType = 'PersonalMerchant';
                confidence = 0.90;
                reason = 'ICD Tuning → Personal (NOT reimbursable)';
                flags.push('ICD_EXCEPTION');
                emit(); classified = true;
            }
        }

        if (!classified) {
            const vehicleVendor = containsAny(text, VEHICLE_SERVICE_REIMBURSABLE);
            const vehicleKeyword = containsAny(text, VEHICLE_KEYWORDS);
            if (vehicleVendor || vehicleKeyword) {
                categoryCode = 'VEHICLE_REPAIR_MAINTENANCE';
                scope = 'Company';
                entityName = vehicleVendor || 'VEHICLE SERVICE';
                entityType = 'CompanyVendor';
                reimbursable = isPersonal;
                confidence = vehicleVendor ? 0.85 : 0.70;
                reason = vehicleVendor ? `Vehicle: ${vehicleVendor}` : `Vehicle keyword: ${vehicleKeyword}`;
                if (isPersonal) {
                    scopeOverrideReason = 'Vehicle service — company reimbursable';
                    flags.push('PERSONAL_PAID_FOR_COMPANY');
                }
                emit(); classified = true;
            }
        }

        // ─── STEP 6b: OFFICE REPAIR (Urban Company, plumber etc.) ───
        if (!classified) {
            const officeRepair = containsAny(text, OFFICE_REPAIR_TOKENS);
            if (officeRepair) {
                categoryCode = 'OFFICE_REPAIR';
                scope = 'Company';
                entityName = officeRepair;
                entityType = 'CompanyVendor';
                reimbursable = isPersonal;
                confidence = 0.80;
                reason = `Office Repair: ${officeRepair}`;
                if (isPersonal) {
                    scopeOverrideReason = 'Office repair from personal';
                    flags.push('PERSONAL_PAID_FOR_COMPANY');
                }
                emit(); classified = true;
            }
        }

        // ─── STEP 7+8: ENTITY MATCHING + CATEGORY LOGIC ───
        if (!classified) {
            // 7.1 Alias Map
            for (const [alias, canonical] of Object.entries(aliasMap)) {
                if (text.includes(alias.toUpperCase())) {
                    entityName = canonical;
                    confidence += 0.50;
                    reason = `Alias: ${alias} → ${canonical}`;
                    break;
                }
            }

            // 7.2 Clients
            if (!entityName) {
                for (const [canonical, aliases] of Object.entries(CLIENT_MAP)) {
                    if (aliases.some(a => text.includes(a))) {
                        entityName = canonical;
                        entityType = 'Client';
                        confidence += 0.40;
                        reason = `Client: ${canonical}`;
                        break;
                    }
                }
            }

            // 7.3 Employees
            if (!entityName) {
                const emp = matchRegistry(text, EMPLOYEES);
                if (emp) {
                    entityName = emp;
                    entityType = 'Employee';
                    confidence += 0.40;
                    reason = `Employee: ${emp}`;
                }
            }

            // 7.4 Office Support
            if (!entityName) {
                const support = matchRegistry(text, OFFICE_SUPPORT);
                if (support) {
                    entityName = support;
                    entityType = 'Employee';
                    confidence += 0.40;
                    reason = `Office Support: ${support}`;
                    flags.push(support === 'MUKTI' ? 'MUKTI_TRACK' : 'SUPPORT_STAFF');
                }
            }

            // 7.5 Directors
            if (!entityName) {
                const dir = matchRegistry(text, DIRECTORS);
                if (dir) {
                    entityName = dir;
                    entityType = 'ManagementOverhead';
                    confidence += 0.40;
                    reason = `Director: ${dir}`;
                    flags.push('MANAGEMENT_OVERHEAD');
                }
            }

            // 7.6 Fallback entity type
            if (!entityName) {
                entityType = scope === 'Personal' ? 'PersonalMerchant' : 'CompanyVendor';
            }

            // ─── 8: CATEGORY LOGIC ───

            // 8.1 Client Receipt
            if (entityType === 'Client' && flow === 'Income' && isCompany) {
                categoryCode = 'CLIENT_RECEIPT';
                reason += ' → Revenue';
            }

            // 8.2 Employee Logic
            else if (entityType === 'Employee') {
                const supportNames = ['MUKTI', 'VIJAYA', 'SARATHY', 'MANJULA'];
                const isSupport = supportNames.includes(entityName || '');

                if (isSupport) {
                    if (text.includes('SALARY') || text.includes('PAYROLL') || txn.amount >= 5000) {
                        categoryCode = 'OFFICE_HELP_SALARY';
                    } else {
                        categoryCode = 'OFFICE_HELP_ERRANDS';
                    }
                } else {
                    if (text.includes('SALARY') || text.includes('PAYROLL')) categoryCode = 'EMPLOYEE_SALARY';
                    else if (text.includes('ADVANCE')) categoryCode = 'EMPLOYEE_SALARY_ADVANCE';
                    else if (text.includes('REIMB')) categoryCode = 'EMPLOYEE_REIMBURSEMENT';
                    else if (isCompany && flow === 'Expense') categoryCode = 'EMPLOYEE_SALARY';
                    else if (isPersonal && flow === 'Expense') {
                        categoryCode = 'EMPLOYEE_SALARY';
                        scope = 'Company';
                        reimbursable = true;
                        scopeOverrideReason = `Employee ${entityName} paid from personal`;
                        flags.push('PERSONAL_PAID_FOR_COMPANY', 'SALARY_FROM_PERSONAL');
                    }
                }

                // Support from personal = reimbursable
                if (isSupport && isPersonal && flow === 'Expense') {
                    scope = 'Company';
                    reimbursable = true;
                    scopeOverrideReason = `Office support ${entityName} paid from personal`;
                    flags.push('PERSONAL_PAID_FOR_COMPANY');
                }
            }

            // 8.3 Director
            else if (entityType === 'ManagementOverhead') {
                if (isCompany && flow === 'Expense') {
                    categoryCode = (text.includes('REIMB') || text.includes('REFUND')) ? 'DIRECTOR_REIMBURSEMENT' : 'DIRECTOR_PAYMENT';
                } else if (isPersonal && flow === 'Income') {
                    categoryCode = 'PERSONAL_TRANSFER';
                }
            }

            // 8.4 CC Bill Payment (wash) — all legs of CA → SB → CC chain
            else if (containsAny(text, CC_BILL_TOKENS) || CC_BILL_BIL_PATTERN.test(txn.descriptionRaw || txn.description || '')) {
                categoryCode = 'CC_BILL_PAYMENT';
                entityType = 'BankCharge';
                confidence += 0.35;
                reason = 'CC Bill Payment (wash)';
                flags.push('TRANSFER_WASH');
            }

            // 8.5 OD Interest
            else if (containsAny(text, OD_INTEREST_TOKENS)) {
                categoryCode = 'BANK_INTEREST_OD';
                entityType = 'BankCharge';
                confidence += 0.35;
                reason = 'OD Interest';
                if (isPersonal) {
                    scope = 'Company'; reimbursable = true;
                    scopeOverrideReason = 'OD interest from personal';
                    flags.push('PERSONAL_PAID_FOR_COMPANY');
                }
            }

            // 8.5b OD Transfer from personal SB to company CA (BLUSTREAMMARKETINGS)
            else if (containsAny(text, OD_TRANSFER_TOKENS) && isPersonal && txn.direction === 'DEBIT') {
                categoryCode = 'BANK_INTEREST_OD';
                scope = 'Company'; reimbursable = true;
                confidence += 0.40;
                reason = 'OD interest transfer: personal SB → company CA';
                scopeOverrideReason = 'Blustream OD interest from personal SB';
                flags.push('PERSONAL_PAID_FOR_COMPANY', 'OD_TRANSFER');
            }

            // 8.6 Bank Charges
            else if (containsAny(text, BANK_CHARGE_TOKENS)) {
                categoryCode = 'BANK_CHARGES';
                entityType = 'BankCharge';
                confidence += 0.25;
                reason = 'Bank Charges';
            }

            // 8.7 GST
            else if (containsAny(text, GST_PAYMENT_TOKENS)) {
                categoryCode = 'TAXES_GST'; confidence += 0.40; reason = 'GST Payment';
            }

            // 8.8 Rent
            else if (containsAny(text, RENT_TOKENS)) {
                categoryCode = isCompany ? 'OFFICE_RENT' : 'PERSONAL_RENT';
                confidence += 0.40; reason = 'Rent';
            }

            // 8.9 Electricity
            else if (containsAny(text, ELECTRICITY_TOKENS)) {
                categoryCode = isCompany ? 'OFFICE_ELECTRICITY' : 'PERSONAL_ELECTRICITY';
                confidence += 0.30; reason = 'Electricity';
            }

            // 8.10 IT Vendors (with scope override)
            else if (containsAny(text, IT_VENDORS)) {
                categoryCode = 'IT_INFRASTRUCTURE';
                confidence += 0.40;
                reason = `IT: ${containsAny(text, IT_VENDORS)}`;
                if (isPersonal) {
                    scope = 'Company'; reimbursable = true;
                    scopeOverrideReason = 'IT vendor from personal';
                    flags.push('PERSONAL_PAID_FOR_COMPANY');
                }
            }

            // 8.11 MCO Vendors (with scope override)
            else if (containsAny(text, MCO_VENDORS)) {
                categoryCode = 'SAAS_MCO_MARKETING_CREATIVE';
                confidence += 0.40;
                reason = `MCO: ${containsAny(text, MCO_VENDORS)}`;
                if (isPersonal) {
                    scope = 'Company'; reimbursable = true;
                    scopeOverrideReason = 'MCO tool from personal';
                    flags.push('PERSONAL_PAID_FOR_COMPANY');
                }
            }

            // 8.12 Telco (with scope override)
            else if (containsAny(text, TELCO_VENDORS) || (text === 'VI' && txn.amount < 1000)) {
                categoryCode = 'TELCO_INTERNET';
                confidence += 0.40;
                reason = `Telco: ${containsAny(text, TELCO_VENDORS) || 'VI'}`;
                if (isPersonal) {
                    scope = 'Company'; reimbursable = true;
                    scopeOverrideReason = 'Telecom from personal';
                    flags.push('PERSONAL_PAID_FOR_COMPANY');
                }
            }

            // 8.13 Ad Spend
            else if (containsAny(text, FACEBOOK_ADS) && isCompany) {
                categoryCode = 'MARKETING_AD_SPEND';
                entityName = 'META/FACEBOOK'; confidence += 0.40; reason = 'Meta Ad Spend';
            }
            else if (containsAny(text, GOOGLE_ADS) && isCompany) {
                categoryCode = 'MARKETING_AD_SPEND';
                entityName = 'GOOGLE ADS'; confidence += 0.40; reason = 'Google Ad Spend';
            }

            // 8.14 Food Delivery (personal instrument = staff welfare reimbursable)
            else if (containsAny(text, FOOD_DELIVERY)) {
                if (isPersonal) {
                    categoryCode = 'STAFF_WELFARE'; scope = 'Company'; reimbursable = true;
                    scopeOverrideReason = 'Food delivery from personal = staff welfare';
                    flags.push('PERSONAL_PAID_FOR_COMPANY');
                } else {
                    categoryCode = 'STAFF_WELFARE';
                }
                confidence += 0.30;
                reason = `Food: ${containsAny(text, FOOD_DELIVERY)} → Staff Welfare`;
            }

            // 8.15 Cafe / Meeting
            else if (containsAny(text, CAFE_MEETING)) {
                categoryCode = 'MEETING_EXPENSE'; confidence += 0.30;
                reason = `Cafe: ${containsAny(text, CAFE_MEETING)}`;
                if (isPersonal) {
                    scope = 'Company'; reimbursable = true;
                    scopeOverrideReason = 'Meeting cafe from personal';
                    flags.push('PERSONAL_PAID_FOR_COMPANY');
                }
            }
            else if (containsAny(text, CAFE_DINING_GENERAL)) {
                if (isCompany) {
                    categoryCode = 'CLIENT_ENTERTAINMENT';
                    flags.push('NEEDS_REVIEW_PERSONAL_OR_COMPANY');
                } else {
                    categoryCode = 'PERSONAL_DINING_CAFES';
                }
                confidence += 0.25; reason = 'Dining';
            }

            // 8.16 Uber / Local Transport
            else if (containsAny(text, UBER_TOKENS)) {
                categoryCode = 'TRAVEL_LOCAL'; confidence += 0.30; reason = 'Local Transport';
                if (isPersonal) {
                    scope = 'Company'; reimbursable = true;
                    scopeOverrideReason = 'Local transport from personal';
                    flags.push('PERSONAL_PAID_FOR_COMPANY');
                }
            }

            // 8.17 Travel
            else if (containsAny(text, TRAVEL_TOKENS)) {
                categoryCode = 'TRAVEL_INTERCITY'; confidence += 0.30;
                reason = `Travel: ${containsAny(text, TRAVEL_TOKENS)}`;
                if (isPersonal) {
                    scope = 'Company'; reimbursable = true;
                    scopeOverrideReason = 'Business travel from personal';
                    flags.push('PERSONAL_PAID_FOR_COMPANY');
                }
            }

            // 8.18 Investments
            else if (containsAny(text, INVESTMENT_TOKENS)) {
                categoryCode = 'PERSONAL_INVESTMENTS'; scope = 'Personal';
                confidence += 0.40; reason = 'Investment/MF';
            }

            // 8.19 Loan EMI
            else if (containsAny(text, LOAN_EMI_TOKENS)) {
                categoryCode = 'PERSONAL_LOAN_EMI'; scope = 'Personal';
                confidence += 0.40; reason = 'Loan EMI';
            }

            // 8.20 Transfers (self/company) — catches CA↔SB transfers 
            else if (
                text.includes('TRANSFER') || 
                (text.includes('INFT') && (text.includes('BLUSTREAM') || text.includes('SELF') || text.includes('SVIJAY') || text.includes('VENKAT') || text.includes('SHANKAR'))) ||
                (text.includes('INF/') && text.includes('INFT') && !containsAny(text, [...TELCO_VENDORS, ...GST_PAYMENT_TOKENS])) // INF/INFT not already caught = likely self-transfer
            ) {
                // Check if it's already caught as CC bill (CREDIT CARD, VENKYICICI)
                if (!containsAny(text, CC_BILL_TOKENS)) {
                    if (isCompany) categoryCode = 'COMPANY_TRANSFER';
                    else categoryCode = 'PERSONAL_TRANSFER';
                    confidence += 0.20; reason = 'Transfer';
                    flags.push('TRANSFER_WASH');
                }
            }

            emit();
        }
    }

    return { suggestions, stats };
};
