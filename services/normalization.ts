
import { Transaction, Document, Instrument, DescriptionResolutionMetadata } from '../types';
import { parseAnyDate, isDateSane, normalizeForDedup, isGarbageRow, validateTransaction, computeTransactionHash } from './utils';

export interface FinalSanitySummary {
    dates_fixed: number;
    amounts_fixed: number;
    narrations_fixed: number;
    possible_duplicates: number;
    still_missing_date: number;
    duplicates_removed: number;
    zero_amount_removed: number;
    affected_instruments: string[];
    drafts_invalid_description: number;
    drafts_zero_amount: number;
    drafts_duplicates: number;
}

const PAYMENT_KEYWORDS = ['PAYMENT RECEIVED', 'BBPS', 'PAID TO', 'REFUND'];

const CANONICAL_MAP: Record<string, string> = {
    'ZEPTO MARKETPLACE PRIVATE LIMITED': 'ZEPTO',
    'SWIGGY INSTAMART': 'SWIGGY',
    'GOOGLEPLAY': 'GOOGLE PLAY',
    'MAKEMYTRIP INDIA PVT LTD': 'MAKEMYTRIP'
};

const normalizeICICIDescription = (desc: string): string => {
    let clean = desc;
    // Remove "ICICI BANK" or "ICICI BANK LIMITED" if it appears at the end or as a standalone token
    clean = clean.replace(/\bICICI\s+BANK(?:\s+LIMITED)?\b/g, '');
    
    // Remove continuous digit blocks > 6 length
    clean = clean.replace(/\b\d{7,}\b/g, '');
    
    return clean.replace(/\s+/g, ' ').trim();
};

const normalizeAxisDescription = (desc: string): string => {
    let clean = desc.toUpperCase();
    
    // Remove Axis boilerplate
    clean = clean.replace(/\bAXIS\s+BANK(?:\s+(?:LTD|LIMITED))?\b/g, '');
    
    // Canonicalize prefixes (handling slashes pattern)
    clean = clean.replace(/^UPI\//, 'UPI ');
    clean = clean.replace(/^NEFT\//, 'NEFT ');
    clean = clean.replace(/^IMPS\//, 'IMPS ');
    
    // Remove continuous digit blocks > 6 length
    clean = clean.replace(/\b\d{7,}\b/g, '');
    
    return clean.replace(/\s+/g, ' ').trim();
};

export const runFinalSanityPass = (
    transactions: Transaction[], 
    documents: Record<string, Document>,
    instruments: Record<string, Instrument>
): { updatedTransactions: Transaction[], summary: FinalSanitySummary } => {

    const stats: FinalSanitySummary = {
        dates_fixed: 0,
        amounts_fixed: 0,
        narrations_fixed: 0,
        possible_duplicates: 0,
        still_missing_date: 0,
        duplicates_removed: 0,
        zero_amount_removed: 0,
        drafts_invalid_description: 0,
        drafts_zero_amount: 0,
        drafts_duplicates: 0,
        affected_instruments: []
    };
    
    const affectedInstSet = new Set<string>();
    const validTxns: Transaction[] = [];

    // 1. GLOBAL ROW ELIMINATION & NORMALIZATION LOOP
    for (const txn of transactions) {
        // Skip deletion checks for 'final' status to respect user actions
        // (Except we might still flag them if they violate core rules, but we won't revert status to draft if user finalized it intentionally)
        if (txn.status === 'final') {
            validTxns.push(txn);
            continue;
        }

        // --- HARD DELETE RULES (Only for layout garbage) ---
        if (isGarbageRow(txn)) {
            // Mark as removed/hidden
            affectedInstSet.add(txn.instrumentId);
            stats.duplicates_removed++;
            validTxns.push({
                ...txn,
                isDuplicate: true,
                duplicateReason: 'GARBAGE_AUTO_DELETE'
            });
            continue;
        }

        // --- NORMALIZATION & VALIDATION ---
        let modified = false;
        let newDesc = (txn.description || '').toUpperCase().trim();
        let newAmount = txn.amount;
        let newDirection = txn.direction;
        let newDate = txn.txnDate;
        let newStatus = txn.status;
        const issues = new Set(txn.issues);

        // ICICI SPECIFIC NORMALIZATION (Cleanup Boilerplate)
        const isICICI = txn.instrumentId === 'icici_sb_personal' || txn.instrumentId === 'icici_ca_company';
        if (isICICI) {
            const prev = newDesc;
            newDesc = normalizeICICIDescription(newDesc);
            if (newDesc !== prev) {
                modified = true;
                stats.narrations_fixed++;
            }
        }

        // AXIS CA SPECIFIC NORMALIZATION
        const isAxisCA = txn.instrumentId === 'axis_ca_company';
        if (isAxisCA) {
            const prev = newDesc;
            newDesc = normalizeAxisDescription(newDesc);
            if (newDesc !== prev) {
                modified = true;
                stats.narrations_fixed++;
            }
        }

        // PAYMENT & CREDIT NORMALIZATION
        // "If description contains PAYMENT RECEIVED / BBPS / PAID TO / REFUND -> Force CREDIT"
        const isPayment = PAYMENT_KEYWORDS.some(k => newDesc.includes(k));
        if (isPayment) {
            if (newDirection !== 'CREDIT') {
                newDirection = 'CREDIT';
                modified = true;
            }
            if (!newDesc.includes('PAYMENT')) {
                 newDesc = 'PAYMENT'; // Strict canonicalization
                 modified = true;
            }
        }

        // DESCRIPTION NORMALIZATION (Strict)
        // Remove IDs > 6 digits
        const prevDesc = newDesc;
        newDesc = newDesc.replace(/\b\d{7,}\b/g, '').trim();
        // Remove trailing city/state (2 uppercase chars at end)
        newDesc = newDesc.replace(/\s+[A-Z]{2}$/, '').trim();
        // Collapse spaces
        newDesc = newDesc.replace(/\s+/g, ' ').trim();
        
        // Canonical Map
        for (const [key, val] of Object.entries(CANONICAL_MAP)) {
            if (newDesc.includes(key)) {
                newDesc = val; 
                break;
            }
        }
        
        if (newDesc !== prevDesc || newDesc !== txn.description) {
            modified = true;
            stats.narrations_fixed++;
        }

        // DATE NORMALIZATION & VALIDATION (Post-Parse)
        const doc = txn.sourceDocumentId ? documents[txn.sourceDocumentId] : null;
        
        if (newDate) {
            if (!isDateSane(newDate)) {
                issues.add('DATE_SUSPECT');
            } else if (doc && doc.statementMonthHint) {
                // Strict Range Check: ±2 days of statement month
                const [y, m] = doc.statementMonthHint.split('-').map(Number);
                const start = new Date(y, m - 1, 1);
                start.setDate(start.getDate() - 2);
                const end = new Date(y, m, 0); 
                end.setDate(end.getDate() + 2);
                
                const d = new Date(newDate);
                if (d < start || d > end) {
                    issues.add('DATE_SUSPECT');
                }
            }
        } else {
            issues.add('MISSING_DATE');
            stats.still_missing_date++;
        }

        // --- BUSINESS RULE VALIDATION (Draft Enforcement) ---
        // Run validateTransaction logic to get updated issues list
        const validation = validateTransaction({ 
            amount: newAmount, 
            description: newDesc, 
            txnDate: newDate, 
            categoryCode: txn.categoryCode 
        });

        // Merge validation issues
        validation.issues.forEach(i => issues.add(i));

        // Enforce Draft Status for critical issues
        if (issues.has('ZERO_AMOUNT_TRANSACTION')) {
            newStatus = 'draft';
            stats.drafts_zero_amount++;
        }
        if (issues.has('INVALID_DESCRIPTION') || issues.has('INVALID_DESCRIPTION_NO_TEXT') || issues.has('INVALID_DESCRIPTION_CODE_ONLY')) {
            newStatus = 'draft';
            stats.drafts_invalid_description++;
        }
        
        // Remove fixed issues
        if (newAmount > 0) issues.delete('ZERO_AMOUNT_TRANSACTION');
        if (newDate) issues.delete('MISSING_DATE');

        if (newStatus !== txn.status) modified = true;
        if (issues.size !== txn.issues.length) modified = true; // Primitive check, but good enough

        // Construct Updated Txn
        if (modified) {
            affectedInstSet.add(txn.instrumentId);
            validTxns.push({
                ...txn,
                description: newDesc,
                amount: newAmount,
                direction: newDirection,
                txnDate: newDate,
                status: newStatus,
                issues: Array.from(issues),
                needsAttention: issues.size > 0 || !newDate || newStatus === 'draft'
            });
        } else {
            validTxns.push(txn);
        }
    }

    // 2. SAFE DEDUPLICATION (v2)
    // DEDUP_KEY = hash(instrument + date + normalized_description + amount)
    
    // Sort by Date
    validTxns.sort((a, b) => (a.txnDate || '9999').localeCompare(b.txnDate || '9999'));
    
    // We need a map to track canonicals for this pass
    const seenHashes = new Set<string>();

    for (const txn of validTxns) {
        if (txn.isDuplicate) continue; // Already marked garbage

        // Recompute hash with normalized values
        const hash = computeTransactionHash(txn);
        
        if (seenHashes.has(hash)) {
            // Duplicate found
            txn.status = 'draft';
            if (!txn.issues.includes('DUPLICATE_TRANSACTION')) {
                txn.issues.push('DUPLICATE_TRANSACTION');
            }
            txn.needsAttention = true;
            // Also set isDuplicate for UI dimming
            txn.isDuplicate = true;
            txn.duplicateReason = 'DEDUP_HASH_MATCH';
            
            stats.duplicates_removed++;
            stats.drafts_duplicates++;
            affectedInstSet.add(txn.instrumentId);
        } else {
            seenHashes.add(hash);
        }
    }

    stats.affected_instruments = Array.from(affectedInstSet);

    return {
        updatedTransactions: validTxns,
        summary: stats
    };
};

export const runDateNormalization = (
    transactions: Transaction[], 
    documents: Record<string, Document>
): { updatedTransactions: Transaction[], summary: any } => {
    return { updatedTransactions: transactions, summary: {} };
};

export const runAmountNormalization = (
    transactions: Transaction[], 
    instruments: Record<string, Instrument>
): { updatedTransactions: Transaction[], summary: any } => {
    return { updatedTransactions: transactions, summary: {} };
};

export const runDescriptionNormalization = (
    transactions: Transaction[]
): { updatedTransactions: Transaction[], summary: any } => {
    return { updatedTransactions: transactions, summary: {} };
};
