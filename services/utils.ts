
import { Transaction, ParsedResult, Document, DateResolutionMetadata, AmountResolutionMetadata, DescriptionResolutionMetadata, Scope, Flow } from '../types';
import { parseFileUniversal } from './parsers';

export const generateId = () => crypto.randomUUID();

export const generateDeterministicId = (docId: string, rowIndex: number, rawText: string, amount: number): string => {
    const str = `${docId}|${rowIndex}|${rawText.trim()}|${amount.toFixed(2)}`;
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `txn_${(hash >>> 0).toString(16)}`;
};

export const inferScope = (instrumentType: string): Scope => {
    if (!instrumentType) return 'Company';
    const t = instrumentType.toUpperCase();
    if (t.includes('COMPANY') || t.includes('CORPORATE') || t.includes('CA_')) return 'Company';
    return 'Personal';
};

export const inferFlow = (direction: string): Flow => {
    return direction === 'CREDIT' ? 'Income' : 'Expense';
};

/**
 * COMPUTES EFFECTIVE TRANSACTION STATE (OVERRIDE > RAW)
 * This function is the single source of truth for display and analytics.
 * It overlays manual overrides onto the base transaction without mutating the base.
 */
export const getEffectiveTransaction = (t: Transaction): Transaction => {
    // 1. Calculate Base Defaults (Scope/Flow)
    const baseScope = inferScope(t.instrumentId); // fallback to id check if type missing
    const realScope = inferScope(t.instrumentId.includes('_company') ? 'Company' : t.instrumentId.includes('_personal') ? 'Personal' : 'Company');
    const baseFlow = inferFlow(t.direction);

    // 2. Check Override (Manual Override takes precedence over everything)
    const ov = t.manualOverride;
    
    // 3. Persistent Scope/Flow on Transaction also valid if manual override missing but set via other means
    const effectiveScope = ov?.scope || t.scope || realScope;
    const effectiveFlow = ov?.flow || t.flow || baseFlow;

    if (!ov) {
        return {
            ...t,
            scope: effectiveScope,
            flow: effectiveFlow
        };
    }

    // 4. Merge Override
    return {
        ...t,
        categoryCode: ov.categoryCode ?? t.categoryCode,
        entityType: ov.entityType ?? t.entityType,
        vendorName: ov.entityCanonical ?? t.vendorName,
        counterpartyNormalized: ov.entityCanonical ?? t.counterpartyNormalized,
        notes: ov.notes ?? t.notes,
        scope: effectiveScope,
        flow: effectiveFlow,
        classificationStatus: t.classificationStatus || 'UNCLASSIFIED'
    };
};

// ... [Rest of file unchanged from fnv1aHash onwards] ...

export const fnv1aHash = (str: string): string => {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
};

export const normalizeForDedup = (desc: string): string => {
    if (!desc) return '';
    return desc
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') // Strip punctuation
        .trim();
};

export const computeTransactionHash = (txn: Transaction): string => {
    const inst = txn.instrumentId || 'UNKNOWN';
    const date = txn.txnDate || 'NULLDATE';
    const descNorm = normalizeForDedup(txn.description);
    const amt = Math.abs(txn.amount).toFixed(2);
    // Prefer extracted reference if available, else empty
    const ref = (txn.descriptionMetadata?.referenceTokens && txn.descriptionMetadata.referenceTokens.length > 0)
        ? txn.descriptionMetadata.referenceTokens[0]
        : '';

    const payload = `${inst}|${date}|${descNorm}|${amt}|${ref}`;
    return `uid_${fnv1aHash(payload)}`;
};

export const calculateFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
};

// Levenshtein Implementation for Similarity
const levenshtein = (a: string, b: string): number => {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

export const getStringSimilarity = (s1: string, s2: string): number => {
    if (!s1 || !s2) return 0;
    const longer = s1.length > s2.length ? s1 : s2;
    if (longer.length === 0) return 1.0;
    return (longer.length - levenshtein(s1, s2)) / longer.length;
};

export const getMonthFromDate = (dateStr: string | null): string | null => {
  if (!dateStr) return null;
  try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
      return dateStr.substring(0, 7);
  } catch {
      return null;
  }
};

export const getFinancialYear = (dateStr: string | null): string | null => {
  if (!dateStr) return null;
  try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      
      const year = date.getFullYear();
      const month = date.getMonth(); 
      let startYear = year;
      if (month < 3) { 
        startYear = year - 1;
      }
      const endYearShort = (startYear + 1).toString().slice(-2);
      return `${startYear}-${endYearShort}`;
  } catch {
      return null;
  }
};

export const validateTransaction = (txn: Partial<Transaction>): { needsAttention: boolean, issues: string[] } => {
    const issues: string[] = [];
    const desc = (txn.description || '').trim().toUpperCase();

    // 1. GLOBAL ZERO-AMOUNT DETECTOR (v2)
    // "amount == 0 OR amount == '0' OR amount == '0.00'" -> ZERO_AMOUNT_TRANSACTION
    // Exception: "BALANCE BROUGHT FORWARD", "OPENING BALANCE", "CLOSING BALANCE"
    if (txn.amount === undefined || txn.amount === null || txn.amount === 0) {
        const isBalance = desc.includes("OPENING BALANCE") || desc.includes("CLOSING BALANCE") || desc.includes("BALANCE BROUGHT FORWARD");
        if (!isBalance) {
             issues.push("ZERO_AMOUNT_TRANSACTION");
        }
    }

    // 2. MISSING DATE
    if (!txn.txnDate) {
        issues.push("MISSING_DATE");
    }

    // 3. UNDEFINED / GARBAGE DESCRIPTION FILTER
    // "description == 'UNDEFINED' OR description == null OR description length < 3"
    if (!desc || desc === 'UNDEFINED' || desc.length < 3) {
        issues.push("INVALID_DESCRIPTION");
    } else {
        // 4. BANK-SAFE DESCRIPTION HARD RULES
        // Reject numeric-only, date-only, etc.
        const hasLetters = /[A-Z]/.test(desc);
        if (!hasLetters) {
             issues.push("INVALID_DESCRIPTION_NO_TEXT");
        }
        
        // Regex checks for code-only
        if (/^ECSRTN\d+/.test(desc) || /^UPI[0-9A-Z]+$/.test(desc) || /^NEFT\d+$/.test(desc)) {
             // Heuristic: check if there's other text (e.g. spaces)
             if (!desc.includes(' ')) {
                 issues.push("INVALID_DESCRIPTION_CODE_ONLY");
             }
        }
    }

    // Category is optional draft but flagged
    if (!txn.categoryCode) issues.push("MISSING_CATEGORY");
    
    // Dedupe issues
    const uniqueIssues = [...new Set(issues)];

    return {
        needsAttention: uniqueIssues.length > 0,
        issues: uniqueIssues
    };
};

// Strict check to filter out non-transaction rows (Garbage Collection)
// v2: Only true garbage (layout artifacts) that should be HIDDEN/DELETED.
// Business-logic invalid rows (0 amount, bad desc) are now handled via validateTransaction issues.
export const isGarbageRow = (txn: Partial<Transaction>): boolean => {
    const desc = (txn.description || "").toUpperCase().trim();
    
    // 1. Empty Row
    if ((txn.amount === undefined || txn.amount === null) && !txn.txnDate && !desc) return true;

    // 2. Headers / Summary Sections (OCR artifacts)
    const FORBIDDEN_HEADERS = [
        "ACCOUNT SUMMARY", "TOTAL AMOUNT DUE", "MINIMUM AMOUNT DUE", "CREDIT LIMIT",
        "AVAILABLE CREDIT LIMIT", "REWARD SUMMARY", "CASHBACK SUMMARY", "YOUR SPENDING PATTERN",
        "IMPORTANT MESSAGES", "STATEMENT FOR", "TRANSACTIONS HIGHLIGHTED", "PAGE "
    ];
    
    if (FORBIDDEN_HEADERS.some(k => desc.includes(k))) return true;

    return false;
};

export const fileToBase64 = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1]; 
        resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

export const parseStatementText = (text: string, instrumentId: string): ParsedResult['txns'] => {
    // Deprecated in favor of parsers.ts, but kept for signature compatibility if needed
    return [];
};

// ... existing date normalization code ...
const MIN_YEAR = 1980; // Adjusted for 80-99 mapping rule
const MAX_YEAR = 2079; // Adjusted for 00-79 mapping rule

/**
 * Validates if a resolved date is sane.
 * Reject dates outside reasonable bounds.
 */
export const isDateSane = (isoDate: string): boolean => {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
    const year = parseInt(isoDate.substring(0, 4));
    return year >= MIN_YEAR && year <= MAX_YEAR;
};

export const normalizeDate = (dateStr: string, contextYear?: number): string | null => {
    if (!dateStr) return null;
    const clean = String(dateStr).trim();
    
    let resolved: string | null = null;

    // 1. ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) resolved = clean;

    // 2. DD/MM/YYYY or DD-MM-YYYY
    else {
        const dmy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
        if (dmy) {
            let yStr = dmy[3];
            let year = parseInt(yStr);
            // 2-digit Year Rule: 00-79 -> 2000s, 80-99 -> 1900s
            if (yStr.length === 2) {
                 if (year >= 0 && year <= 79) year += 2000;
                 else if (year >= 80 && year <= 99) year += 1900;
            }
            resolved = `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
        }
    }

    // 3. DD MMM YYYY or DD-MMM-YYYY (e.g. 05-Jan-2024, 5 Jan 2024, 12-Oct-23)
    if (!resolved) {
        const dMonY = clean.match(/^(\d{1,2})[\s-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s-]('?\d{2,4})$/i);
        if (dMonY) {
            const day = dMonY[1].padStart(2, '0');
            const monStr = dMonY[2].substring(0, 3).toLowerCase();
            let yearStr = dMonY[3].replace(/'/g, "");
            
            const months: Record<string, string> = {
                jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
            };
            const mon = months[monStr];
            
            let year = parseInt(yearStr);
            // 2-digit Year Rule
            if (year < 100) {
                 if (year >= 0 && year <= 79) year += 2000;
                 else if (year >= 80 && year <= 99) year += 1900;
            }
            
            resolved = `${year}-${mon}-${day}`;
        }
    }

    // 4. Fallback: Date object (Strict check)
    if (!resolved) {
        try {
            const d = new Date(clean);
            // Ensure it's valid
            if (!isNaN(d.getTime())) {
                const y = d.getFullYear();
                 // If year is anomalously low (e.g. 1900 from Excel), try context year
                if (contextYear && y < 2000 && y > 1899) { // Excel base year range
                     d.setFullYear(contextYear);
                }
                resolved = d.toISOString().split('T')[0];
            }
        } catch {}
    }

    // Sanity Check
    return (resolved && isDateSane(resolved)) ? resolved : null;
};

/**
 * Universal date parser that handles both Excel Serials and various string formats.
 */
export const parseAnyDate = (value: any, contextYear?: number): string | null => {
    if (value === null || value === undefined) return null;
    
    // Excel Serial
    if (typeof value === 'number') {
        if (value > 10000 && value < 60000) {
             const d = new Date(Math.round((value - 25569) * 86400 * 1000));
             const iso = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
             if (iso && isDateSane(iso)) return iso;
        }
        return null; // Reject non-date numbers
    }

    // String
    if (typeof value === 'string') {
        return normalizeDate(value, contextYear);
    }
    
    return null;
};

export interface DateResolutionResult {
    date: string | null;
    metadata: DateResolutionMetadata;
}

export const resolveTransactionDate = (
    rawRowDate: any, 
    instrumentType: string,
    previousRowDate: string | null,
    headerMonthHint: string | null // YYYY-MM from file metadata
): DateResolutionResult => {

    // --- LEVEL 1: Explicit Row Date ---
    // If headerMonthHint exists, parse year from it for context
    let contextYear: number | undefined = undefined;
    if (headerMonthHint) {
        const y = parseInt(headerMonthHint.split('-')[0]);
        if (!isNaN(y)) contextYear = y;
    }

    const resolvedRowDate = parseAnyDate(rawRowDate, contextYear);

    if (resolvedRowDate) {
        return {
            date: resolvedRowDate,
            metadata: {
                level: 'LEVEL_1_ROW',
                confidence: 'HIGH',
                source: 'ROW_CELL',
                issue: null
            }
        };
    }

    // --- LEVEL 3: Forward Fill ---
    const canForwardFill = instrumentType.includes('SB') || instrumentType.includes('CA');
    const isProhibited = instrumentType.includes('CC') || instrumentType.includes('BNPL');
    
    if (canForwardFill && !isProhibited && previousRowDate) {
        return {
            date: previousRowDate,
            metadata: {
                level: 'LEVEL_3_FILL',
                confidence: 'MEDIUM',
                source: 'FORWARD_FILL',
                issue: 'DATE_FORWARD_FILLED'
            }
        };
    }

    // --- Fallback to Level 2 Output if exists (Month only) ---
    if (headerMonthHint) {
         return {
            date: null,
            metadata: {
                level: 'LEVEL_2_HEADER',
                confidence: 'LOW',
                source: 'HEADER',
                issue: 'DAY_MISSING'
            }
        };
    }

    return {
        date: null,
        metadata: {
            level: 'LEVEL_4_UNRESOLVED',
            confidence: 'LOW',
            source: 'NONE',
            issue: 'MISSING_DATE'
        }
    };
};

export const normalizeAmount = (amtStr: any): number => {
    if (typeof amtStr === 'number') return Math.abs(amtStr); 
    if (!amtStr) return 0;
    const clean = String(amtStr).replace(/[^0-9.-]/g, '');
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : Math.abs(val);
};

export interface AmountResolutionResult {
    amount: number;
    direction: "DEBIT" | "CREDIT";
    metadata: AmountResolutionMetadata;
}

const cleanNumber = (val: any): number | null => {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') {
        return isNaN(val) ? null : val;
    }
    
    let str = String(val).trim().toUpperCase();
    if (!str) return null;
    
    // Explicit Garbage Placeholders
    const GARBAGE = ['-', '—', 'NIL', 'NA', 'N/A', 'NULL', '0.00', '0'];
    if (GARBAGE.includes(str)) return null;

    // Handle (123.45) -> negative
    const isParens = /^\(.*\)$/.test(str);
    
    // Handle 123- -> negative
    const isTrailingNeg = /[\d,.]+-$/.test(str);

    // Remove commas, currency symbols, parens, letters (like Cr/Dr which are handled separately for direction usually)
    // We want to keep negative sign if at start, and decimal points
    const clean = str.replace(/[^0-9.-]/g, ''); 
    
    // Check if empty after clean (e.g. "Rs." becomes "." or "")
    if (!clean || clean === '.' || clean === '-') return null;

    let floatVal = parseFloat(clean);
    
    if (isNaN(floatVal)) return null;

    if (isParens || isTrailingNeg) {
        floatVal = -Math.abs(floatVal);
    }

    return floatVal;
};

export const resolveTransactionAmount = (
    inputs: {
        amount?: any,
        debit?: any,
        credit?: any,
        sign?: any, 
        balanceDiff?: number
    },
    context: {
        description: string,
        instrumentType: string 
    }
): AmountResolutionResult => {
    // ... logic same as existing file ...
    const isCC = context.instrumentType.includes('CC');
    const isBNPL = context.instrumentType.includes('BNPL');
    const isBank = context.instrumentType.includes('SB') || context.instrumentType.includes('CA');
    
    const descLower = context.description.toLowerCase();

    const drVal = cleanNumber(inputs.debit);
    const crVal = cleanNumber(inputs.credit);
    
    if (drVal !== null && crVal !== null && (Math.abs(drVal) > 0 || Math.abs(crVal) > 0)) {
        if (Math.abs(drVal) > 0) {
            return {
                amount: Math.abs(drVal),
                direction: 'DEBIT',
                metadata: { level: 'LEVEL_2_SPLIT', confidence: 'HIGH', source: 'SPLIT_COLUMN', issue: null }
            };
        } else {
             return {
                amount: Math.abs(crVal),
                direction: 'CREDIT',
                metadata: { level: 'LEVEL_2_SPLIT', confidence: 'HIGH', source: 'SPLIT_COLUMN', issue: null }
            };
        }
    }
    
    if (drVal !== null && Math.abs(drVal) > 0) {
        return { amount: Math.abs(drVal), direction: 'DEBIT', metadata: { level: 'LEVEL_2_SPLIT', confidence: 'HIGH', source: 'SPLIT_COLUMN', issue: null } };
    }
    if (crVal !== null && Math.abs(crVal) > 0) {
        return { amount: Math.abs(crVal), direction: 'CREDIT', metadata: { level: 'LEVEL_2_SPLIT', confidence: 'HIGH', source: 'SPLIT_COLUMN', issue: null } };
    }

    const explicitVal = cleanNumber(inputs.amount);
    
    if (explicitVal !== null && Math.abs(explicitVal) > 0) {
        const absAmount = Math.abs(explicitVal);
        let direction: "DEBIT" | "CREDIT" | "UNKNOWN" = 'UNKNOWN';

        // 1. Detect Direction from Value Sign
        if (explicitVal < 0) {
            direction = 'DEBIT';
        } else {
             // 2. Detect Direction from Explicit Sign Column
             if (inputs.sign) {
                 const s = String(inputs.sign).toLowerCase();
                 if (s.includes('cr') || s.includes('credit')) direction = 'CREDIT';
                 else if (s.includes('dr') || s.includes('debit')) direction = 'DEBIT';
             }
             
             // 3. Detect Direction from Inline Suffix (123 Cr / 123 Dr)
             if (direction === 'UNKNOWN' && typeof inputs.amount === 'string') {
                 const s = inputs.amount.toUpperCase();
                 if (s.includes('CR') || s.includes('CREDIT')) direction = 'CREDIT';
                 else if (s.includes('DR') || s.includes('DEBIT')) direction = 'DEBIT';
             }

             // 4. Fallback to Instrument Defaults
             if (direction === 'UNKNOWN') {
                 if (isCC || isBNPL) {
                     direction = 'DEBIT';
                     if (descLower.includes('refund') || descLower.includes('reversal') || descLower.includes('cashback') || descLower.includes('credit') || descLower.includes('payment received')) {
                         direction = 'CREDIT';
                     }
                 } else {
                     if (isBank) {
                         // Bank Accounts: Cannot safely assume DEBIT/CREDIT without explicit indicator.
                         // But for now, we leave as UNKNOWN and let validation flag it, 
                         // or default to DEBIT if we must.
                         // The prompt says: "If not available -> add issue 'UNKNOWN_DIRECTION' but KEEP (only if amount > 0)"
                         // We will return direction as DEBIT but metadata issue.
                         direction = 'DEBIT'; 
                     }
                 }
             }
        }

        const issues: string[] = [];
        // Re-check for bank safety
        if (isBank && direction === 'DEBIT' && explicitVal > 0 && !inputs.sign) {
             // If we defaulted a bank row to DEBIT without evidence, flag it
             issues.push('UNKNOWN_DIRECTION_ASSUMED_DEBIT');
        }

        return {
            amount: absAmount,
            direction: direction === 'UNKNOWN' ? 'DEBIT' : direction,
            metadata: { level: 'LEVEL_1_EXPLICIT', confidence: 'HIGH', source: 'COLUMN', issue: issues.length > 0 ? issues[0] : null }
        };
    }

    if ((isBNPL || context.instrumentType === 'BNPL_PERSONAL') && inputs.amount === undefined) {
        const tokens = context.description.match(/(\d+(?:\.\d{1,2})?)/g);
        if (tokens && tokens.length > 0) {
            const lastToken = tokens[tokens.length - 1];
            const parsed = parseFloat(lastToken);
            if (!isNaN(parsed) && parsed > 0) {
                let dir: "DEBIT" | "CREDIT" = 'DEBIT';
                if (descLower.includes('refund') || descLower.includes('reversal') || descLower.includes('cashback')) {
                    dir = 'CREDIT';
                }
                return {
                    amount: parsed,
                    direction: dir,
                    metadata: { level: 'LEVEL_3_TEXT', confidence: 'MEDIUM', source: 'TEXT_EXTRACT', issue: null }
                };
            }
        }
    }

    if (isBank && inputs.balanceDiff !== undefined && Math.abs(inputs.balanceDiff) > 0) {
        const diff = inputs.balanceDiff;
        const amt = Math.abs(diff);
        const dir = diff > 0 ? 'CREDIT' : 'DEBIT';
        
        return {
            amount: amt,
            direction: dir,
            metadata: { level: 'LEVEL_4_BALANCE', confidence: 'MEDIUM', source: 'BALANCE_DIFF', issue: 'BALANCE_DERIVED' }
        };
    }

    return {
        amount: 0,
        direction: 'DEBIT',
        metadata: { level: 'LEVEL_5_UNRESOLVED', confidence: 'LOW', source: 'NONE', issue: 'MISSING_AMOUNT' }
    };
};

const MERCHANT_DICTIONARY = [
    'AMAZON', 'SWIGGY', 'ZOMATO', 'GOOGLE', 'FLIPKART', 'UBER', 'RAZORPAY', 'PHONEPE', 'PAYTM', 
    'NETFLIX', 'APPLE', 'SPOTIFY', 'CRED', 'INFOSYS', 'TATA', 'RELIANCE', 'AIRTEL', 'JIO', 'VI',
    'ZEPTO', 'BLINKIT', 'BIGBASKET', 'DMART', 'STARBUCKS', 'MCDONALDS', 'KFC', 'DOMINOS', 'PIZZA HUT',
    'BOOKMYSHOW', 'OLA', 'RAPIDO', 'MYNTRA', 'NYKAA', 'MEESHO', 'AJIO', 'CLEARTRIP', 'MAKEMYTRIP', 'INDIGO'
];

const BANK_CHARGE_KEYWORDS = ['CHARGE', 'FEE', 'GST', 'INTEREST', 'FIN CHARGE', 'PENALTY', 'ANNUAL', 'AUTO DEBIT RETURN', 'ACH RETURN'];
const IGNORED_TOKENS = ['UPI', 'IMPS', 'NEFT', 'RTGS', 'POS', 'ECOM', 'VIN', 'MMT', 'BIL', 'INB', 'MOB', 'CR', 'DR', 'TRANSFER', 'PAYMENT', 'TO', 'BY', 'FOR'];

// Mapping for strict merchant canonicalization
const CANONICAL_MAP: Record<string, string> = {
    'ZEPTO MARKETPLACE PRIVATE LIMITED': 'ZEPTO',
    'SWIGGY INSTAMART': 'SWIGGY',
    'PAYMENT RECEIVED': 'PAYMENT'
};

export const resolveDescription = (raw: string, instrumentType: string = 'UNKNOWN'): {
    description: string; 
    metadata: DescriptionResolutionMetadata
} => {
    if (!raw) raw = '';
    
    // NORMALIZE DESCRIPTION: Uppercase, Trim, Collapse spaces
    let clean = raw.toUpperCase().replace(/[/\-_|]/g, ' ').replace(/\s+/g, ' ').trim();

    // Remove transaction IDs (>6 digits) & trailing city/state codes (Basic heuristic: remove 2 letter codes at end)
    clean = clean.replace(/\b\d{7,}\b/g, ''); // Remove long digits
    clean = clean.replace(/\s+[A-Z]{2}$/, ''); // Remove trailing State code (e.g. MH, DL)

    // CANONICALIZE MERCHANTS
    for (const [key, val] of Object.entries(CANONICAL_MAP)) {
        if (clean.includes(key)) {
            clean = val;
            break; // Stop after first match
        }
    }

    const toTitleCase = (str: string) => {
        return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    };
    
    const tokens = clean.split(' ').filter(t => t.length > 0);
    
    let merchantName: string | null = null;
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    let isBankCharge = false;
    const issues: string[] = [];

    if (BANK_CHARGE_KEYWORDS.some(k => clean.includes(k))) {
        merchantName = "Bank Charges";
        isBankCharge = true;
        confidence = 'HIGH';
    }

    if (!merchantName) {
        for (const token of tokens) {
            if (MERCHANT_DICTIONARY.includes(token)) {
                merchantName = toTitleCase(token);
                confidence = 'HIGH';
                break;
            }
            const match = MERCHANT_DICTIONARY.find(m => token.startsWith(m));
            if (match) {
                merchantName = toTitleCase(match);
                confidence = 'HIGH';
                break;
            }
        }
    }

    if (!merchantName) {
        const validToken = tokens.find(t => {
            if (t.length <= 3) return false;
            if (IGNORED_TOKENS.includes(t)) return false;
            if (/^\d+$/.test(t)) return false; 
            return true;
        });
        
        if (validToken) {
            merchantName = toTitleCase(validToken);
            confidence = 'MEDIUM';
        }
    }

    const referenceTokens: string[] = [];
    tokens.forEach(t => {
        if (t.length > 6 && /\d/.test(t)) {
            referenceTokens.push(t);
        }
    });

    // Display formatted
    let displayDescription = clean;
    if (merchantName && confidence === 'HIGH') {
         displayDescription = merchantName.toUpperCase(); // Force Uppercase as per prompt
    } else {
         displayDescription = clean;
    }
    
    if (!displayDescription) {
        issues.push('NARRATION_MISSING');
        displayDescription = 'Unknown Transaction';
    } else if (!merchantName && !isBankCharge) {
        confidence = 'LOW';
    }

    return {
        description: displayDescription,
        metadata: {
            raw,
            clean: displayDescription,
            merchantName,
            merchantCity: null, 
            referenceTokens,
            confidence,
            isBankCharge,
            issues
        }
    };
};

export const cleanDescription = (desc: string): string => {
    if (!desc) return '';
    return desc.replace(/\s+/g, ' ').trim();
};

export const parseUpload = async (file: File, fileType: string, instrumentId: string, docId: string): Promise<ParsedResult> => {
    if (file.size === 0) {
        return { 
            docMeta: { extractedInstitutionName: null }, 
            txns: [], 
            warnings: ["EMPTY_FILE"],
            parseReport: {
                method: "FALLBACK",
                linesExtracted: 0,
                anchorsMatched: [],
                strategy: "None",
                rowsFound: 0,
                rowsCommitted: 0,
                rowsDrafted: 0,
                errors: [],
                warnings: [],
                dateStats: {},
                amountStats: {},
                descriptionStats: {}
            }
        };
    }
    
    try {
        const result = await parseFileUniversal(file, fileType as Document['fileType'], instrumentId);
        return result;
    } catch (e) {
        console.error("Parse Failure", e);
        return { 
            docMeta: { extractedInstitutionName: null }, 
            txns: [], 
            warnings: ["PARSE_ERROR"],
            parseReport: {
                method: "FALLBACK",
                linesExtracted: 0,
                anchorsMatched: [],
                strategy: "Failed",
                rowsFound: 0,
                rowsCommitted: 0,
                rowsDrafted: 0,
                errors: [],
                warnings: [],
                dateStats: {},
                amountStats: {},
                descriptionStats: {}
            }
        };
    }
};

/**
 * Strips known "Pay in EMIs" suffixes that confuse classification logic.
 * Normalizes input string by removing patterns like "(Pay in EMIs)", "(Pay in installments)", etc.
 */
export const normalizeMerchantSuffix = (input: string): string => {
    if (!input) return '';
    let clean = input.trim();
    // Patterns to strip
    const patterns = [
        /\s*\(pay\s+in\s+emi?s?\)\s*$/i,
        /\s*-\s*pay\s+in\s+emi?s?\s*$/i,
        /\s*\(pay\s+in\s+instal+ments?\)\s*$/i,
        /\s*\(installments?\)\s*$/i
    ];
    
    for (const p of patterns) {
        clean = clean.replace(p, '');
    }
    
    // Final cleanup of any lingering spaces
    return clean.replace(/\s+/g, ' ').trim();
};
