
export type Scope = "Company" | "Personal";
export type Flow = "Expense" | "Income";

export type TransactionNature = 
    | 'OPERATING_EXPENSE'
    | 'OPERATING_INCOME'
    | 'TRANSFER_INTERNAL'
    | 'TRANSFER_DIRECTOR'
    | 'SETTLEMENT_CC_BILL'
    | 'SETTLEMENT_LOAN_EMI'
    | 'CASH_WITHDRAWAL'
    | 'CASH_DEPOSIT'
    | 'REVERSAL_CHARGEBACK'
    | 'BANK_CHARGES_TAX'
    | 'UNKNOWN_NEEDS_REVIEW'
    // --- NATURE V1 (DETERMINISTIC) ---
    | 'NATURE_IT_INFRA_SAAS'
    | 'NATURE_LOCAL_TRAVEL'
    | 'NATURE_TRAVEL_BOOKING'
    | 'NATURE_FOOD_DINING'
    | 'NATURE_PERSONAL_SHOPPING'
    | 'NATURE_OFFICE_SUPPLIES'
    | 'NATURE_MEDICAL'
    | 'NATURE_BANK_CHARGE'
    | 'NATURE_CASH_WITHDRAWAL'
    | 'NATURE_LOAN_REPAYMENT'
    | 'NATURE_CC_BILL_SETTLEMENT'
    | 'NATURE_INTERNAL_TRANSFER'
    | 'NATURE_DIRECTOR_LOAN_FLOW'
    | 'NATURE_UNKNOWN';

export interface Instrument {
    id: string;
    name: string;
    institution: string;
    instrumentType: string;
    allowedFileTypes: string[];
    tileKey: string;
    strictMatchTokens: string[];
    parser: string;
}

export interface Category {
    code: string;
    name: string;
    kind: string;
    glGroup: string;
    active: boolean;
}

export interface Counterparty {
    id: string;
    name: string;
    type: string;
    aliases: string[];
    active: boolean;
}

export interface DateResolutionMetadata {
    level: string;
    confidence: string;
    source: string;
    issue: string | null;
}

export interface AmountResolutionMetadata {
    level: string;
    confidence: string;
    source: string;
    issue: string | null;
}

export interface DescriptionResolutionMetadata {
    raw: string;
    clean: string;
    merchantName: string | null;
    merchantCity: string | null;
    referenceTokens: string[];
    confidence: string;
    isBankCharge: boolean;
    issues: string[];
}

export type ClassificationStatus = 'UNCLASSIFIED' | 'REVIEWED' | 'CLASSIFIED' | 'PARTIALLY_CLASSIFIED';

export type EntityTypeOverride = 
    | 'CompanyVendor' 
    | 'PersonalMerchant' 
    | 'Client' 
    | 'Employee' 
    | 'ManagementOverhead' 
    | 'BankCharge' 
    | 'Unknown';

export interface Transaction {
    id: string;
    instrumentId: string;
    sourceDocumentId: string | null;
    txnDate: string | null;
    postedDate: string | null;
    description: string;
    descriptionRaw: string;
    descriptionMetadata?: DescriptionResolutionMetadata;
    amount: number;
    amountMetadata?: AmountResolutionMetadata;
    dateMetadata?: DateResolutionMetadata;
    direction: 'DEBIT' | 'CREDIT';
    currency: string;
    month?: string | null;
    financialYear?: string | null;
    categoryCode: string | null;
    counterpartyId: string | null;
    counterpartyType: string;
    confidence: number;
    status: 'draft' | 'reviewed' | 'final' | 'excluded';
    classificationStatus?: ClassificationStatus;
    tags: string[];
    notes: string | null;
    needsAttention: boolean;
    issues: string[];
    parse: {
        method: string;
        parserId: string;
        anchorsMatched: string[];
        warnings: string[];
        rawRow: any;
    };
    
    // Manual Overrides
    manualOverride?: {
        scope?: Scope;
        flow?: Flow;
        categoryCode?: string;
        entityType?: string;
        entityCanonical?: string;
        notes?: string;
        updatedAt: string;
        updatedBy: string;
    };

    // Determined/Enriched Fields
    vendorName?: string;
    clientName?: string;
    counterpartyNormalized?: string;
    
    scope?: Scope;
    flow?: Flow;
    entityType?: string;
    reviewedAt?: string;
    reviewedBy?: string;
    
    // Failsafe V3 fields
    reimbursable?: boolean;
    splitRatio?: { personal: number; company: number };
    classificationFlags?: string[];
    scopeOverrideReason?: string;

    // AI/Auto Suggestions
    suggestedCategory?: string | null;
    suggestionConfidence?: number;
    suggestionReason?: string | null;

    // Nature Classifier (V1)
    nature_v1?: TransactionNature;
    nature_confidence_v1?: number;
    nature_reason_v1?: string;
    nature_flags_v1?: string[];
    scope_v1?: Scope;
    flow_v1?: Flow;
    transactionNature?: string; // Legacy

    // Category Classifier (V1)
    suggested_scope_v1?: Scope;
    suggested_flow_v1?: Flow;
    suggested_category_v1?: string;
    suggested_entity_canonical_v1?: string;
    suggested_confidence_v1?: number;
    suggested_reason_v1?: string;
    suggested_version_v1?: string;
    suggested_source_v1?: string;

    // V2 Placeholders
    category_code_v2?: string;
    category_flags_v2?: string[];
    entity_type_v2?: string;
    entity_canonical_v2?: string;

    // Deduplication
    transactionHash?: string;
    isDuplicate?: boolean;
    duplicateOf?: string | null;
    duplicateReason?: string | null;
    dedupConfidence?: string;

    // Reconciliation
    financial_relationship_type?: FinancialRelationshipType;
    auditLog?: any[];
}

export interface Document {
    id: string;
    instrumentId: string;
    fileName: string;
    relativePath?: string;
    fileType: 'CSV' | 'PDF' | 'XLS' | 'XLSX' | 'IMAGE';
    sizeBytes: number;
    storage: { blobRef: string; sha256: string };
    uploadedAt: number;
    statementMonthHint: string | null; // YYYY-MM
    extractedInstitutionName: string | null;
    parseStatus: 'parsed' | 'partial' | 'manual' | 'failed';
    parseError: string | null;
    archivedAt: number | null;
    replacedByDocId: string | null;
    parseReport?: any;
    stats?: {
        totalRows: number;
        rejectedRows: number;
    };
}

export interface ParsedResult {
    docMeta: { extractedInstitutionName: string | null };
    txns: (Partial<Transaction> & { needsManualDate?: boolean })[];
    warnings: string[];
    parseReport: {
        method: string;
        linesExtracted: number;
        anchorsMatched: string[];
        strategy: string;
        rowsFound: number;
        rowsCommitted: number;
        rowsDrafted: number;
        errors: string[];
        warnings: string[];
        dateStats: any;
        amountStats: any;
        descriptionStats: any;
        [key: string]: any;
    };
}

export type AppRoute = 'ledger' | 'overview' | 'master_analysis' | 'company_expenses' | 'company_revenue' | 'director_personal' | 'reconciliation' | 'p_n_l' | 'registries' | 'ingest' | 'library' | 'parselab';

export interface AppState {
    meta: {
        appVersion: string;
        schemaVersion: number;
        lastSavedAt: number | null;
        hydrateStatus: string;
        hydrateError: any;
    };
    context: {
        orgName: string;
        selectedMonth: string;
        selectedFY: string;
        timezone: string;
    };
    registry: {
        instruments: Record<string, Instrument>;
        instrumentOrder: string[];
        categories: Record<string, Category>;
        categoryOrder: string[];
        counterparties: Record<string, Counterparty>;
        counterpartyOrder: string[];
        aliasMap: Record<string, string>;
        rules: any;
    };
    documents: {
        byId: Record<string, Document>;
        allIds: string[];
        byInstrumentMonth: Record<string, string[]>;
    };
    transactions: {
        byId: Record<string, Transaction>;
        allIds: string[];
        byMonth: Record<string, string[]>;
        byInstrument: Record<string, string[]>;
        byDoc: Record<string, string[]>;
        needsAttention: string[];
    };
    ledger: {
        monthSummaries: Record<string, LedgerMonthSummary>;
        fySummaries: any;
        lastComputedAt: number | null;
        registries?: EnrichmentRegistries;
        analysisReport?: FinancialReport;
        deepAnalysis?: any;
    };
    masterAnalysis?: {
        rows: MasterCsvRow[];
        fileName?: string;
        loadedAtIso?: string;
        lastResult?: MasterAnalysisResult;
    };
    ui: {
        nav: { currentRoute: AppRoute };
        ingestion: { activeInstrumentId: string | null; uploadModal: any; tileStatus: any };
        library: { search: string; filter: any; selectedDocId: string | null };
        ledgerView: { 
            filter: { 
                month: string; 
                instrumentId: string; 
                status: string; 
                confidence: string; 
                needsAttentionOnly: boolean; 
                search: string; 
                showDrafts: boolean; 
                showExcluded: boolean;
                includeDraftsInAnalytics: boolean;
            }; 
            drilldown: any; 
            selectedTxnId: string | null; 
            editPanelOpen: boolean; 
        };
        audit: any;
        toasts: Toast[];
        banners: Banner[];
    };
    runtime: {
        events: AuditEvent[];
        lastEventAt: number | null;
        jobs: Record<string, Job>;
    };
}

export interface Banner {
    id: string;
    level: 'error' | 'warning' | 'info' | 'success';
    title: string;
    message: string;
    createdAt: number;
    dismissible?: boolean;
}

export interface Toast {
    id: string;
    level: 'success' | 'error' | 'info';
    message: string;
    createdAt: number;
}

export interface LedgerMonthSummary {
    month: string;
    totalInflow: number;
    totalOutflow: number;
    closingBalance: number;
    txnCounts: number;
}

export interface Action {
    type: string;
    payload?: any;
}

export interface Job {
    id: string;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    result?: any;
    error?: string;
}

export interface AuditEvent {
    id: string;
    ts: number;
    type: string;
    details: any;
}

export interface VendorEntry {
    vendor_name_canonical: string;
    total_spend: number;
    txn_count: number;
    category_distribution: Record<string, number>;
    aliases_seen?: string[];
}

export interface ClientEntry {
    client_name_canonical: string;
    total_received: number;
    txn_count: number;
    aliases_seen?: string[];
}

export interface EmployeeEntry {
    employee_name_canonical: string;
    total_paid: number;
    txn_count: number;
    identifiers_seen?: string[];
}

export interface IncomeRegisterEntry {
    // Legacy
}

export interface EnrichmentRegistries {
    company_vendors: VendorEntry[];
    personal_merchants: VendorEntry[];
    employees: EmployeeEntry[];
    clients: ClientEntry[];
    income_register: IncomeRegisterEntry[];
}

export interface FinancialReport {
    generatedAt: number;
    period: string;
    coreHealth: {
        netCashFlow: number;
        companyExpenses: number;
        companyRevenue: number;
        operatingMarginPercent: number;
        top5ClientsContributionPercent: number;
    };
    controlLeakage: {
        unclassifiedSpendPercent: number;
        personalOnCompanyPercent: number;
        directorReimbursementTotal: number;
        bankChargesTotal: number;
        bankChargesCount: number;
    };
    toolsSubscriptions: {
        mcoSaasSpend: number;
        itInfraSpend: number;
        telInternetSpend: number;
        subscriptionConcentrationPercent: number;
    };
    paymentsRisk: {
        ccSettlementTotal: number;
        bnplDependencyPercent: number;
        outstandingReimbursement: number;
    };
    personal: {
        outflowTotal: number;
        inflowTotal: number;
        netCashflow: number;
        personalSpendOnCompanyCC: number;
        transfersTotal: number;
        transfersCount: number;
    };
    pnl: {
        revenue: { clientReceipt: number; otherIncome: number; refundReversal: number; total: number };
        expenses: Record<string, number>;
        totalExpense: number;
        netProfit: number;
    };
    directorIntelligence: {
        directorSalaryTotal: number;
        directorDrawTotal: number;
        spousePaymentsTotal: number;
        personalSpendOnCompanyTotal: number;
        netOutflowFromCompany: number;
    };
    salaryTotal: number;
    topClients: Array<{ name: string; amount: number }>;
}

export interface CoreIntelligenceResult {
    suggestionsByTxn: Array<{
        id: string;
        overrideApplied: boolean;
        suggested: {
            canonical: string;
            categoryCode: string;
            entityType: string;
            entityName: string;
            confidence: number;
            reason: string;
            aliasAction: string;
            alias: { raw: string; canonical: string };
            flags: string[];
        }
    }>;
    registryDiff: {
        employees?: { add: any[]; update: any[] };
        clients?: { add: any[]; update: any[] };
        companyVendors?: { add: any[]; update: any[] };
        personalMerchants?: { add: any[]; update: any[] };
        aliasMap: {
            add: Array<{ raw: string; canonical: string }>;
            update: Array<{ raw: string; canonical: string }>;
        };
        specialBuckets: any;
    };
    stickyDefaults: any[];
    ambiguousEntities: any[];
    validation: any;
}

export interface MasterCsvRow {
    txn_id: string;
    source_file: string;
    txn_date: string;
    description_raw: string;
    description_clean: string;
    amount: number;
    direction: "DEBIT" | "CREDIT";
    instrument_id: string;
    instrument_name: string;
    instrument_type: "Company" | "Personal";
    instrument_subtype: "SB" | "CA" | "CC" | "BNPL" | "OTHER";
    status: "draft" | "reviewed" | "excluded";
    entity_alias_raw: string;
    entity_canonical: string;
    category_code: string;
    confidence: number;
    flags: string;
    notes: string;
}

export const MASTER_CSV_HEADERS = [
    "txn_id", "source_file", "txn_date", "description_raw", "description_clean", 
    "amount", "direction", "instrument_id", "instrument_name", "instrument_type", 
    "instrument_subtype", "status", "entity_alias_raw", "entity_canonical", 
    "category_code", "confidence", "flags", "notes"
];

export interface MasterAnalysisResult {
    meta: any;
    healthChecks: any;
    sections: {
        venkat_on_behalf_company: any;
        mgmt_overhead_1_company_to_venkat: any;
        mgmt_overhead_2_company_to_neelam: any;
        mukti_tracker: any;
        employee_salaries_company: any;
        employee_payments_personal: any;
        it_vendors: any;
        mco_vendors: any;
        company_inflows_clients: any;
        venkat_inflows_non_company: any;
        fuel_tracker: any;
        cafe_diner_tracker: any;
        food_delivery_tracker: any;
        hosting_tracker: any;
        extra_insights: any;
    };
    uiHints: any;
}

export type FinancialRelationshipType = 
    | 'COMPANY_OPERATIONAL' 
    | 'DIRECTOR_ON_BEHALF' 
    | 'PERSONAL_LEAKAGE' 
    | 'SALARY' 
    | 'SETTLEMENT' 
    | 'DIRECTOR_PERSONAL' 
    | 'UNKNOWN';

export interface FailsafeSuggestion {
    txnId: string;
    scope: Scope;
    flow: Flow;
    categoryCode: string;
    entityType: EntityTypeOverride;
    entityName: string | null;
    confidence: number;
    reason: string;
    flags: string[];
    reimbursable?: boolean;
    splitRatio?: { personal: number; company: number };
    scopeOverrideReason?: string;
}

export interface FailsafeResult {
    suggestions: FailsafeSuggestion[];
    stats: {
        total: number;
        highConfidence: number;
        mediumConfidence: number;
        lowConfidence: number;
    };
}

export type PairingStatusV3 = 'UNPAIRED' | 'PAIRED_FULL' | 'PAIRED_PARTIAL';

export interface PairingRecordV3 {
    pairing_status_v3: PairingStatusV3;
    pairing_rule_id_v3: string;
    pairing_score_v3: number;
    paired_txn_ids_v3: string[];
    pairing_notes_v3: string;
}

export interface DirectorReconSummaryV3 {
    director_id: string;
    company_owes_director: {
        raw: number;
        reimbursed: number;
        net: number;
    };
    director_owes_company: {
        raw: number;
        repaid: number;
        net: number;
    };
    open_items: Array<{
        txn_id: string;
        amount: number;
        date: string;
        entity: string;
        category: string;
        reason: string;
    }>;
    pairings: Array<{
        pair_type: string;
        txn_ids: string[];
        amount: number;
        score: number;
        rule_id: string;
        evidence: string;
    }>;
}

export interface ReconciliationReportV3 {
    as_of: string;
    directors: DirectorReconSummaryV3[];
    unmatched_reimbursements: string[];
    unmatched_expenses: string[];
    settings: any;
}
