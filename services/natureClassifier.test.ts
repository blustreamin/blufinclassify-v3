
import { classifyTransactionNature, runNatureClassifierTests } from './natureClassifier';
import { Transaction, Instrument } from '../types';

// This file serves as the test plan implementation.
// In a real environment, this would be run via Jest/Vitest.
// Here, we provide the test logic that verifies the rules.

// --- SHIM FOR TEST RUNNER ---
// Defines minimal test runner to satisfy TS and allow runtime checks in browser console.
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
    not: {
        toBe: (expected: any) => {
            if (actual === expected) throw new Error(`Expected NOT '${expected}', received '${actual}'`);
        }
    }
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

const mockTxn = (desc: string): Partial<Transaction> => ({
    description: desc,
    amount: 100,
    txnDate: '2024-01-01',
    direction: 'DEBIT'
});

describe('Nature Classifier V1', () => {
    
    test('IT_INFRA_SAAS detection', () => {
        const i = mockInstrument('CC_COMPANY');
        expect(classifyTransactionNature(mockTxn("RAZBIG ROCK MUMBAI"), i).nature_v1).toBe('NATURE_IT_INFRA_SAAS');
        expect(classifyTransactionNature(mockTxn("FS DATAFORSEO LIMITED"), i).nature_v1).toBe('NATURE_IT_INFRA_SAAS');
        expect(classifyTransactionNature(mockTxn("DIGITALOCEANCOM NEW YORK"), i).nature_v1).toBe('NATURE_IT_INFRA_SAAS');
    });

    test('Guarded Keywords (Google/Apple)', () => {
        const i = mockInstrument('CC_COMPANY');
        // Valid IT
        expect(classifyTransactionNature(mockTxn("GOOGLE CLOUD"), i).nature_v1).toBe('NATURE_IT_INFRA_SAAS');
        expect(classifyTransactionNature(mockTxn("GOOGLE *SERVICES"), i).nature_v1).toBe('NATURE_IT_INFRA_SAAS');
        expect(classifyTransactionNature(mockTxn("APPLE.COM/BILL"), i).nature_v1).toBe('NATURE_IT_INFRA_SAAS');
        
        // Invalid (Ads/Play) should fallback or be generic, NOT IT_INFRA
        const adsResult = classifyTransactionNature(mockTxn("GOOGLE ADS"), i).nature_v1;
        expect(adsResult).not.toBe('NATURE_IT_INFRA_SAAS'); 
    });

    test('Suffix Normalization (Pay in EMIs)', () => {
        const i = mockInstrument('CC_PERSONAL');
        // "MAKEMYTRIP (Pay in EMIs)" should trigger TRAVEL, not LOAN
        const res = classifyTransactionNature(mockTxn("CAS*MAKEMYTRIP INDIA PVT (Pay in EMIs)"), i);
        expect(res.nature_v1).toBe('NATURE_TRAVEL_BOOKING');
        
        // "IKEA (Pay in EMIs)" -> Should NOT be LOAN_REPAYMENT just because of EMI tag
        // Since IKEA isn't in rule list, it should default to OPERATING_EXPENSE (Legacy) or UNKNOWN
        const res2 = classifyTransactionNature(mockTxn("IKEA INDIA (Pay in EMIs)"), i);
        expect(res2.nature_v1).not.toBe('NATURE_LOAN_REPAYMENT');
    });

    test('Personal Shopping', () => {
        const i = mockInstrument('CC_PERSONAL');
        expect(classifyTransactionNature(mockTxn("ZUDIO / TRENT"), i).nature_v1).toBe('NATURE_PERSONAL_SHOPPING');
        expect(classifyTransactionNature(mockTxn("H&M RETAIL"), i).nature_v1).toBe('NATURE_PERSONAL_SHOPPING');
    });

    test('Loan Repayment', () => {
        const i = mockInstrument('SB_PERSONAL');
        expect(classifyTransactionNature(mockTxn("IMPS P2A BAJAJFINANCELIMITED"), i).nature_v1).toBe('NATURE_LOAN_REPAYMENT');
        expect(classifyTransactionNature(mockTxn("HERO FINCORP EMI"), i).nature_v1).toBe('NATURE_LOAN_REPAYMENT');
    });

    test('Cash Withdrawal', () => {
        const i = mockInstrument('SB_PERSONAL');
        expect(classifyTransactionNature(mockTxn("ATM CASH AXIS BANK"), i).nature_v1).toBe('NATURE_CASH_WITHDRAWAL');
    });

    test('Local Travel', () => {
        const i = mockInstrument('CC_PERSONAL');
        expect(classifyTransactionNature(mockTxn("UBER INDIA SYSTEMS"), i).nature_v1).toBe('NATURE_LOCAL_TRAVEL');
        expect(classifyTransactionNature(mockTxn("OLA RIDES"), i).nature_v1).toBe('NATURE_LOCAL_TRAVEL');
    });
});

// Helper for non-Jest environments to self-verify
if (typeof window !== 'undefined') {
    (window as any).runNatureTests = runNatureClassifierTests;
}
