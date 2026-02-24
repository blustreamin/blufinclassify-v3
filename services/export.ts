
import { Transaction, AppState, Document, Instrument } from '../types';

const escapeCsv = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

const normalizeDate = (isoDate: string | null): string => isoDate || '';

// Heuristic to extract a raw date string from the raw description line if possible
const extractRawDate = (rawLine: string): string => {
    if (!rawLine) return '';
    // Look for common date patterns
    const match = rawLine.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/) || 
                  rawLine.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/i);
    return match ? match[0] : '';
};

const computeFlags = (txn: Transaction, monthContext: string | undefined): string[] => {
    const flags: string[] = [];
    
    // 1. DATE_OUT_OF_RANGE
    if (txn.txnDate) {
        if (monthContext && !txn.txnDate.startsWith(monthContext)) {
            flags.push('DATE_OUT_OF_RANGE');
        }
        const year = parseInt(txn.txnDate.substring(0, 4));
        if (year < 2000 || year > 2030) {
            flags.push('DATE_SUSPICIOUS_YEAR');
        }
    } else {
        flags.push('DATE_MISSING');
    }

    // 2. AMOUNT_ZERO_SUSPECT
    if (txn.amount === 0) {
        flags.push('AMOUNT_ZERO_SUSPECT');
    }

    // 3. DATE_FORMAT_AMBIGUOUS (Heuristic based on raw line if available)
    if (txn.descriptionRaw) {
        const rawDate = extractRawDate(txn.descriptionRaw);
        if (rawDate && /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(rawDate)) {
             // If raw is like 01/02/2024, it's ambiguous without locale context
             const parts = rawDate.split(/[/-]/);
             if (parseInt(parts[0]) <= 12 && parseInt(parts[1]) <= 12 && parts[0] !== parts[1]) {
                 flags.push('DATE_FORMAT_AMBIGUOUS');
             }
        }
    }

    // 4. PARSE_FAILED_ROW
    if (!txn.txnDate && txn.amount === 0 && (txn.description === 'Manual Entry' || txn.description === '')) {
        flags.push('PARSE_FAILED_ROW');
    }

    return flags;
};

export const exportLedgerToCsv = (
    txns: Transaction[], 
    state: AppState, 
    type: 'CURRENT' | 'FULL' | 'DEBUG', 
    monthContext?: string
): void => {
    
    const headers = [
        'txn_id',
        'instrument_id',
        'instrument_name',
        'instrument_type',
        'entity',
        'period_selected',
        'month_bucket',
        'txn_date_raw',
        'txn_date_iso',
        'date_parse_status',
        'description',
        'description_raw',
        'amount_raw',
        'amount_value',
        'amount_parse_status',
        'direction',
        'category',
        'status',
        'source_file_name',
        'source_file_type',
        'parse_method',
        'confidence',
        'notes',
        'audit_log_count'
    ];

    const rows = txns.map(txn => {
        const inst = state.registry.instruments[txn.instrumentId];
        const doc = txn.sourceDocumentId ? state.documents.byId[txn.sourceDocumentId] : null;
        
        const rawDate = extractRawDate(txn.descriptionRaw);
        const flags = computeFlags(txn, type === 'CURRENT' ? monthContext : undefined);

        // Determine Entity (Simple heuristic based on instrument type)
        let entity = '';
        if (inst?.instrumentType.includes('COMPANY')) entity = 'COMPANY';
        else if (inst?.instrumentType.includes('PERSONAL')) entity = 'PERSONAL';

        // Parse Methods logic (approximated from doc status or flags)
        let parseMethod = '';
        if (doc) {
            // Document type usually implies method unless we track "OCR" flag deeper. 
            // In types.ts we don't store "parseMethod" explicitly on Document or Txn, 
            // but we can infer from fileType or tags.
            if (doc.fileType === 'PDF') parseMethod = 'PDF_TEXT_OR_OCR';
            else if (doc.fileType === 'IMAGE') parseMethod = 'OCR';
            else parseMethod = 'TABULAR';
        }
        if (txn.tags.includes('MANUAL_BULK')) parseMethod = 'MANUAL_BULK';
        if (txn.tags.includes('MANUAL')) parseMethod = 'MANUAL';

        return [
            txn.id,
            txn.instrumentId,
            inst?.name || 'Unknown',
            inst?.instrumentType || 'UNKNOWN',
            entity,
            monthContext || '',
            txn.month || '',
            rawDate || '', // txn_date_raw (best effort)
            normalizeDate(txn.txnDate),
            txn.txnDate ? 'OK' : 'MISSING',
            txn.description,
            txn.descriptionRaw,
            '', // amount_raw (not stored explicitly separate from normalized, descriptionRaw is best proxy)
            txn.amount,
            txn.amount !== undefined ? 'OK' : 'MISSING',
            txn.direction,
            txn.categoryCode || 'Uncategorized',
            txn.status,
            doc?.fileName || '',
            doc?.fileType || '',
            parseMethod,
            txn.confidence,
            flags.join('; '), // notes
            txn.auditLog ? txn.auditLog.length : 0
        ].map(escapeCsv).join(',');
    });

    const csvContent = '\ufeff' + [headers.join(','), ...rows].join('\r\n');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let filename = `blufin_ledger_${type}_${timestamp}.csv`;
    if (type === 'CURRENT' && monthContext) {
        filename = `blufin_ledger_${monthContext}_VIEW_${timestamp}.csv`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
