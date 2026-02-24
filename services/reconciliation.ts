
import { Transaction, FinancialRelationshipType, Instrument } from '../types';
import { CATEGORIES_COMPANY_EXPENSE, CATEGORIES_PERSONAL_EXPENSE } from './taxonomy';

// Director identity markers (must match existing logic)
const DIRECTOR_KEYWORDS = ['VENKAT', 'VENKY', 'SHANKARNARYAN', 'NEELAM', 'SVIJAY19'];

// --- TYPES ---

export interface DirectorPositionReport {
    directorPaidOnBehalf: number;
    companyPersonalLeakage: number;
    companyToDirectorSettlement: number;
    directorToCompanySettlement: number;
    
    netPosition: {
        direction: "COMPANY_OWES_DIRECTOR" | "DIRECTOR_OWES_COMPANY";
        amount: number;
    };

    txns: {
        directorOnBehalf: Transaction[];
        personalLeakage: Transaction[];
        settlements: Transaction[];
        salary: Transaction[];
    };
}

export interface SettlementPair {
    id: string;
    companyTxn: Transaction;
    directorTxn: Transaction;
    confidence: 'HIGH' | 'MEDIUM';
    amount: number;
    dateDiff: number; // in days
}

// --- CORE RULE ENGINE ---

const isDirectorEntity = (name: string | undefined): boolean => {
    if (!name) return false;
    const upper = name.toUpperCase();
    return DIRECTOR_KEYWORDS.some(k => upper.includes(k));
};

export const inferRelationshipType = (txn: Transaction, instrumentType: string): FinancialRelationshipType => {
    const actor = instrumentType === 'Company' ? 'COMPANY' : 'DIRECTOR';
    const cat = txn.categoryCode;
    const canon = txn.vendorName || txn.counterpartyNormalized || '';
    const desc = txn.description.toUpperCase();

    // 4️⃣ SALARY (Check first to exclude from others)
    if (cat === 'EMPLOYEE_SALARY' || cat === 'DIRECTOR_PAYMENT') {
        // Only treat as salary if description/cat strongly implies it vs generic transfer
        if (desc.includes('SALARY') || cat === 'EMPLOYEE_SALARY' || (cat === 'DIRECTOR_PAYMENT' && !desc.includes('REIMB'))) {
            return 'SALARY';
        }
    }

    // 1️⃣ COMPANY_OPERATIONAL
    if (actor === 'COMPANY') {
        const isSettlementCat = cat === 'DIRECTOR_PAYMENT' || cat === 'DIRECTOR_REIMBURSEMENT' || cat === 'COMPANY_TRANSFER';
        if (!isSettlementCat && !isDirectorEntity(canon)) {
            // Check for Personal Leakage
            const isPersonalCat = cat && (CATEGORIES_PERSONAL_EXPENSE as readonly string[]).includes(cat);
            if (isPersonalCat) {
                return 'PERSONAL_LEAKAGE'; // 3️⃣
            }
            return 'COMPANY_OPERATIONAL';
        }
    }

    // 2️⃣ DIRECTOR_ON_BEHALF
    if (actor === 'DIRECTOR') {
        const isCompanyCat = cat && (CATEGORIES_COMPANY_EXPENSE as readonly string[]).includes(cat);
        // Exclude transfers to self or company (settlement)
        const isTransfer = cat === 'PERSONAL_TRANSFER' || cat === 'COMPANY_TRANSFER';
        
        if (isCompanyCat && !isTransfer && !isDirectorEntity(canon)) {
            return 'DIRECTOR_ON_BEHALF';
        }
    }

    // 5️⃣ SETTLEMENT (Transfers between actors)
    const isSettlementCat = cat === 'DIRECTOR_REIMBURSEMENT' || cat === 'COMPANY_TRANSFER' || cat === 'PERSONAL_TRANSFER' || cat === 'DIRECTOR_PAYMENT';
    
    if (isSettlementCat) {
        // If Company paying Director (Reimb) or Director paying Company
        if (actor === 'COMPANY' && isDirectorEntity(canon)) return 'SETTLEMENT';
        if (actor === 'DIRECTOR' && (canon.includes('COMPANY') || canon.includes('BLUSTREAM') || canon === 'INTERNAL_TRANSFER')) return 'SETTLEMENT';
        // Relaxed settlement rule: if category is explicit Reimb/Transfer and not operational
        if (cat === 'DIRECTOR_REIMBURSEMENT') return 'SETTLEMENT';
    }

    // 6️⃣ DIRECTOR_PERSONAL
    if (actor === 'DIRECTOR') {
        const isPersonalCat = cat && (CATEGORIES_PERSONAL_EXPENSE as readonly string[]).includes(cat);
        if (isPersonalCat) return 'DIRECTOR_PERSONAL';
        // Fallback for Director source if not OnBehalf
        if (cat !== 'UNCATEGORIZED') return 'DIRECTOR_PERSONAL';
    }

    return 'UNKNOWN';
};

// --- NET POSITION CALCULATOR ---

export const calculateDirectorNetPosition = (txns: Transaction[], instruments: Record<string, Instrument>): DirectorPositionReport => {
    let directorPaidOnBehalf = 0;
    let companyPersonalLeakage = 0;
    let companyToDirectorSettlement = 0;
    let directorToCompanySettlement = 0;

    const groups = {
        directorOnBehalf: [] as Transaction[],
        personalLeakage: [] as Transaction[],
        settlements: [] as Transaction[],
        salary: [] as Transaction[]
    };

    txns.forEach(t => {
        const inst = instruments[t.instrumentId];
        // Normalize instrument type for rule engine
        const typeStr = (inst?.instrumentType?.toUpperCase().includes('COMPANY') || inst?.instrumentType?.toUpperCase().includes('CA_')) ? 'Company' : 'Personal';
        
        const rel = inferRelationshipType(t, typeStr);
        // Attach derived type temporarily for view logic (or permanent if persisted later)
        t.financial_relationship_type = rel;

        if (rel === 'DIRECTOR_ON_BEHALF') {
            directorPaidOnBehalf += t.amount;
            groups.directorOnBehalf.push(t);
        } else if (rel === 'PERSONAL_LEAKAGE') {
            companyPersonalLeakage += t.amount;
            groups.personalLeakage.push(t);
        } else if (rel === 'SETTLEMENT') {
            if (t.direction === 'DEBIT' && typeStr === 'Company') {
                companyToDirectorSettlement += t.amount;
            } else if (t.direction === 'DEBIT' && typeStr === 'Personal') {
                directorToCompanySettlement += t.amount; // Director paid back company
            } else if (t.direction === 'CREDIT' && typeStr === 'Company') {
                // Money came into company from Director
                directorToCompanySettlement += t.amount;
            } else if (t.direction === 'CREDIT' && typeStr === 'Personal') {
                // Money came into Director from Company
                companyToDirectorSettlement += t.amount;
            }
            groups.settlements.push(t);
        } else if (rel === 'SALARY') {
            groups.salary.push(t);
        }
    });

    const companyOwes = directorPaidOnBehalf - companyToDirectorSettlement + directorToCompanySettlement;
    const directorOwes = companyPersonalLeakage;

    const net = companyOwes - directorOwes;

    return {
        directorPaidOnBehalf,
        companyPersonalLeakage,
        companyToDirectorSettlement,
        directorToCompanySettlement,
        netPosition: {
            direction: net >= 0 ? 'COMPANY_OWES_DIRECTOR' : 'DIRECTOR_OWES_COMPANY',
            amount: Math.abs(net)
        },
        txns: groups
    };
};

// --- SETTLEMENT PAIR DETECTION ---

export const detectSettlementPairs = (txns: Transaction[], instruments: Record<string, Instrument>): SettlementPair[] => {
    // Filter potential settlements
    const candidates = txns.filter(t => {
        const inst = instruments[t.instrumentId];
        const typeStr = (inst?.instrumentType?.toUpperCase().includes('COMPANY') || inst?.instrumentType?.toUpperCase().includes('CA_')) ? 'Company' : 'Personal';
        const rel = inferRelationshipType(t, typeStr);
        return rel === 'SETTLEMENT';
    });

    const pairs: SettlementPair[] = [];
    const usedIds = new Set<string>();

    candidates.forEach(t1 => {
        if (usedIds.has(t1.id)) return;

        // Find match
        // Rule: Same absolute amount, opposite flow (conceptually), different actor
        // Actually, flow is implied by direction + actor.
        // Company Out (Debit) <-> Director In (Credit)
        // Company In (Credit) <-> Director Out (Debit)
        
        const inst1 = instruments[t1.instrumentId];
        const isCompany1 = inst1?.instrumentType?.toUpperCase().includes('COMPANY') || inst1?.instrumentType?.toUpperCase().includes('CA_');
        
        const targetDir = t1.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT';
        const targetAmount = t1.amount;

        // Look for match
        const match = candidates.find(t2 => {
            if (usedIds.has(t2.id) || t2.id === t1.id) return false;
            
            const inst2 = instruments[t2.instrumentId];
            const isCompany2 = inst2?.instrumentType?.toUpperCase().includes('COMPANY') || inst2?.instrumentType?.toUpperCase().includes('CA_');
            
            // Must be different actors
            if (isCompany1 === isCompany2) return false;

            // Must match amount
            if (Math.abs(t2.amount - targetAmount) > 1.0) return false; // allow 1 INR rounding

            // Must be within 7 days
            if (!t1.txnDate || !t2.txnDate) return false;
            const d1 = new Date(t1.txnDate).getTime();
            const d2 = new Date(t2.txnDate).getTime();
            const days = Math.abs(d1 - d2) / (1000 * 3600 * 24);
            
            return days <= 7;
        });

        if (match) {
            usedIds.add(t1.id);
            usedIds.add(match.id);
            
            const d1 = new Date(t1.txnDate!).getTime();
            const d2 = new Date(match.txnDate!).getTime();
            const days = Math.abs(d1 - d2) / (1000 * 3600 * 24);

            pairs.push({
                id: `pair_${t1.id}_${match.id}`,
                companyTxn: isCompany1 ? t1 : match,
                directorTxn: isCompany1 ? match : t1,
                confidence: days === 0 ? 'HIGH' : 'MEDIUM',
                amount: t1.amount,
                dateDiff: Math.floor(days)
            });
        }
    });

    return pairs;
};
