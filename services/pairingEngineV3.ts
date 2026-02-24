
import { Transaction, ReconciliationReportV3, DirectorReconSummaryV3, PairingRecordV3, Instrument, PairingStatusV3 } from '../types';
import { getStringSimilarity } from './utils';

// --- CONFIGURATION ---
const CONFIG = {
    DATE_WINDOW_EXACT: 14, // days
    DATE_WINDOW_NEAR: 30,  // days
    THRESHOLD_NEAR_SCORE: 0.85,
    THRESHOLD_DESC_SIMILARITY: 0.6,
    AMOUNT_DIFF_PCT: 0.01, // 1%
    AMOUNT_DIFF_ABS: 50,   // INR
    BATCH_SUM_MAX_ITEMS: 5,
    BATCH_SUM_WINDOW: 30,
    FEATURE_FLAGS: {
        BATCH_SUM_ENABLED: false, // Default OFF
        TRANSFER_SETTLEMENT_ENABLED: true
    }
};

const SALARY_TOKENS = ['SALARY', 'PAYROLL', 'STIPEND'];
const ADVANCE_TOKENS = ['ADVANCE', 'ADV'];
const REIMB_TOKENS = ['REIMB', 'REFUND', 'SETTLE', 'EXPENSE', 'CLAIM', 'PAID FOR', 'ON BEHALF'];

// --- HELPERS ---

const getDirectorId = (t: Transaction, instruments: Record<string, Instrument>): string => {
    // 1. Explicit Entity Type from Phase 2
    if (t.entity_type_v2 === 'ManagementOverhead' || t.entity_type_v2 === 'Director') {
        if (t.entity_canonical_v2) return t.entity_canonical_v2;
    }
    
    // 2. Instrument Owner Inference
    const inst = instruments[t.instrumentId];
    // This is a placeholder. In a real app, instrument would have owner metadata.
    // For now, we return a default "VENKATRAMAN" for personal instruments if unknown, 
    // or infer from name if available in map.
    // NOTE: This assumes single-director scenario or specific instrument mapping if we had it.
    // Defaulting to "VENKATRAMAN" for safety in this specific context unless explicitly NEELAM.
    if (t.vendorName?.includes('NEELAM') || t.description.includes('NEELAM')) return 'NEELAM';
    
    return 'VENKATRAMAN';
};

const getIntent = (t: Transaction): 'REIMBURSEMENT' | 'SALARY' | 'ADVANCE' | 'OTHER' => {
    const desc = (t.description + ' ' + (t.categoryCode || '')).toUpperCase();
    
    if (SALARY_TOKENS.some(tk => desc.includes(tk)) || t.categoryCode === 'EMPLOYEE_SALARY') return 'SALARY';
    if (ADVANCE_TOKENS.some(tk => desc.includes(tk))) return 'ADVANCE';
    if (REIMB_TOKENS.some(tk => desc.includes(tk)) || t.categoryCode === 'DIRECTOR_REIMBURSEMENT') return 'REIMBURSEMENT';
    
    return 'OTHER';
};

const calculateDateDiff = (d1: string, d2: string): number => {
    const t1 = new Date(d1).getTime();
    const t2 = new Date(d2).getTime();
    return Math.abs(t1 - t2) / (1000 * 3600 * 24);
};

const calculateNearScore = (exp: Transaction, reimb: Transaction): number => {
    let score = 0;
    
    // 1. Amount Score (Max 0.5)
    const diffPct = Math.abs(exp.amount - reimb.amount) / exp.amount;
    if (diffPct <= 0.01) score += 0.5;
    else if (diffPct <= 0.05) score += 0.3;
    else score += 0.1;

    // 2. Date Score (Max 0.2)
    const days = calculateDateDiff(exp.txnDate!, reimb.txnDate!);
    if (days <= 7) score += 0.2;
    else if (days <= 14) score += 0.1;
    
    // 3. Desc Score (Max 0.3)
    // Compare significant tokens
    const sim = getStringSimilarity(exp.description, reimb.description);
    if (sim > 0.8) score += 0.3;
    else if (sim > 0.5) score += 0.15;

    return score;
};

// --- MAIN ENGINE ---

export const runPairingEngineV3 = (
    transactions: Transaction[],
    instruments: Record<string, Instrument>
): { 
    report: ReconciliationReportV3; 
    pairingUpdates: Record<string, PairingRecordV3>;
} => {
    
    // 1. Initialize Containers
    const directors: Record<string, {
        expenses: Transaction[],
        reimbursements: Transaction[],
        advances: Transaction[],
        salary: Transaction[],
        personalLeakage: Transaction[], // Company paid personal
        settlementsIn: Transaction[]    // Director repaid company
    }> = {};

    const pairingUpdates: Record<string, PairingRecordV3> = {};
    const pairedIds = new Set<string>();

    const getDirectorBucket = (id: string) => {
        if (!directors[id]) {
            directors[id] = { expenses: [], reimbursements: [], advances: [], salary: [], personalLeakage: [], settlementsIn: [] };
        }
        return directors[id];
    };

    // 2. Bucketing Loop
    for (const t of transactions) {
        if (!t.txnDate || t.amount <= 0 || t.status === 'excluded') continue;

        const dirId = getDirectorId(t, instruments);
        const bucket = getDirectorBucket(dirId);

        // A) Director Paid Company Expense (D->C)
        if (
            t.scope_v1 === 'Personal' && 
            t.flow_v1 === 'Out' && 
            t.nature_v1 === 'OPERATING_EXPENSE' &&
            (t.category_flags_v2?.includes('director_paid_company_expense_candidate') || t.category_code_v2?.startsWith('COMPANY_'))
        ) {
            bucket.expenses.push(t);
        }

        // B) Company Reimbursement/Settlement (C->D)
        else if (
            t.scope_v1 === 'Company' && 
            t.flow_v1 === 'Out' && 
            t.nature_v1 === 'TRANSFER_DIRECTOR'
        ) {
            const intent = getIntent(t);
            if (intent === 'SALARY') bucket.salary.push(t);
            else if (intent === 'ADVANCE') bucket.advances.push(t);
            else bucket.reimbursements.push(t); // Includes explicit REIMB + OTHER
        }

        // C) Company Paid Personal (Leakage)
        else if (
            t.scope_v1 === 'Company' && 
            t.flow_v1 === 'Out' && 
            t.nature_v1 === 'OPERATING_EXPENSE' &&
            (t.category_code_v2?.startsWith('PERSONAL_') || t.category_flags_v2?.includes('personal_merchant'))
        ) {
            bucket.personalLeakage.push(t);
        }

        // D) Director Settled to Company (D->C Transfer)
        else if (
            t.scope_v1 === 'Company' &&
            t.flow_v1 === 'In' &&
            t.nature_v1 === 'TRANSFER_DIRECTOR' // Money coming in from Director
        ) {
            bucket.settlementsIn.push(t);
        }
    }

    // 3. Pairing Logic Per Director
    const summaries: DirectorReconSummaryV3[] = [];

    Object.entries(directors).forEach(([dirId, data]) => {
        const { expenses, reimbursements, personalLeakage, settlementsIn } = data;
        
        // Sort for deterministic matching
        expenses.sort((a,b) => a.txnDate!.localeCompare(b.txnDate!));
        reimbursements.sort((a,b) => a.txnDate!.localeCompare(b.txnDate!));

        const pairings: DirectorReconSummaryV3['pairings'] = [];
        let reimbursedTotal = 0;

        // --- STEP 1: EXACT MATCH ---
        expenses.forEach(exp => {
            if (pairedIds.has(exp.id)) return;

            // Find best candidate
            let bestMatch: Transaction | null = null;
            let bestDiff = Infinity;

            for (const reimb of reimbursements) {
                if (pairedIds.has(reimb.id)) continue;
                
                // Date constraint: Reimb must be AFTER expense (or same day), within window
                // Allow reimb to be slightly before? Rare. Let's stick to exp <= reimb <= exp + window
                const days = calculateDateDiff(exp.txnDate!, reimb.txnDate!);
                if (new Date(reimb.txnDate!) < new Date(exp.txnDate!)) continue; // Reimb cannot be before expense usually
                
                if (days > CONFIG.DATE_WINDOW_EXACT) continue;

                if (Math.abs(exp.amount - reimb.amount) <= 0.01) {
                    // Exact Match found
                    if (days < bestDiff) {
                        bestMatch = reimb;
                        bestDiff = days;
                    }
                }
            }

            if (bestMatch) {
                pairedIds.add(exp.id);
                pairedIds.add(bestMatch.id);
                reimbursedTotal += exp.amount;

                const pairRecord: PairingRecordV3 = {
                    pairing_status_v3: 'PAIRED_FULL',
                    pairing_rule_id_v3: 'EXACT_AMOUNT_DATE_WINDOW',
                    pairing_score_v3: 1.0,
                    paired_txn_ids_v3: [bestMatch.id],
                    pairing_notes_v3: `Matched ${bestMatch.amount} on ${bestMatch.txnDate}`
                };

                pairingUpdates[exp.id] = pairRecord;
                pairingUpdates[bestMatch.id] = { ...pairRecord, paired_txn_ids_v3: [exp.id] };

                pairings.push({
                    pair_type: 'REIMBURSEMENT_MATCH',
                    txn_ids: [exp.id, bestMatch.id],
                    amount: exp.amount,
                    score: 1.0,
                    rule_id: 'EXACT_AMOUNT_DATE_WINDOW',
                    evidence: `Exact amt match, ${bestDiff} days gap`
                });
            }
        });

        // --- STEP 2: NEAR MATCH ---
        expenses.forEach(exp => {
            if (pairedIds.has(exp.id)) return;

            let bestMatch: Transaction | null = null;
            let bestScore = -1;

            for (const reimb of reimbursements) {
                if (pairedIds.has(reimb.id)) continue;
                if (new Date(reimb.txnDate!) < new Date(exp.txnDate!)) continue;
                const days = calculateDateDiff(exp.txnDate!, reimb.txnDate!);
                if (days > CONFIG.DATE_WINDOW_NEAR) continue;

                // Check amount constraint
                const diffAbs = Math.abs(exp.amount - reimb.amount);
                const diffPct = diffAbs / exp.amount;
                
                if (diffPct > CONFIG.AMOUNT_DIFF_PCT && diffAbs > CONFIG.AMOUNT_DIFF_ABS) continue;

                const score = calculateNearScore(exp, reimb);
                if (score >= CONFIG.THRESHOLD_NEAR_SCORE && score > bestScore) {
                    bestScore = score;
                    bestMatch = reimb;
                }
            }

            if (bestMatch) {
                pairedIds.add(exp.id);
                pairedIds.add(bestMatch.id);
                reimbursedTotal += bestMatch.amount; // Use actual reimbursed amount

                const pairRecord: PairingRecordV3 = {
                    pairing_status_v3: 'PAIRED_FULL', // Or partial if amounts differ substantially
                    pairing_rule_id_v3: 'NEAR_AMOUNT_SCORING',
                    pairing_score_v3: bestScore,
                    paired_txn_ids_v3: [bestMatch!.id],
                    pairing_notes_v3: `Near match (${Math.round(bestScore*100)}%)`
                };

                pairingUpdates[exp.id] = pairRecord;
                pairingUpdates[bestMatch!.id] = { ...pairRecord, paired_txn_ids_v3: [exp.id] };

                pairings.push({
                    pair_type: 'REIMBURSEMENT_MATCH_NEAR',
                    txn_ids: [exp.id, bestMatch!.id],
                    amount: bestMatch!.amount,
                    score: bestScore,
                    rule_id: 'NEAR_AMOUNT_SCORING',
                    evidence: `Score ${bestScore.toFixed(2)}`
                });
            }
        });

        // --- STEP 4: TRANSFER SETTLEMENT (Leakage Repayment) ---
        if (CONFIG.FEATURE_FLAGS.TRANSFER_SETTLEMENT_ENABLED) {
            personalLeakage.forEach(leak => {
                if (pairedIds.has(leak.id)) return;
                
                // Try to find a repayment (Settlement In) matching this leakage amount
                // Usually Director pays back Company for personal expense
                const repayment = settlementsIn.find(s => 
                    !pairedIds.has(s.id) && 
                    Math.abs(s.amount - leak.amount) <= 1.0 && // Allow 1 rupee diff
                    calculateDateDiff(leak.txnDate!, s.txnDate!) <= 30 // Repaid within month
                );

                if (repayment) {
                    pairedIds.add(leak.id);
                    pairedIds.add(repayment.id);
                    
                    const pairRecord: PairingRecordV3 = {
                        pairing_status_v3: 'PAIRED_FULL',
                        pairing_rule_id_v3: 'LEAKAGE_REPAYMENT_MATCH',
                        pairing_score_v3: 1.0,
                        paired_txn_ids_v3: [repayment.id],
                        pairing_notes_v3: 'Director repaid personal expense'
                    };
                    
                    pairingUpdates[leak.id] = pairRecord;
                    pairingUpdates[repayment.id] = { ...pairRecord, paired_txn_ids_v3: [leak.id] };

                    pairings.push({
                        pair_type: 'LEAKAGE_REPAYMENT',
                        txn_ids: [leak.id, repayment.id],
                        amount: leak.amount,
                        score: 1.0,
                        rule_id: 'LEAKAGE_REPAYMENT_MATCH',
                        evidence: 'Exact repayment match'
                    });
                }
            });
        }

        // --- CALCULATE TOTALS ---
        const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
        // Net Owed = Expenses - (Reimbursed via pairing). 
        // Note: reimbursedTotal tracks how much of expenses was covered.
        const companyOwesNet = totalExpenses - reimbursedTotal;

        const totalLeakage = personalLeakage.reduce((sum, t) => sum + t.amount, 0);
        const totalRepaid = pairings
            .filter(p => p.pair_type === 'LEAKAGE_REPAYMENT')
            .reduce((sum, p) => sum + p.amount, 0);
        const directorOwesNet = totalLeakage - totalRepaid;

        // Open Items (Unpaired)
        const openItems = [
            ...expenses.filter(t => !pairedIds.has(t.id)).map(t => ({
                txn_id: t.id,
                amount: t.amount,
                date: t.txnDate!,
                entity: t.vendorName || 'Unknown',
                category: t.categoryCode || 'UNCAT',
                reason: 'Unreimbursed Director Expense'
            })),
            ...personalLeakage.filter(t => !pairedIds.has(t.id)).map(t => ({
                txn_id: t.id,
                amount: t.amount,
                date: t.txnDate!,
                entity: t.vendorName || 'Unknown',
                category: t.categoryCode || 'UNCAT',
                reason: 'Unrepaid Personal Leakage'
            }))
        ];

        summaries.push({
            director_id: dirId,
            company_owes_director: {
                raw: totalExpenses,
                reimbursed: reimbursedTotal,
                net: companyOwesNet
            },
            director_owes_company: {
                raw: totalLeakage,
                repaid: totalRepaid,
                net: directorOwesNet
            },
            open_items: openItems,
            pairings: pairings
        });
    });

    const report: ReconciliationReportV3 = {
        as_of: new Date().toISOString(),
        directors: summaries,
        unmatched_reimbursements: Object.values(directors).flatMap(d => d.reimbursements.filter(t => !pairedIds.has(t.id)).map(t => t.id)),
        unmatched_expenses: Object.values(directors).flatMap(d => d.expenses.filter(t => !pairedIds.has(t.id)).map(t => t.id)),
        settings: CONFIG
    };

    return { report, pairingUpdates };
};
