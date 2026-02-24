import { Transaction } from '../types';
import { getStringSimilarity, computeTransactionHash, normalizeForDedup } from './utils';

export interface DeduplicationSummary {
  total_txns: number;
  uids_assigned: number;
  duplicates_marked: number;
  high_confidence: number;
  medium_confidence: number;
  by_instrument: Record<string, number>;
  top_duplicate_reasons: Record<string, number>;
  duplicate_groups: Array<{
    canonical: string;
    duplicates: string[];
    reason: string;
    confidence: string;
  }>;
}

const STOPWORDS = new Set(["the","and","to","for","of","upi","txn","transaction"]);

// Filter stopwords and join for comparison
const getSignificantTokens = (desc: string): string => {
    if (!desc) return '';
    const norm = normalizeForDedup(desc);
    return norm.split(/\s+/).filter(t => !STOPWORDS.has(t)).join(' ');
};

const calculateScore = (t: Transaction): number => {
    let score = 0;
    // Prefer transaction with Reference Number
    if (t.descriptionMetadata?.referenceTokens?.length) score += 1000;
    // Prefer transaction with Date
    if (t.txnDate) score += 500;
    // Prefer fewer issues
    score -= (t.issues.length * 50);
    // Prefer finalized status
    if (t.status === 'final') score += 5000;
    else if (t.status === 'reviewed') score += 2000;
    
    return score;
};

export const runDeduplication = (transactions: Transaction[]): { 
    updatedTransactions: Transaction[], 
    summary: DeduplicationSummary 
} => {
    
    // 1. Calculate Hashes & Reset
    const updated = transactions.map(t => {
        const hash = computeTransactionHash(t);
        // Only reset if it's a draft. If it's final, we keep it as is, but we might mark DRAFTS as dupes of it.
        // The prompt says "Work ONLY on extracted transaction drafts".
        // However, to find if a draft is a duplicate of an existing final txn, we must scan finals too.
        // We will only MODIFY drafts.
        if (t.status === 'draft') {
            return {
                ...t,
                transactionHash: hash,
                isDuplicate: false,
                duplicateOf: null,
                duplicateReason: null,
                dedupConfidence: undefined
            };
        }
        return { ...t, transactionHash: hash };
    });

    // Group by Instrument
    const byInstrument: Record<string, Transaction[]> = {};
    updated.forEach(t => {
        if (!byInstrument[t.instrumentId]) byInstrument[t.instrumentId] = [];
        byInstrument[t.instrumentId].push(t);
    });

    const summary: DeduplicationSummary = {
        total_txns: transactions.length,
        uids_assigned: transactions.length,
        duplicates_marked: 0,
        high_confidence: 0,
        medium_confidence: 0,
        by_instrument: {},
        top_duplicate_reasons: {},
        duplicate_groups: []
    };

    // Process each instrument
    Object.keys(byInstrument).forEach(instId => {
        const txns = byInstrument[instId];
        // Sort by Date to optimize sliding window
        txns.sort((a, b) => {
            const da = a.txnDate || '9999-99-99';
            const db = b.txnDate || '9999-99-99';
            return da.localeCompare(db);
        });

        for (let i = 0; i < txns.length; i++) {
            const A = txns[i];
            
            // Skip if A is already marked duplicate
            if (A.isDuplicate) continue;

            for (let j = i + 1; j < txns.length; j++) {
                const B = txns[j];
                
                // Skip if B is already marked duplicate
                if (B.isDuplicate) continue;

                // Optimization: Stop if dates diverge > 3 days (allow slop for posting date diffs)
                if (A.txnDate && B.txnDate) {
                    const d1 = new Date(A.txnDate).getTime();
                    const d2 = new Date(B.txnDate).getTime();
                    if (Math.abs(d1 - d2) > 3 * 86400000) break; 
                }

                // --- MATCHING LOGIC ---
                // 1. Absolute Amount Match (Strict requirement)
                const amtMatch = Math.abs(A.amount - B.amount) < 0.01;
                if (!amtMatch) continue;

                let isMatch = false;
                let reason = '';
                let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';

                // 2. Reference Number Match (Strong)
                const refsA = A.descriptionMetadata?.referenceTokens || [];
                const refsB = B.descriptionMetadata?.referenceTokens || [];
                // Only consider ref match if token is significant length (>6)
                const commonRef = refsA.find(r => r.length > 6 && refsB.includes(r));
                
                if (commonRef) {
                    isMatch = true;
                    reason = 'REF_MATCH';
                    confidence = 'HIGH';
                }

                // 3. Date + Fuzzy Desc Match
                if (!isMatch && A.txnDate && B.txnDate && A.txnDate === B.txnDate) {
                    const descA = getSignificantTokens(A.description);
                    const descB = getSignificantTokens(B.description);
                    
                    // Direct inclusion check
                    if (descA.includes(descB) || descB.includes(descA)) {
                        isMatch = true;
                        reason = 'DESC_INCLUSION';
                        confidence = 'HIGH';
                    } else {
                        const sim = getStringSimilarity(descA, descB);
                        if (sim >= 0.92) {
                            isMatch = true;
                            reason = 'FUZZY_DESC';
                            confidence = 'MEDIUM'; // Changed to MEDIUM to represent fuzzy match confidence
                        }
                    }
                }

                if (isMatch) {
                    // Canonical Selection
                    const scoreA = calculateScore(A);
                    const scoreB = calculateScore(B);
                    
                    // We can ONLY mark drafts as duplicates.
                    // If A is final and B is final -> Do nothing (immutable).
                    // If A is final and B is draft -> B is duplicate.
                    // If A is draft and B is final -> A is duplicate.
                    // If both drafts -> Loser is duplicate.

                    let canonical = A;
                    let duplicate = B;
                    
                    if (A.status !== 'draft' && B.status !== 'draft') {
                        // Both final/reviewed. Skip deduping them against each other in this pass
                        // to avoid changing history.
                        continue;
                    } else if (A.status !== 'draft') {
                        canonical = A;
                        duplicate = B;
                    } else if (B.status !== 'draft') {
                        canonical = B;
                        duplicate = A;
                    } else {
                        // Both drafts. Use Score.
                        // Break ties with creation order (using ID string comparison as proxy or assuming array order)
                        if (scoreB > scoreA) {
                            canonical = B;
                            duplicate = A;
                        }
                    }

                    // Mark the duplicate
                    duplicate.isDuplicate = true;
                    duplicate.duplicateOf = canonical.transactionHash || canonical.id; // Use Hash if available
                    duplicate.duplicateReason = reason;
                    duplicate.dedupConfidence = confidence;

                    // Stats
                    summary.duplicates_marked++;
                    if (confidence === 'HIGH') summary.high_confidence++;
                    if (confidence === 'MEDIUM') summary.medium_confidence++;
                    
                    if (!summary.by_instrument[instId]) summary.by_instrument[instId] = 0;
                    summary.by_instrument[instId]++;

                    if (!summary.top_duplicate_reasons[reason]) summary.top_duplicate_reasons[reason] = 0;
                    summary.top_duplicate_reasons[reason]++;

                    if (summary.duplicate_groups.length < 20) {
                        summary.duplicate_groups.push({
                            canonical: canonical.id,
                            duplicates: [duplicate.id],
                            reason,
                            confidence
                        });
                    }

                    // If A became the duplicate, we must stop processing A against others
                    if (duplicate === A) break;
                }
            }
        }
    });

    return { updatedTransactions: updated, summary };
};