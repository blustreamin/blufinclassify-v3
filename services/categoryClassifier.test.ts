
import { computeDeterministicSuggestionV1 } from './categoryClassifier';
import { Transaction, Instrument } from '../types';

// --- SHIM FOR TEST RUNNER ---
const describe = (name: string, fn: () => void) => {
    if (typeof console !== 'undefined' && console.group) console.group(`TEST SUITE: ${name}`);
    try { fn(); } catch (e) { console.error(e); }
    if (typeof console !== 'undefined' && console.groupEnd) console.groupEnd();
};

const test = (name: string, fn: () => void) => {
    try {
        fn();
        if (typeof console !== 'undefined') console.log(`%c PASS %c ${name}`, 'color: #22c55e; font-weight: bold;', 'color: inherit;');
    } catch (e: any) {
        if (typeof console !== 'undefined') console.error(`%c FAIL %c ${name} - ${e.message}`, 'color: #ef4444; font-weight: bold;', 'color: inherit;');
    }
};

const expect = (actual: any) => ({
    toBe: (expected: any) => {
        if (actual !== expected) throw new Error(`Expected '${expected}', received '${actual}'`);
    },
});
// -----------------------------

const mockInstrument = (type: string): Instrument => ({
    id: 'test_inst',
    name: 'Test Instrument',
    institution: 'TestBank',
    instrumentType: type,
    allowedFileTypes: ['CSV'],
    tileKey: 'test',
    strictMatchTokens: [],
    parser: 'csv_generic'
});

const mockTxn = (desc: string, nature: any, scope?: any): Partial<Transaction> => ({
    description: desc,
    amount: 100,
    txnDate: '2024-01-01',
    direction: 'DEBIT',
    nature_v1: nature,
    nature_confidence_v1: 0.9,
    classificationStatus: 'UNCLASSIFIED'
});

describe('Deterministic Category Suggestions V1', () => {
    
    test('MAKEMYTRIP (Pay in EMIs) -> Travel (NOT Loan)', () => {
        const i = mockInstrument('CC_PERSONAL');
        const t = mockTxn("CAS*MAKEMYTRIP INDIA PVT (Pay in EMIs)", 'NATURE_TRAVEL_BOOKING');
        const res = computeDeterministicSuggestionV1(t, i);
        
        expect(res.suggested_category_v1).toBe('PERSONAL_INTERCITY_TRAVEL');
        expect(res.suggested_entity_canonical_v1).toBe('MAKEMYTRIP');
        expect(res.suggested_scope_v1).toBe('Personal');
    });

    test('BAJAJFINANCELIMITED -> Personal Loan EMI', () => {
        const i = mockInstrument('SB_PERSONAL');
        const t = mockTxn("IMPS P2A BAJAJFINANCELIMITED", 'NATURE_LOAN_REPAYMENT');
        const res = computeDeterministicSuggestionV1(t, i);
        
        expect(res.suggested_category_v1).toBe('PERSONAL_LOAN_EMI');
        expect(res.suggested_entity_canonical_v1).toBe('BAJAJ FINANCE');
    });

    test('GOOGLE w/out ADS -> IT Infrastructure (Company)', () => {
        const i = mockInstrument('CC_COMPANY');
        const t = mockTxn("GOOGLE CLOUD", 'NATURE_IT_INFRA_SAAS');
        const res = computeDeterministicSuggestionV1(t, i);
        
        expect(res.suggested_category_v1).toBe('IT_INFRASTRUCTURE');
        expect(res.suggested_scope_v1).toBe('Company');
        expect(res.suggested_entity_canonical_v1).toBe('GOOGLE');
    });

    test('ZUDIO on Company Instrument -> Conservative Fallback', () => {
        const i = mockInstrument('CC_COMPANY');
        const t = mockTxn("ZUDIO TRENT", 'NATURE_PERSONAL_SHOPPING');
        const res = computeDeterministicSuggestionV1(t, i);
        
        expect(res.suggested_category_v1).toBe('OTHER_COMPANY_EXPENSE'); // Not Personal Shopping
        expect(res.suggested_scope_v1).toBe('Company'); // Scope stays company
        expect(res.suggested_entity_canonical_v1).toBe('ZUDIO');
    });

    test('BIGROCK -> IT Infrastructure', () => {
        const i = mockInstrument('CC_COMPANY');
        const t = mockTxn("BIGROCK", 'NATURE_IT_INFRA_SAAS');
        const res = computeDeterministicSuggestionV1(t, i);
        
        expect(res.suggested_category_v1).toBe('IT_INFRASTRUCTURE');
        expect(res.suggested_entity_canonical_v1).toBe('BIGROCK');
    });
});

if (typeof window !== 'undefined') {
    (window as any).runCategoryTests = () => {
        console.log("Running Category Tests...");
        // Manual trigger if needed
    };
}
