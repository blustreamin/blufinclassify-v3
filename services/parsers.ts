
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { ParsedResult, Transaction, Document, DateResolutionMetadata, AmountResolutionMetadata, DescriptionResolutionMetadata } from '../types';
import { OCRService } from './ocr';
import { normalizeDate, normalizeAmount, cleanDescription, getMonthFromDate, getFinancialYear, resolveTransactionDate, resolveTransactionAmount, resolveDescription, fileToBase64, generateId, isGarbageRow } from './utils';
import { analyzeImageForTransaction } from './geminiService';

// Configure PDF Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs';

// --- ROUTING TABLE ---
type ParserId = 'icici_cc_csv_v2' | 'icici_xls_v2' | 'icici_ca_csv_v2' | 'generic_image_ocr_v1' | 'pdf_text_v1' | 'csv_generic_v1' | 'axis_xls_v1' | 'gemini_vision_v1';

const ROUTING_TABLE: Record<string, Partial<Record<Document['fileType'], ParserId>>> = {
    'icici_cc_corporate': {
        'CSV': 'icici_cc_csv_v2',
        'XLS': 'icici_xls_v2',
        'XLSX': 'icici_xls_v2',
        'PDF': 'pdf_text_v1' // Legacy
    },
    'icici_sb_personal': {
        'XLS': 'icici_xls_v2',
        'XLSX': 'icici_xls_v2',
        'CSV': 'csv_generic_v1'
    },
    'icici_ca_company': {
        'XLS': 'icici_xls_v2',
        'XLSX': 'icici_xls_v2',
        'CSV': 'icici_ca_csv_v2'
    },
    'axis_sb_personal': {
        'XLS': 'axis_xls_v1',
        'XLSX': 'axis_xls_v1',
        'CSV': 'csv_generic_v1'
    },
    'axis_ca_company': {
         'XLS': 'axis_xls_v1',
         'XLSX': 'axis_xls_v1',
         'CSV': 'csv_generic_v1'
    },
    'lazypay_bnpl_personal': {
        'IMAGE': 'gemini_vision_v1',
        'PDF': 'gemini_vision_v1'
    },
    'simpl_bnpl_personal': {
        'IMAGE': 'gemini_vision_v1',
        'PDF': 'gemini_vision_v1'
    },
    // Updated: Route RBL/Tata to Gemini Vision
    'tata_cc_sbi': {
        'IMAGE': 'gemini_vision_v1',
        'PDF': 'gemini_vision_v1'
    },
    'rbl_pm_cc': {
        'IMAGE': 'gemini_vision_v1',
        'PDF': 'gemini_vision_v1'
    },
    'rbl_pss_cc': {
        'IMAGE': 'gemini_vision_v1',
        'PDF': 'gemini_vision_v1'
    }
};

// Helper to determine instrument type for Date Strategy from ID
const getInstrumentTypeHint = (instrumentId: string): string => {
    if (instrumentId.includes('_cc_')) return 'CC';
    if (instrumentId.includes('_sb_')) return 'SB';
    if (instrumentId.includes('_ca_')) return 'CA';
    if (instrumentId.includes('_bnpl_')) return 'BNPL';
    return 'UNKNOWN';
};

// --- IMPLEMENTATIONS ---

// 1. ICICI Corporate CC CSV V2
const parseIciciCcCsvV2 = async (file: File, instrumentId: string): Promise<ParsedResult> => {
    const text = await file.text();
    const warnings: string[] = [];
    const typeHint = getInstrumentTypeHint(instrumentId);
    
    const parseRes = Papa.parse(text, { skipEmptyLines: true, header: false });
    const rows = parseRes.data as string[][];

    // Find Header
    let headerIdx = -1;
    let map: Record<string, number> = {};

    for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const row = rows[i].map(c => c?.toLowerCase().trim() || '');
        const hasDate = row.some(c => c === 'date' || c === 'transaction date');
        const hasAmt = row.some(c => c.includes('amount'));
        const hasDesc = row.some(c => c.includes('transaction') || c.includes('details'));

        if (hasDate && (hasAmt || hasDesc)) {
            headerIdx = i;
            row.forEach((col, idx) => {
                if (col.match(/date/)) map['date'] = idx;
                else if (col.match(/transaction/) || col.match(/details/)) map['desc'] = idx;
                else if (col.match(/amount/) && !col.match(/sign/)) map['amt'] = idx;
                else if (col.match(/sign/) || col.match(/dr\/cr/)) map['sign'] = idx;
                else if (col.match(/ref/)) map['ref'] = idx;
            });
            break;
        }
    }

    if (headerIdx === -1) {
        return { 
            docMeta: { extractedInstitutionName: 'ICICI' }, 
            txns: [], 
            warnings: ['HEADER_NOT_FOUND_ICICI_CSV'], 
            parseReport: createReport('CSV', 'HeaderScanFail', 0) 
        };
    }

    const txns: (Transaction & { counterpartyNameGuess?: string | null })[] = [];
    const dateStats = { level1_Explicit: 0, level2_Header: 0, level3_Filled: 0, level4_Missing: 0 };
    const amountStats = { level1_Explicit: 0, level2_Split: 0, level3_Text: 0, level4_Balance: 0, level5_Missing: 0 };
    const descStats = { total: 0, merchantIdentified: 0, lowConfidence: 0, bankCharges: 0, bnplMerchants: 0 };
    let lastDate: string | null = null;
    
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2) continue;

        const dateRaw = map['date'] !== undefined ? row[map['date']] : '';
        const amtRaw = map['amt'] !== undefined ? row[map['amt']] : undefined;
        const descRaw = map['desc'] !== undefined ? row[map['desc']] : '';
        const signRaw = map['sign'] !== undefined ? row[map['sign']] : undefined;

        if (!dateRaw && !amtRaw) continue;

        const dateRes = resolveTransactionDate(dateRaw, typeHint, lastDate, null);
        if (dateRes.date) lastDate = dateRes.date;
        
        const amountRes = resolveTransactionAmount(
            { amount: amtRaw, sign: signRaw },
            { description: descRaw, instrumentType: typeHint }
        );

        const descRes = resolveDescription(descRaw, typeHint);

        if (dateRes.metadata.level === 'LEVEL_1_ROW') dateStats.level1_Explicit++;
        else if (dateRes.metadata.level === 'LEVEL_2_HEADER') dateStats.level2_Header++;
        else if (dateRes.metadata.level === 'LEVEL_3_FILL') dateStats.level3_Filled++;
        else dateStats.level4_Missing++;

        if (amountRes.metadata.level === 'LEVEL_1_EXPLICIT') amountStats.level1_Explicit++;
        else if (amountRes.metadata.level === 'LEVEL_2_SPLIT') amountStats.level2_Split++;
        else if (amountRes.metadata.level === 'LEVEL_3_TEXT') amountStats.level3_Text++;
        else if (amountRes.metadata.level === 'LEVEL_4_BALANCE') amountStats.level4_Balance++;
        else amountStats.level5_Missing++;

        descStats.total++;
        if (descRes.metadata.merchantName) descStats.merchantIdentified++;
        if (descRes.metadata.confidence === 'LOW') descStats.lowConfidence++;
        if (descRes.metadata.isBankCharge) descStats.bankCharges++;

        // GLOBAL ZERO AMOUNT DETECTOR: Skip if amount is 0
        if (amountRes.amount === 0) continue;

        const isDraft = !dateRes.date || !descRes.description;
        const issues = [];
        if (dateRes.metadata.issue) issues.push(dateRes.metadata.issue);
        if (amountRes.metadata.issue) issues.push(amountRes.metadata.issue);
        if (descRes.metadata.issues) issues.push(...descRes.metadata.issues);

        txns.push(createTxn({
            instrumentId,
            txnDate: dateRes.date,
            dateMetadata: dateRes.metadata,
            description: descRes.description,
            descriptionRaw: descRaw,
            descriptionMetadata: descRes.metadata, 
            amount: amountRes.amount,
            amountMetadata: amountRes.metadata,
            direction: amountRes.direction,
            counterpartyNameGuess: descRes.metadata.merchantName,
            status: isDraft ? 'draft' : 'reviewed',
            needsAttention: isDraft,
            issues,
            parserId: 'icici_cc_csv_v2',
            rawRow: row 
        }));
    }

    const report = createReport('CSV', 'IciciCcCsvV2', txns.length, ['HeaderFound']);
    report.dateStats = dateStats;
    report.amountStats = amountStats;
    report.descriptionStats = descStats;

    return {
        docMeta: { extractedInstitutionName: 'ICICI' },
        txns,
        warnings,
        parseReport: report
    };
};

const parseIciciXlsV2 = async (file: File, instrumentId: string): Promise<ParsedResult> => {
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    const typeHint = getInstrumentTypeHint(instrumentId);

    // 1. Scan first 20 rows for header based on keyword density
    let headerIdx = -1;
    let map: Record<string, number> = {};
    const KEYWORDS = ['date', 'transaction', 'amount', 'debit', 'credit', 'withdrawal', 'deposit', 'particulars', 'description'];
    const matchedAnchors: string[] = [];

    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i].map(c => String(c).toLowerCase().trim());
        const matchCount = KEYWORDS.reduce((acc, k) => acc + (row.some(c => c.includes(k)) ? 1 : 0), 0);
        
        if (matchCount >= 2) {
            headerIdx = i;
            matchedAnchors.push('HeaderFound_KeywordMatch');
            row.forEach((col, idx) => {
                // DATE
                if (col.includes('transaction date') || col === 'txn date') map['date_primary'] = idx;
                else if (col.includes('value date')) map['date_secondary'] = idx;
                else if (col === 'date') map['date_tertiary'] = idx;
                
                // DESCRIPTION
                if ((col.includes('details') || col.includes('particular') || col.includes('narration') || col.includes('description') || col.includes('remarks')) && !col.includes('date')) map['desc'] = idx;
                
                // AMOUNT COLUMNS (Dual Amount Fix)
                if (col.includes('billingamountsign')) map['sign'] = idx;
                else if (col.includes('withdrawal') || col.includes('debit') || col === 'dr') map['dr'] = idx;
                else if (col.includes('deposit') || col.includes('credit') || col === 'cr') map['cr'] = idx;
                else if (col.includes('amount') && !col.includes('total') && !col.includes('sign') && !col.includes('balance')) map['amt'] = idx;
            });
            if ((map['date_primary'] !== undefined || map['date_secondary'] !== undefined || map['date_tertiary'] !== undefined) && 
                (map['amt'] !== undefined || (map['dr'] !== undefined && map['cr'] !== undefined) || map['desc'] !== undefined)) {
                break;
            }
        }
    }

    if (headerIdx === -1) {
         return { docMeta: { extractedInstitutionName: 'ICICI' }, txns: [], warnings: ['HEADER_FAIL_ICICI_XLS'], parseReport: createReport('XLS', 'HeaderFail', 0) };
    }

    const txns: (Transaction & { counterpartyNameGuess?: string | null })[] = [];
    const idxDate = map['date_primary'] ?? map['date_secondary'] ?? map['date_tertiary'];
    const idxDesc = map['desc'];
    let lastDate: string | null = null;
    const dateStats = { level1_Explicit: 0, level2_Header: 0, level3_Filled: 0, level4_Missing: 0 };
    const amountStats = { level1_Explicit: 0, level2_Split: 0, level3_Text: 0, level4_Balance: 0, level5_Missing: 0 };
    const descStats = { total: 0, merchantIdentified: 0, lowConfidence: 0, bankCharges: 0, bnplMerchants: 0 };

    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const dateRaw = idxDate !== undefined ? row[idxDate] : null;
        const descRaw = idxDesc !== undefined ? row[idxDesc] : '';
        const amtRaw = map['amt'] !== undefined ? row[map['amt']] : undefined;
        const signRaw = map['sign'] !== undefined ? row[map['sign']] : undefined;
        const drRaw = map['dr'] !== undefined ? row[map['dr']] : undefined;
        const crRaw = map['cr'] !== undefined ? row[map['cr']] : undefined;

        if (!dateRaw && !descRaw) continue;

        const dateRes = resolveTransactionDate(dateRaw, typeHint, lastDate, null);
        if (dateRes.date) lastDate = dateRes.date;

        const amountInput: any = { amount: amtRaw, debit: drRaw, credit: crRaw, sign: signRaw };
        if (signRaw) {
             const s = String(signRaw).toUpperCase();
             if (s === 'CR') amountInput.sign = 'CREDIT';
             else if (s === 'DR') amountInput.sign = 'DEBIT';
        }
        
        // ICICI Dual Amount Fix happens within resolveTransactionAmount via debit/credit inputs or below
        const amountRes = resolveTransactionAmount(amountInput, { description: String(descRaw), instrumentType: typeHint });
        const descRes = resolveDescription(String(descRaw), typeHint);

        // GLOBAL ZERO-AMOUNT DETECTOR (REJECT)
        if (amountRes.amount === 0) continue;
        // UNDEFINED DESCRIPTION REJECT
        if (!descRes.description || descRes.description.toUpperCase() === 'UNDEFINED') continue;

        if (dateRes.metadata.level === 'LEVEL_1_ROW') dateStats.level1_Explicit++;
        else if (dateRes.metadata.level === 'LEVEL_2_HEADER') dateStats.level2_Header++;
        else if (dateRes.metadata.level === 'LEVEL_3_FILL') dateStats.level3_Filled++;
        else dateStats.level4_Missing++;

        if (amountRes.metadata.level === 'LEVEL_1_EXPLICIT') amountStats.level1_Explicit++;
        else if (amountRes.metadata.level === 'LEVEL_2_SPLIT') amountStats.level2_Split++;
        else if (amountRes.metadata.level === 'LEVEL_3_TEXT') amountStats.level3_Text++;
        else if (amountRes.metadata.level === 'LEVEL_4_BALANCE') amountStats.level4_Balance++;
        else amountStats.level5_Missing++;

        descStats.total++;
        if (descRes.metadata.merchantName) descStats.merchantIdentified++;
        if (descRes.metadata.confidence === 'LOW') descStats.lowConfidence++;

        const isDraft = !dateRes.date;
        const issues = [];
        if (dateRes.metadata.issue) issues.push(dateRes.metadata.issue);
        if (amountRes.metadata.issue) issues.push(amountRes.metadata.issue);
        if (descRes.metadata.issues) issues.push(...descRes.metadata.issues);

        txns.push(createTxn({
            instrumentId,
            txnDate: dateRes.date,
            dateMetadata: dateRes.metadata,
            description: descRes.description,
            descriptionRaw: String(descRaw),
            descriptionMetadata: descRes.metadata,
            amount: amountRes.amount,
            amountMetadata: amountRes.metadata,
            direction: amountRes.direction,
            counterpartyNameGuess: descRes.metadata.merchantName,
            status: isDraft ? 'draft' : 'reviewed',
            needsAttention: isDraft,
            issues,
            parserId: 'icici_xls_v2_surgical',
            rawRow: row 
        }));
    }
    const report = createReport('XLS', 'IciciXlsV2_Surgical', txns.length, matchedAnchors);
    report.dateStats = dateStats;
    report.amountStats = amountStats;
    report.descriptionStats = descStats;
    return { docMeta: { extractedInstitutionName: 'ICICI' }, txns, warnings: [], parseReport: report };
};

const parseAxisXlsV1 = async (file: File, instrumentId: string): Promise<ParsedResult> => {
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    const typeHint = getInstrumentTypeHint(instrumentId);
    let headerIdx = -1;
    let map: Record<string, number> = {};
    const matchedAnchors: string[] = [];
    
    // STOP TERMS (Axis Tabular Boundary Detection)
    const STOP_TERMS = [
        'unless the constituent notifies',
        'this is a system generated',
        'legend',
        'registered office',
        'branch address',
        'the closing balance',
        'non-cts',
        'guidelines',
        'important',
        'end of statement',
        'total amount due'
    ];

    for (let i = 0; i < Math.min(rows.length, 25); i++) {
        const row = rows[i].map(c => String(c).toLowerCase().trim());
        if (row.some(c => c.includes('transaction date') || c.includes('value date') || c === 'tran date')) {
            headerIdx = i;
            matchedAnchors.push('HeaderFound');
            row.forEach((col, idx) => {
                if (col.includes('transaction date') || col === 'tran date') map['date'] = idx;
                else if (col.includes('particular') || col.includes('narration') || col.includes('description')) map['desc'] = idx;
                else if (col.includes('debit') || col.includes('dr')) map['dr'] = idx;
                else if (col.includes('credit') || col.includes('cr')) map['cr'] = idx;
                else if (col.includes('amount') && !col.includes('balance')) map['amt'] = idx; 
            });
            break;
        }
    }
    if (headerIdx === -1) return { docMeta: { extractedInstitutionName: null }, txns: [], warnings: ['HEADER_FAIL_AXIS_XLS'], parseReport: createReport('XLS', 'HeaderFail', 0) };
    
    const txns: (Transaction & { counterpartyNameGuess?: string | null })[] = [];
    const dateStats = { level1_Explicit: 0, level2_Header: 0, level3_Filled: 0, level4_Missing: 0 };
    const amountStats = { level1_Explicit: 0, level2_Split: 0, level3_Text: 0, level4_Balance: 0, level5_Missing: 0 };
    const descStats = { total: 0, merchantIdentified: 0, lowConfidence: 0, bankCharges: 0, bnplMerchants: 0 };
    let lastDate: string | null = null;
    let consecutiveGarbageRows = 0;

    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        // CHECK STOP SIGNALS
        const rowText = row.join(' ').toLowerCase();
        if (STOP_TERMS.some(term => rowText.includes(term))) {
            break; // Stop parsing entirely
        }

        let dateRaw = map['date'] !== undefined ? row[map['date']] : null;
        const descRaw = map['desc'] !== undefined ? row[map['desc']] : '';
        const drRaw = map['dr'] !== undefined ? row[map['dr']] : undefined;
        const crRaw = map['cr'] !== undefined ? row[map['cr']] : undefined;
        const amtRaw = map['amt'] !== undefined ? row[map['amt']] : undefined;

        const dateRes = resolveTransactionDate(dateRaw, typeHint, lastDate, null);
        const amountRes = resolveTransactionAmount({ amount: amtRaw, debit: drRaw, credit: crRaw }, { description: String(descRaw), instrumentType: typeHint });
        
        // ROW SHAPE BREAK DETECTION
        // If date invalid AND amount 0/null AND description is weird/blank -> potential garbage/footer
        if (!dateRes.date && amountRes.amount === 0) {
            consecutiveGarbageRows++;
            if (consecutiveGarbageRows >= 2) break; // Break if table structure disintegrates
            continue;
        }
        consecutiveGarbageRows = 0; // Reset if we found a valid looking row

        // GLOBAL ZERO-AMOUNT DETECTOR
        if (amountRes.amount === 0) continue;
        
        if (dateRes.date) lastDate = dateRes.date;
        const descRes = resolveDescription(String(descRaw), typeHint);
        
        // UNDEFINED DESCRIPTION REJECT
        if (!descRes.description || descRes.description.toUpperCase() === 'UNDEFINED') continue;

        if (dateRes.metadata.level === 'LEVEL_1_ROW') dateStats.level1_Explicit++;
        else if (dateRes.metadata.level === 'LEVEL_2_HEADER') dateStats.level2_Header++;
        else if (dateRes.metadata.level === 'LEVEL_3_FILL') dateStats.level3_Filled++;
        else dateStats.level4_Missing++;
        if (amountRes.metadata.level === 'LEVEL_1_EXPLICIT') amountStats.level1_Explicit++;
        else if (amountRes.metadata.level === 'LEVEL_2_SPLIT') amountStats.level2_Split++;
        else if (amountRes.metadata.level === 'LEVEL_3_TEXT') amountStats.level3_Text++;
        else if (amountRes.metadata.level === 'LEVEL_4_BALANCE') amountStats.level4_Balance++;
        else amountStats.level5_Missing++;
        descStats.total++;
        if (descRes.metadata.merchantName) descStats.merchantIdentified++;
        if (descRes.metadata.confidence === 'LOW') descStats.lowConfidence++;
        
        const isDraft = !dateRes.date;
        const issues = [];
        if (dateRes.metadata.issue) issues.push(dateRes.metadata.issue);
        if (amountRes.metadata.issue) issues.push(amountRes.metadata.issue);
        if (descRes.metadata.issues) issues.push(...descRes.metadata.issues);
        
        txns.push(createTxn({
            instrumentId,
            txnDate: dateRes.date,
            dateMetadata: dateRes.metadata,
            description: descRes.description,
            descriptionRaw: String(descRaw),
            descriptionMetadata: descRes.metadata,
            amount: amountRes.amount,
            amountMetadata: amountRes.metadata,
            direction: amountRes.direction,
            counterpartyNameGuess: descRes.metadata.merchantName,
            status: isDraft ? 'draft' : 'reviewed',
            needsAttention: isDraft,
            issues,
            parserId: 'axis_xls_v1_surgical',
            rawRow: row
        }));
    }
    const report = createReport('XLS', 'AxisXlsV1_Surgical', txns.length, [...new Set(matchedAnchors)]);
    report.dateStats = dateStats;
    report.amountStats = amountStats;
    report.descriptionStats = descStats;
    return { docMeta: { extractedInstitutionName: 'Axis Bank' }, txns, warnings: [], parseReport: report };
};

const parseGenericImageOcrV1 = async (file: File, instrumentId: string, options?: { forceMethod?: string }): Promise<ParsedResult> => {
    // ... existing implementation ...
    let text = "";
    let method: any = file.type === 'application/pdf' ? 'PDF_OCR' : 'IMAGE_OCR';
    let pages = 0;
    const typeHint = getInstrumentTypeHint(instrumentId);
    if (file.type === 'application/pdf') {
        const res = await OCRService.recognizePDF(file);
        text = res.text;
        pages = res.pages;
    } else {
        const ocrOpts = { psm: 6, scale: 2.5 };
        text = await OCRService.recognize(file, ocrOpts);
        pages = 1;
    }
    const lines = text.split('\n');
    const txns: (Transaction & { counterpartyNameGuess?: string | null })[] = [];
    const dateStats = { level1_Explicit: 0, level2_Header: 0, level3_Filled: 0, level4_Missing: 0 };
    const amountStats = { level1_Explicit: 0, level2_Split: 0, level3_Text: 0, level4_Balance: 0, level5_Missing: 0 };
    const descStats = { total: 0, merchantIdentified: 0, lowConfidence: 0, bankCharges: 0, bnplMerchants: 0 };
    let lastDate: string | null = null;
    let headerMonthHint: string | null = null;
    let currentYearContext: number = new Date().getFullYear();
    const isRBL = instrumentId.includes('rbl');
    const isTata = instrumentId.includes('tata');
    const isBNPL = instrumentId.includes('lazypay') || instrumentId.includes('simpl') || instrumentId.includes('bnpl');
    const isImageFirst = isRBL || isTata || isBNPL;
    let tableActive = !isRBL && !isTata; 
    const headerDateRegex = /^(?:Statement\s+for\s*:?\s*)?(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[.,\s]+[']?(\d{2,4})/i;
    lines.forEach(line => {
        const clean = line.replace(/\s+/g, ' ').trim();
        if (clean.length < 3) return;
        if (isRBL) {
             if (clean.match(/THE MONTH GONE BY/i)) { tableActive = true; return; }
             if (tableActive && clean.match(/(Reward Summary|Account Summary|Points Summary|Total Amount Due)/i)) { tableActive = false; return; }
        }
        if (isTata) {
             if (clean.match(/Transaction Details/i)) { tableActive = true; return; }
             if (tableActive && clean.match(/(Reward Points|Summary|Total Due|Payment Due)/i)) { tableActive = false; return; }
        }
        const headerMatch = clean.match(headerDateRegex);
        if (headerMatch) {
             const monStr = headerMatch[1].toLowerCase();
             const yrStr = headerMatch[2].length === 2 ? '20' + headerMatch[2] : headerMatch[2];
             const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12', january: '01', february: '02', march: '03', april: '04', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };
            let m = months[monStr] || months[monStr.substring(0, 3)];
            if (m) { headerMonthHint = `${yrStr}-${m}`; currentYearContext = parseInt(yrStr); }
        }
        if (isImageFirst && !tableActive) return;
        if (clean.match(/^(Date|Description|Amount|Transaction|Particulars)/i)) return;
        let bnplExtracted = false;
        let bnplDesc = "";
        let bnplAmt = 0;
        let bnplDir: "DEBIT" | "CREDIT" = "DEBIT";
        if (isBNPL) {
             const bnplMatch = clean.match(/^(.*?)\s*[-]\s*([₹+\-]?\s*[\d,]+(?:\.\d{1,2})?)(?:\s.*)?$/);
             if (bnplMatch) {
                 const descPart = bnplMatch[1].trim();
                 const amtPart = bnplMatch[2].replace(/[^\d.]/g, '');
                 const val = parseFloat(amtPart);
                 if (!isNaN(val) && val > 0 && descPart.length > 2) {
                     bnplExtracted = true;
                     bnplDesc = descPart;
                     bnplAmt = val;
                     if (descPart.toLowerCase().includes('repayment') || descPart.toLowerCase().includes('payment received')) {
                         bnplDir = 'CREDIT';
                     }
                 }
             }
        }
        const dateRegex = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+'?\d{2,4})/i;
        const dmy = clean.match(dateRegex);
        let extractedDateStr = dmy ? dmy[0] : "";
        if (!extractedDateStr && headerMonthHint) {
            const dayMatch = clean.match(/^(\d{1,2})\b/);
            if (dayMatch) {
                const d = parseInt(dayMatch[1]);
                if (d > 0 && d <= 31) { extractedDateStr = `${headerMonthHint}-${dayMatch[1].padStart(2, '0')}`; }
            }
        }
        let extractedAmt = undefined;
        let suffix = '';
        let amtMatch = null;
        if (!bnplExtracted) {
            const amtRegex = /(?:Rs\.?|₹|INR)?\s*([\d,]+\.?\d{0,2})\s*(Cr|Dr|C|D)?/gi; 
            const matches = [...clean.matchAll(amtRegex)];
            amtMatch = matches.length > 0 ? matches[matches.length - 1] : null;
            if (amtMatch) { extractedAmt = amtMatch[1]; suffix = amtMatch[2] ? amtMatch[2].toUpperCase() : ''; }
        }
        if (!bnplExtracted && !amtMatch && !extractedDateStr) return;
        const dateRes = resolveTransactionDate(extractedDateStr || null, typeHint, lastDate, headerMonthHint);
        if (dateRes.date) lastDate = dateRes.date;
        if (isBNPL && !dateRes.date && lastDate) { dateRes.date = lastDate; dateRes.metadata.level = 'LEVEL_3_FILL'; dateRes.metadata.confidence = 'MEDIUM'; }
        let cleanDesc = clean;
        if (bnplExtracted) { cleanDesc = bnplDesc; } else {
            if (extractedDateStr) cleanDesc = cleanDesc.replace(extractedDateStr, '');
            if (amtMatch) cleanDesc = cleanDesc.replace(amtMatch[0], '');
            cleanDesc = cleanDesc.replace(/[\s\-_]+$/, '').trim();
        }
        let direction: "DEBIT" | "CREDIT" = bnplExtracted ? bnplDir : "DEBIT"; 
        if (!bnplExtracted) {
            const upperDesc = cleanDesc.toUpperCase();
            if (upperDesc.includes("PAYMENT") || upperDesc.includes("CREDIT") || upperDesc.includes("REFUND") || upperDesc.includes("REVERSAL")) { direction = "CREDIT"; }
            if (suffix.startsWith('C')) direction = "CREDIT";
            else if (suffix.startsWith('D')) direction = "DEBIT";
        }
        const descRes = resolveDescription(cleanDesc, typeHint);
        const amountRes = resolveTransactionAmount({ amount: bnplExtracted ? bnplAmt : extractedAmt }, { description: cleanDesc, instrumentType: typeHint });
        amountRes.direction = direction;
        const issues: string[] = [];
        if (!dateRes.date) issues.push('MISSING_DATE_OCR');
        if (amountRes.amount === 0) issues.push('ZERO_AMOUNT');
        
        // GLOBAL ZERO AMOUNT REJECT (for OCR too, though OCR is messier)
        if (amountRes.amount === 0) return;

        if (dateRes.date) dateStats.level1_Explicit++; else dateStats.level4_Missing++;
        amountStats.level1_Explicit++;
        descStats.total++;
        if (descRes.metadata.merchantName) descStats.merchantIdentified++;
        txns.push(createTxn({
            instrumentId,
            txnDate: dateRes.date,
            dateMetadata: dateRes.metadata,
            description: descRes.description,
            descriptionRaw: line,
            descriptionMetadata: descRes.metadata,
            amount: amountRes.amount,
            amountMetadata: amountRes.metadata,
            direction: amountRes.direction,
            counterpartyNameGuess: descRes.metadata.merchantName,
            status: issues.length > 0 ? 'draft' : 'reviewed',
            needsAttention: issues.length > 0,
            issues,
            parserId: isBNPL ? 'generic_image_ocr_bnpl_v2' : 'generic_image_ocr_v1_enhanced',
            rawRow: line 
        }));
    });
    const report = createReport(method, 'GenericImageOcrV1_Enhanced', txns.length, []);
    report.pages = pages;
    report.ocrConfidence = 0.85;
    report.dateStats = dateStats;
    report.amountStats = amountStats;
    report.descriptionStats = descStats;
    const warnings = txns.length < 3 ? ['OCR_LOW_YIELD'] : [];
    return { docMeta: { extractedInstitutionName: isRBL ? 'RBL' : isTata ? 'SBI Tata' : isBNPL ? 'BNPL' : 'Unknown' }, txns, warnings, parseReport: report };
};

// 5. GEMINI VISION V1 (NEW)
const parseGeminiVisionV1 = async (file: File, instrumentId: string): Promise<ParsedResult> => {
    // Convert file to Base64
    const base64 = await fileToBase64(file);
    const docId = generateId(); // Temporary ID for this parse session
    
    // Call Gemini Service
    const partialTxns = await analyzeImageForTransaction(base64, file.type, instrumentId, docId);
    
    if (!partialTxns) {
        return {
            docMeta: { extractedInstitutionName: null },
            txns: [],
            warnings: ['GEMINI_API_FAIL'],
            parseReport: createReport('GEMINI_AI', 'VisionFailure', 0)
        };
    }

    // Convert Partial<Txn> to ParsedResult Structure
    // FILTER GARBAGE ROWS HERE
    const validPartials = partialTxns.filter(p => !isGarbageRow(p));

    const txns: (Transaction & { counterpartyNameGuess?: string | null })[] = validPartials.map(p => {
        // Enforce Transaction Structure
        const t: Transaction = {
            id: p.id || generateId(),
            instrumentId,
            sourceDocumentId: null, // Will be linked by caller
            txnDate: p.txnDate || null,
            postedDate: null,
            description: p.description || '',
            descriptionRaw: p.description || '',
            amount: p.amount || 0,
            direction: p.direction || 'DEBIT',
            currency: 'INR',
            categoryCode: null,
            counterpartyId: null,
            counterpartyType: p.counterpartyType || 'Unknown',
            confidence: 0.95,
            status: 'draft',
            month: getMonthFromDate(p.txnDate || null),
            financialYear: getFinancialYear(p.txnDate || null),
            tags: ['AI_EXTRACTED'],
            notes: null,
            needsAttention: p.needsAttention || false,
            issues: p.issues || [],
            parse: p.parse
        };
        
        // Add metadata structures even if empty to satisfy typing
        return {
            ...t,
            dateMetadata: { level: 'LEVEL_1_ROW', confidence: 'HIGH', source: 'ROW_CELL', issue: null },
            amountMetadata: { level: 'LEVEL_1_EXPLICIT', confidence: 'HIGH', source: 'COLUMN', issue: null },
            descriptionMetadata: { raw: t.description, clean: t.description, merchantName: null, merchantCity: null, referenceTokens: [], confidence: 'MEDIUM', isBankCharge: false, issues: [] }
        };
    });

    const report = createReport('GEMINI_AI', 'GeminiVisionV1', txns.length, ['AI_VISION_SUCCESS']);
    
    // Warn if high rejection rate
    const rejectedCount = partialTxns.length - validPartials.length;
    const warnings: string[] = [];
    if (rejectedCount > 0) warnings.push(`Dropped ${rejectedCount} garbage rows`);

    return {
        docMeta: { extractedInstitutionName: null },
        txns,
        warnings,
        parseReport: report
    };
};

// 6. PDF TEXT V1 (Extract text from PDF using pdfjs-dist, then parse like CSV)
const parsePdfTextV1 = async (file: File, instrumentId: string): Promise<ParsedResult> => {
    const warnings: string[] = [];
    const typeHint = getInstrumentTypeHint(instrumentId);
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items
                .map((item: any) => item.str)
                .join(' ');
            fullText += pageText + '\n';
        }
        
        if (!fullText.trim()) {
            warnings.push('PDF_NO_TEXT_EXTRACTED');
            // Fallback to Gemini Vision if no text extracted (scanned PDF)
            return await parseGeminiVisionV1(file, instrumentId);
        }
        
        // Parse the extracted text line by line looking for transaction patterns
        const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
        const txns: (Transaction & { counterpartyNameGuess?: string | null })[] = [];
        const dateStats = { level1_Explicit: 0, level2_Header: 0, level3_Filled: 0, level4_Missing: 0 };
        const amountStats = { level1_Explicit: 0, level2_Split: 0, level3_Text: 0, level4_Balance: 0, level5_Missing: 0 };
        const descStats = { total: 0, merchantIdentified: 0, lowConfidence: 0, bankCharges: 0, bnplMerchants: 0 };
        
        // Date pattern: DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY, etc.
        const dateRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i;
        // Amount pattern: numbers with commas and optional decimals
        const amountRegex = /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+\.\d{1,2})/g;
        
        let lastDate: string | null = null;
        
        for (const line of lines) {
            if (line.length < 10) continue;
            if (isGarbageRow({ description: line })) continue;
            
            const dateMatch = line.match(dateRegex);
            if (!dateMatch) continue; // Skip lines without dates — likely not transactions
            
            const dateRes = resolveTransactionDate(dateMatch[1], typeHint, lastDate, null);
            if (dateRes.date) lastDate = dateRes.date;
            
            // Extract amounts from the line
            const amounts = [...line.matchAll(amountRegex)].map(m => parseFloat(m[1].replace(/,/g, '')));
            if (amounts.length === 0) continue;
            
            // Use the largest amount as the transaction amount (heuristic)
            const amount = Math.max(...amounts);
            if (amount === 0) continue;
            
            // Remove the date and amount from description
            let description = line
                .replace(dateRegex, '')
                .replace(amountRegex, '')
                .replace(/\s+/g, ' ')
                .trim();
            
            if (description.length < 3) continue;
            
            const descRes = resolveDescription(description, typeHint);
            
            // Determine direction: look for CR/DR markers or column position
            const upperLine = line.toUpperCase();
            let direction: 'DEBIT' | 'CREDIT' = 'DEBIT';
            if (upperLine.includes(' CR') || upperLine.includes('CREDIT') || upperLine.includes('DEPOSIT')) {
                direction = 'CREDIT';
            }
            
            dateStats.level1_Explicit++;
            amountStats.level1_Explicit++;
            descStats.total++;
            if (descRes.metadata.merchantName) descStats.merchantIdentified++;
            
            txns.push(createTxn({
                instrumentId,
                txnDate: dateRes.date,
                dateMetadata: dateRes.metadata,
                description: descRes.description,
                descriptionRaw: line,
                descriptionMetadata: descRes.metadata,
                amount,
                amountMetadata: { level: 'LEVEL_1_EXPLICIT', confidence: 'MEDIUM', source: 'PDF_TEXT', issue: null },
                direction,
                counterpartyNameGuess: descRes.metadata.merchantName,
                status: 'draft',
                needsAttention: !dateRes.date,
                issues: [],
                parserId: 'pdf_text_v1',
                rawRow: line
            }));
        }
        
        if (txns.length === 0) {
            warnings.push('PDF_TEXT_NO_TRANSACTIONS_FOUND');
            // Fallback to Gemini Vision
            return await parseGeminiVisionV1(file, instrumentId);
        }
        
        const report = createReport('PDF_TEXT', 'PdfTextV1', txns.length, ['TextExtracted']);
        report.dateStats = dateStats;
        report.amountStats = amountStats;
        report.descriptionStats = descStats;
        
        return {
            docMeta: { extractedInstitutionName: null },
            txns,
            warnings,
            parseReport: report
        };
    } catch (e: any) {
        console.error('PDF Text Parse Failed, falling back to Vision', e);
        warnings.push('PDF_TEXT_PARSE_ERROR: ' + e.message);
        // Fallback to Gemini Vision for any PDF parse failure
        return await parseGeminiVisionV1(file, instrumentId);
    }
};

// 7. GENERIC CSV V1 (Auto-detect headers for any bank CSV)
const parseGenericCsvV1 = async (file: File, instrumentId: string): Promise<ParsedResult> => {
    const text = await file.text();
    const warnings: string[] = [];
    const typeHint = getInstrumentTypeHint(instrumentId);
    
    const parseRes = Papa.parse(text, { skipEmptyLines: true, header: false });
    const rows = parseRes.data as string[][];
    
    // Auto-detect header row by scanning first 30 rows for date/amount/description columns
    let headerIdx = -1;
    let map: Record<string, number> = {};
    
    const DATE_ALIASES = ['date', 'transaction date', 'txn date', 'value date', 'posting date', 'trans date', 'tran date'];
    const AMOUNT_ALIASES = ['amount', 'debit', 'credit', 'withdrawal', 'deposit', 'txn amount', 'transaction amount', 'debit amount', 'credit amount'];
    const DESC_ALIASES = ['description', 'narration', 'particulars', 'details', 'transaction details', 'remarks', 'transaction particulars'];
    const BALANCE_ALIASES = ['balance', 'closing balance', 'running balance'];
    
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const row = rows[i].map(c => c?.toLowerCase().trim() || '');
        
        let dateCol = -1, descCol = -1, amtCol = -1, debitCol = -1, creditCol = -1, balCol = -1;
        
        row.forEach((col, idx) => {
            if (DATE_ALIASES.some(a => col === a || col.startsWith(a))) dateCol = idx;
            if (DESC_ALIASES.some(a => col === a || col.startsWith(a))) descCol = idx;
            if (col === 'amount' || col === 'txn amount' || col === 'transaction amount') amtCol = idx;
            if (col.includes('debit') || col === 'withdrawal' || col === 'withdrawal amt') debitCol = idx;
            if (col.includes('credit') || col === 'deposit' || col === 'deposit amt') creditCol = idx;
            if (BALANCE_ALIASES.some(a => col === a || col.startsWith(a))) balCol = idx;
        });
        
        if (dateCol >= 0 && (amtCol >= 0 || debitCol >= 0 || creditCol >= 0) && descCol >= 0) {
            headerIdx = i;
            map = { date: dateCol, desc: descCol };
            if (amtCol >= 0) map['amt'] = amtCol;
            if (debitCol >= 0) map['debit'] = debitCol;
            if (creditCol >= 0) map['credit'] = creditCol;
            if (balCol >= 0) map['balance'] = balCol;
            break;
        }
    }
    
    if (headerIdx === -1) {
        // Fall back to ICICI parser as last resort
        return await parseIciciCcCsvV2(file, instrumentId);
    }
    
    const txns: (Transaction & { counterpartyNameGuess?: string | null })[] = [];
    const dateStats = { level1_Explicit: 0, level2_Header: 0, level3_Filled: 0, level4_Missing: 0 };
    const amountStats = { level1_Explicit: 0, level2_Split: 0, level3_Text: 0, level4_Balance: 0, level5_Missing: 0 };
    const descStats = { total: 0, merchantIdentified: 0, lowConfidence: 0, bankCharges: 0, bnplMerchants: 0 };
    let lastDate: string | null = null;
    
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2) continue;
        
        const dateRaw = map['date'] !== undefined ? row[map['date']] : '';
        const descRaw = map['desc'] !== undefined ? row[map['desc']] : '';
        
        if (!dateRaw && !descRaw) continue;
        
        // Amount resolution: single column or split debit/credit
        let amount = 0;
        let direction: 'DEBIT' | 'CREDIT' = 'DEBIT';
        
        if (map['amt'] !== undefined) {
            const raw = (row[map['amt']] || '').replace(/[,\s]/g, '');
            amount = Math.abs(parseFloat(raw) || 0);
            // Check for sign column or negative values
            if (map['sign'] !== undefined) {
                const sign = (row[map['sign']] || '').toUpperCase();
                direction = sign.includes('CR') ? 'CREDIT' : 'DEBIT';
            }
        } else {
            // Split columns
            const debitRaw = map['debit'] !== undefined ? (row[map['debit']] || '').replace(/[,\s]/g, '') : '';
            const creditRaw = map['credit'] !== undefined ? (row[map['credit']] || '').replace(/[,\s]/g, '') : '';
            const debitAmt = Math.abs(parseFloat(debitRaw) || 0);
            const creditAmt = Math.abs(parseFloat(creditRaw) || 0);
            
            if (debitAmt > 0) { amount = debitAmt; direction = 'DEBIT'; }
            else if (creditAmt > 0) { amount = creditAmt; direction = 'CREDIT'; }
        }
        
        if (amount === 0) continue;
        
        const dateRes = resolveTransactionDate(dateRaw, typeHint, lastDate, null);
        if (dateRes.date) lastDate = dateRes.date;
        
        const descRes = resolveDescription(descRaw, typeHint);
        
        if (dateRes.metadata.level === 'LEVEL_1_ROW') dateStats.level1_Explicit++;
        else dateStats.level4_Missing++;
        amountStats.level1_Explicit++;
        descStats.total++;
        if (descRes.metadata.merchantName) descStats.merchantIdentified++;
        
        const isDraft = !dateRes.date || !descRes.description;
        const issues: string[] = [];
        if (dateRes.metadata.issue) issues.push(dateRes.metadata.issue);
        
        txns.push(createTxn({
            instrumentId,
            txnDate: dateRes.date,
            dateMetadata: dateRes.metadata,
            description: descRes.description,
            descriptionRaw: descRaw,
            descriptionMetadata: descRes.metadata,
            amount,
            amountMetadata: { level: 'LEVEL_1_EXPLICIT', confidence: 'HIGH', source: 'COLUMN', issue: null },
            direction,
            counterpartyNameGuess: descRes.metadata.merchantName,
            status: isDraft ? 'draft' : 'draft', // All generic CSV starts as draft
            needsAttention: isDraft,
            issues,
            parserId: 'csv_generic_v1',
            rawRow: row
        }));
    }
    
    const report = createReport('CSV', 'GenericCsvV1', txns.length, ['GenericHeaderDetected']);
    report.dateStats = dateStats;
    report.amountStats = amountStats;
    report.descriptionStats = descStats;
    
    return {
        docMeta: { extractedInstitutionName: null },
        txns,
        warnings,
        parseReport: report
    };
};

// --- GENERIC DISPATCHER ---

export const parseFileUniversal = async (
    file: File, 
    fileType: Document['fileType'], 
    instrumentId: string,
    options?: { forceMethod?: string }
): Promise<ParsedResult> => {

    // Override routing if forceMethod 'OCR' requested
    if (options?.forceMethod === 'OCR') {
        return await parseGenericImageOcrV1(file, instrumentId, options);
    }

    const route = ROUTING_TABLE[instrumentId];
    const parserId = route ? route[fileType] : undefined;

    // Strict Routing: If no parser mapped, FAIL or REVIEW_REQUIRED
    if (!parserId) {
        return {
            docMeta: { extractedInstitutionName: null },
            txns: [],
            warnings: ['NO_PARSER_MAPPED'],
            parseReport: createReport('FALLBACK', 'NoRoute', 0)
        };
    }

    try {
        switch (parserId) {
            case 'icici_cc_csv_v2': return await parseIciciCcCsvV2(file, instrumentId);
            case 'icici_xls_v2': return await parseIciciXlsV2(file, instrumentId);
            case 'icici_ca_csv_v2': return await parseIciciCcCsvV2(file, instrumentId); 
            case 'axis_xls_v1': return await parseAxisXlsV1(file, instrumentId);
            
            // Replaced bnpl_ocr_v2 with generic_image_ocr_v1
            case 'generic_image_ocr_v1': return await parseGenericImageOcrV1(file, instrumentId);
            
            // New Gemini Vision Parser
            case 'gemini_vision_v1': return await parseGeminiVisionV1(file, instrumentId);
            
            case 'pdf_text_v1': 
                return await parsePdfTextV1(file, instrumentId);
            
            case 'csv_generic_v1':
                 return await parseGenericCsvV1(file, instrumentId); 

            default:
                throw new Error(`Parser ${parserId} not implemented`);
        }
    } catch (e: any) {
        console.error("Parser Crash", e);
        return {
            docMeta: { extractedInstitutionName: null },
            txns: [],
            warnings: ['CRASH: ' + e.message],
            parseReport: createReport('FALLBACK', 'Crash', 0)
        };
    }
};

// --- HELPERS ---

function createReport(method: any, strategy: string, lines: number, anchors: string[] = []): ParsedResult['parseReport'] {
    return {
        method,
        linesExtracted: lines,
        anchorsMatched: anchors,
        strategy,
        rowsFound: lines,
        rowsCommitted: 0, 
        rowsDrafted: 0,
        errors: [],
        warnings: [],
        dateStats: { level1_Explicit: 0, level2_Header: 0, level3_Filled: 0, level4_Missing: 0 },
        amountStats: { level1_Explicit: 0, level2_Split: 0, level3_Text: 0, level4_Balance: 0, level5_Missing: 0 },
        descriptionStats: { total: 0, merchantIdentified: 0, lowConfidence: 0, bankCharges: 0, bnplMerchants: 0 }
    };
}

function createTxn(data: Partial<Transaction> & { instrumentId: string, parserId: string, counterpartyNameGuess?: string | null, rawRow?: any }): Transaction & { counterpartyNameGuess?: string | null } {
    const txn: Transaction = {
        id: '', // Set by caller/store
        sourceDocumentId: null,
        instrumentId: data.instrumentId,
        txnDate: data.txnDate || null,
        dateMetadata: data.dateMetadata,
        postedDate: null,
        description: data.description || '',
        descriptionRaw: data.descriptionRaw || '',
        descriptionMetadata: data.descriptionMetadata,
        amount: data.amount || 0,
        amountMetadata: data.amountMetadata,
        direction: data.direction || 'DEBIT',
        currency: 'INR',
        categoryCode: null,
        counterpartyId: null,
        counterpartyType: 'Unknown',
        confidence: 0.8,
        status: data.status || 'draft',
        month: getMonthFromDate(data.txnDate || null),
        financialYear: getFinancialYear(data.txnDate || null),
        parse: {
            method: 'FALLBACK', // Overwritten by parser
            parserId: data.parserId,
            anchorsMatched: [],
            warnings: [],
            rawRow: data.rawRow || null // Persist raw row if provided
        },
        needsAttention: data.needsAttention || false,
        issues: data.issues || [],
        tags: ['AUTO'],
        notes: null
    };
    
    return { ...txn, counterpartyNameGuess: data.counterpartyNameGuess };
}
