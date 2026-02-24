import { Instrument } from '../types';

export const detectInstrument = (file: File, relativePath: string | undefined, instruments: Record<string, Instrument>): string | null => {
    // 1. Normalize inputs — trim and lowercase
    const path = (relativePath || '').toLowerCase().trim();
    const name = file.name.toLowerCase().trim();
    const fullPath = `${path}/${name}`.replace(/\s+/g, ' '); // collapse multi-spaces

    // 2. Folder-based mapping (Strict)
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
        'lazy pay': 'lazypay_bnpl_personal',
        'simpl': 'simpl_bnpl_personal'
    };

    // Check full path (includes folder names)
    for (const [key, id] of Object.entries(folderMap)) {
        if (fullPath.includes(key)) {
            if (instruments[id]) return id;
        }
    }

    // 3. Filename heuristics (for single file uploads or undetected)
    if (name.includes('tata') || name.includes('sbi_tata')) return instruments['tata_cc_sbi'] ? 'tata_cc_sbi' : null;
    if (name.includes('rbl_pm') || name.includes('rbl pm') || name.match(/rbl.*pm/)) return instruments['rbl_pm_cc'] ? 'rbl_pm_cc' : null;
    if (name.includes('rbl_pss') || name.includes('rbl pss') || name.match(/rbl.*pss/)) return instruments['rbl_pss_cc'] ? 'rbl_pss_cc' : null;
    
    // ICICI
    if (name.includes('icici')) {
        if (name.includes('creditcard') || name.includes('credit_card') || name.includes('ccstatement') || (name.endsWith('.csv') && name.includes('statement'))) return instruments['icici_cc_corporate'] ? 'icici_cc_corporate' : null;
        if (name.includes('_sb_') || name.includes('saving') || name.includes('optransaction')) return instruments['icici_sb_personal'] ? 'icici_sb_personal' : null;
        if (name.includes('_ca') || name.includes('current') || name.includes('detailed')) return instruments['icici_ca_company'] ? 'icici_ca_company' : null;
    }

    // Axis
    if (name.includes('axis')) {
        if (name.includes('_ca_') || name.includes('transactionsummary') || name.includes('919020019143151')) return instruments['axis_ca_company'] ? 'axis_ca_company' : null;
        if (name.includes('5712737117')) return instruments['axis_sb_personal'] ? 'axis_sb_personal' : null;
    }

    // Standalone number patterns (Axis account numbers without "axis" in name)
    if (name.includes('5712737117')) return instruments['axis_sb_personal'] ? 'axis_sb_personal' : null;
    if (name.includes('919020019143151')) return instruments['axis_ca_company'] ? 'axis_ca_company' : null;

    if (name.includes('lazypay') || name.includes('lazy pay')) return instruments['lazypay_bnpl_personal'] ? 'lazypay_bnpl_personal' : null;
    if (name.includes('simpl')) return instruments['simpl_bnpl_personal'] ? 'simpl_bnpl_personal' : null;

    return null;
};