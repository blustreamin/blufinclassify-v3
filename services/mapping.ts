import { Instrument } from '../types';

export const detectInstrument = (file: File, relativePath: string | undefined, instruments: Record<string, Instrument>): string | null => {
    // 1. Normalize inputs
    const path = (relativePath || '').toLowerCase();
    const name = file.name.toLowerCase();
    const fullPath = `${path}/${name}`;

    // 2. Folder-based mapping (Strict)
    // Map of Folder Name Keyword -> Instrument ID
    const folderMap: Record<string, string> = {
        'sbi tata': 'tata_cc_sbi',
        'tata card': 'tata_cc_sbi',
        'rbl bank pm': 'rbl_pm_cc',
        'rbl pm': 'rbl_pm_cc',
        'rbl bank pss': 'rbl_pss_cc',
        'rbl pss': 'rbl_pss_cc',
        'icici cc': 'icici_cc_corporate',
        'icici credit card': 'icici_cc_corporate',
        'icici sb': 'icici_sb_personal',
        'icici savings': 'icici_sb_personal',
        'axis sb': 'axis_sb_personal',
        'axis savings': 'axis_sb_personal',
        'icici ca': 'icici_ca_company',
        'icici current': 'icici_ca_company',
        'axis ca': 'axis_ca_company',
        'axis current': 'axis_ca_company',
        'lazypay': 'lazypay_bnpl_personal',
        'simpl': 'simpl_bnpl_personal'
    };

    for (const [key, id] of Object.entries(folderMap)) {
        if (path.includes(key)) {
            // Validate instrument exists
            if (instruments[id]) return id;
        }
    }

    // 3. Filename/Content Heuristics (Fallback)
    if (name.includes('tata') || name.includes('sbi_tata')) return 'tata_cc_sbi';
    if (name.includes('rbl_pm') || name.includes('_pm_')) return 'rbl_pm_cc';
    if (name.includes('rbl_pss') || name.includes('_pss_')) return 'rbl_pss_cc';
    
    // ICICI Heuristics (Complex overlap)
    if (name.includes('icici')) {
        if (name.includes('corp') || name.includes('credit') || name.includes('statement')) return 'icici_cc_corporate'; // Generic statement often CC
        if (name.includes('sb') || name.includes('saving')) return 'icici_sb_personal';
        if (name.includes('ca') || name.includes('current') || name.includes('detailed')) return 'icici_ca_company';
    }

    // Axis Heuristics
    if (name.includes('axis')) {
        if (name.includes('ca') || name.includes('current') || name.includes('transactionsummary')) return 'axis_ca_company';
        if (name.includes('sb') || name.includes('saving') || name.includes('5712737117')) return 'axis_sb_personal';
    }

    if (name.includes('lazypay')) return 'lazypay_bnpl_personal';
    if (name.includes('simpl')) return 'simpl_bnpl_personal';

    // 4. Fallback: Generic Tokens
    if (fullPath.includes('credit card')) return 'icici_cc_corporate'; // Risky default, but often true for generic "Credit Card" folders
    
    return null;
};