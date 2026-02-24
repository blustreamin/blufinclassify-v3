
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, CoreIntelligenceResult, EnrichmentRegistries, Category, MasterAnalysisResult } from "../types";
import { generateId, getMonthFromDate, getFinancialYear } from "./utils";

// Runtime API key management - user can set their own key
let _runtimeApiKey: string | null = null;

export const setGeminiApiKey = (key: string) => { _runtimeApiKey = key; };
export const getGeminiApiKey = (): string | null => {
  // 1. Runtime key (set via Settings page) — highest priority
  if (_runtimeApiKey && _runtimeApiKey !== 'PLACEHOLDER_API_KEY') return _runtimeApiKey;
  // 2. localStorage (persisted across sessions)
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('blufin_gemini_key');
    if (stored && stored !== 'PLACEHOLDER_API_KEY') {
      _runtimeApiKey = stored; // Cache it
      return stored;
    }
  }
  // 3. Vite-injected env var (build-time)
  try {
    const envKey = (process as any).env?.GEMINI_API_KEY;
    if (envKey && envKey !== '' && envKey !== 'PLACEHOLDER_API_KEY') return envKey;
  } catch {}
  return null;
};
export const clearGeminiApiKey = () => { _runtimeApiKey = null; };

const GEMINI_MODEL = 'gemini-2.5-flash-preview-04-17';

const getAIClient = () => {
  const key = getGeminiApiKey();
  if (!key || key === 'PLACEHOLDER_API_KEY') {
    console.warn("Gemini API Key not set. AI features disabled.");
    return null;
  }
  return new GoogleGenAI({ apiKey: key });
};

// ... existing MASTER_INTELLIGENCE_PROMPT ...

const MASTER_INTELLIGENCE_PROMPT = `
You are the core intelligence layer for bluFin v3 (accounting + registry engine).
You must do TWO jobs in one pass:

A) AUTO-SUGGEST ENGINE
B) REGISTRY BUILDER / REGISTRY REPAIR ENGINE

Additionally:
C) MANUAL OVERRIDE SUPPORT (user edits must stick)

You will receive: aliasMap (optional), registries (vendors/personalMerchants/clients/employees/instruments), manualOverrides (optional), and transactions[].

Your output must be deterministic and implementation-ready:
- Provide per-transaction suggestions (same schema as below)
- Provide registry diffs (what to add/update)
- Provide suggested sticky defaults
- Provide ambiguous queues
- Provide override-aware behavior
- Provide validation checks + errors

────────────────────────────────────────────────────────────────────────────
DATA YOU WILL RECEIVE
────────────────────────────────────────────────────────────────────────────
transactions[] objects contain:
{
  id,
  txnDate,
  description,
  amount,
  direction: "DEBIT" | "CREDIT",
  instrumentId,
  instrumentType: "Company" | "Personal",
  status: "draft" | "reviewed" | "excluded",
  vendorName?: string,
  clientName?: string,
  canonical?: string,
  categoryCode?: string,
  entityType?: string,
  entityName?: string
}

registries object contains:
{
  companyVendors: { [canonicalName]: { aliases: string[], defaultCategory?: CategoryCode } },
  personalMerchants: { [canonicalName]: { aliases: string[], defaultCategory?: CategoryCode } },
  clients: { [canonicalName]: { aliases: string[] } },
  employees: { [canonicalName]: { aliases: string[] } },
  instruments: { [instrumentId]: { name, type: "Company"|"Personal", bank?:string, accountHint?:string } }
}

aliasMap optional:
{
  [rawAlias: string]: canonicalName
}

manualOverrides optional:
{
  byTxnId: {
    [id]: {
      locked: boolean,
      categoryCode?: CategoryCode,
      entityType?: EntityType,
      entityName?: string,
      canonical?: string
    }
  },
  byEntity: {
    [canonicalName]: {
      lockedDefaultCategory?: CategoryCode
    }
  }
}

────────────────────────────────────────────────────────────────────────────
GLOBAL HARD RULES
────────────────────────────────────────────────────────────────────────────
1) Draft transactions MUST be processed for both suggestions + registries.
2) Excluded transactions should be ignored for analytics but still can build registries if useful.
3) Canonicalization is required:
   - Remove noise tokens: UPI, IMPS, NEFT, RTGS, P2A, P2M, @ok*, VPA strings, bank codes, long numeric refs.
   - Extract the likely merchant/person name.
   - Normalize to UPPERCASE canonical with collapsed spaces.
4) Determinism:
   - If aliasMap already maps raw->canonical, always use it.
   - If registries already contain a matching canonical, reuse it.
   - Only create new canonicals when needed.
5) Manual override rules (critical):
   - If manualOverrides.byTxnId[id].locked === true:
       DO NOT change category/entity/canonical.
       Only add helpful flags (e.g. mismatch warnings) but suggestion must equal the locked values.
   - If user has set a locked default category for an entity, treat it as the default and do not override unless transaction context clearly contradicts (then mark needs_review).
   - Output must include "overrideApplied": true/false.

────────────────────────────────────────────────────────────────────────────
SPECIAL PEOPLE & SPECIAL FLOWS (CRITICAL)
────────────────────────────────────────────────────────────────────────────
People:
- Venkatraman = director.
- Neelam Lal = Venkatraman’s wife.
- Mukti / Muktikanta = office help.

A) Company → Neelam transfers:
- MUST be categorized as either:
  DIRECTOR_PAYMENT  OR  DIRECTOR_REIMBURSEMENT
- Use patterns:
  - salary-like / monthly / fixed / “SALARY” => DIRECTOR_PAYMENT
  - reimb/refund/expense/on behalf/paid for OR nearby linked expense => DIRECTOR_REIMBURSEMENT
- Also tag EntityType=ManagementOverhead (dual-tag concept) and set flag: "MGMT_OVERHEAD_TRACK".

B) Any Company <-> (Venkatraman OR Neelam) transfers:
- Always add EntityType=ManagementOverhead in addition to normal classification.
- Track direction:
  - Company → Person = Outflow ManagementOverhead
  - Person → Company = Inflow ManagementOverhead

C) Mukti tracking:
- Split into:
  - OFFICE_HELP_SALARY (salary-like)
  - OFFICE_HELP_ERRANDS (groceries/errands/petty-cash-like)
- Add flag: "MUKTI_TRACK"
- Most are from personal instruments, but classification remains company-cost-like if it is for office errands; mark:
   - if instrumentType=Personal and category is OFFICE_HELP_ERRANDS => flag "PERSONAL_PAID_FOR_COMPANY"

D) UPI routing rule (Entity Registries):
- If instrumentType=Personal and tx is UPI-like:
   route entity into PersonalMerchants registry
   unless it matches Employee or Mukti.
- If instrumentType=Company and tx is UPI-like:
   route into CompanyVendors or Employees depending on match.

E) Employees registry additions:
- Ensure SABARI HARI VASAN C / SABARI exists as canonical "SABARI".
- Employee detection:
  If description contains an employee name/alias -> entityType=Employee
  Category:
    - salary-like => EMPLOYEE_SALARY
    - advance-like => EMPLOYEE_SALARY_ADVANCE
    - reimb-like => EMPLOYEE_REIMBURSEMENT

────────────────────────────────────────────────────────────────────────────
APPROVED CATEGORY TAXONOMY (EXACT CODES ONLY)
────────────────────────────────────────────────────────────────────────────
COMPANY (Expenses)
- SAAS_MCO_MARKETING_CREATIVE
- IT_INFRASTRUCTURE
- TELCO_INTERNET
- OFFICE_RENT
- OFFICE_ELECTRICITY
- OFFICE_UTILITIES
- OFFICE_SUPPLIES
- OFFICE_MAINTENANCE_REPAIRS
- VEHICLE_FUEL
- VEHICLE_REPAIR_MAINTENANCE
- TRAVEL_LOCAL
- TRAVEL_INTERCITY
- MEALS_CLIENTS_TEAM
- COURIER_LOGISTICS
- PROFESSIONAL_SERVICES
- BANK_CHARGES
- TAXES_GST
- INSURANCE_PREMIUM
- STAFF_WELFARE
- MARKETING_AD_SPEND
- SOFTWARE_SUBSCRIPTIONS
- TRAINING_LEARNING
- EQUIPMENT_CAPEX
- BNPL_SETTLEMENT
- CC_BILL_PAYMENT
- OTHER_COMPANY_EXPENSE
- INTERNAL_ADJUSTMENT

COMPANY (Payroll / People)
- EMPLOYEE_SALARY
- EMPLOYEE_SALARY_ADVANCE
- EMPLOYEE_REIMBURSEMENT
- OFFICE_HELP_SALARY
- OFFICE_HELP_ERRANDS

COMPANY (Revenue / Inflows)
- CLIENT_RECEIPT
- OTHER_INCOME
- REFUND_REVERSAL

COMPANY (Transfers / Ownership)
- COMPANY_TRANSFER
- DIRECTOR_PAYMENT
- DIRECTOR_REIMBURSEMENT

PERSONAL (Living)
- PERSONAL_GROCERIES_DAILY_NEEDS
- PERSONAL_GROCERIES
- PERSONAL_DINING_CAFES
- PERSONAL_FOOD_DELIVERY
- PERSONAL_RENT
- PERSONAL_ELECTRICITY
- PERSONAL_UTILITIES
- PERSONAL_FUEL
- PERSONAL_VEHICLE_REPAIR_MAINTENANCE
- PERSONAL_LOCAL_RIDES
- PERSONAL_INTERCITY_TRAVEL
- PERSONAL_SHOPPING_ECOMMERCE
- PERSONAL_SHOPPING_GENERAL
- PERSONAL_MEDICAL_HEALTHCARE
- PERSONAL_FITNESS_WELLNESS
- PERSONAL_ENTERTAINMENT_LEISURE
- PERSONAL_SUBSCRIPTIONS
- PERSONAL_EDUCATION_LEARNING
- PERSONAL_GIFTS_DONATIONS
- PERSONAL_INSURANCE_PREMIUM
- PERSONAL_TAXES
- PERSONAL_HOME_MAINTENANCE
- PERSONAL_PET_CARE
- PERSONAL_OTHER

PERSONAL (Money movement)
- PERSONAL_TRANSFER
- PERSONAL_LOAN_EMI
- PERSONAL_CASH_WITHDRAWAL
- PERSONAL_INVESTMENTS

Fallback:
- UNCATEGORIZED

────────────────────────────────────────────────────────────────────────────
OUTPUT REQUIREMENTS
────────────────────────────────────────────────────────────────────────────
Return a single JSON object with these top-level keys:

{
  "suggestionsByTxn": [
     {
       "id": "...",
       "overrideApplied": true|false,
       "suggested": {
         "canonical": "CANONICAL_NAME",
         "categoryCode": "EXACT_CODE",
         "entityType": "CompanyVendor|PersonalMerchant|Client|Employee|ManagementOverhead|BankCharge|Unknown",
         "entityName": "CANONICAL_NAME",
         "confidence": 0.0-1.0,
         "reason": "short explanation",
         "aliasAction": "none|add_alias|update_alias",
         "alias": { "raw": "rawExtract", "canonical": "CANONICAL_NAME" },
         "flags": ["..."]
       }
     }
  ],

  "registryDiff": {
     "employees": { "add": [...], "update": [...] },
     "clients": { "add": [...], "update": [...] },
     "companyVendors": { "add": [...], "update": [...] },
     "personalMerchants": { "add": [...], "update": [...] },
     "aliasMap": { "add": [...], "update": [...] },

     "specialBuckets": {
        "mukti": { "canonical": "MUKTI", "aliases": ["MUKTI","MUKTIKANTA",...], "trackingFlag": "MUKTI_TRACK" },
        "managementOverhead": { 
           "canonicals": ["VENKATRAMAN", "NEELAM LAL"],
           "trackingFlag": "MGMT_OVERHEAD_TRACK"
        }
     }
  },

  "stickyDefaults": [
     { "canonical": "SWIGGY", "entityType": "PersonalMerchant|CompanyVendor", "defaultCategoryCode": "..." , "confidence": 0.0-1.0, "why":"..." }
  ],

  "ambiguousEntities": [
     { "raw": "...", "candidates": ["..."], "suggestedCategory": "...", "whyAmbiguous":"...", "askUser":"yes/no question to confirm" }
  ],

  "validation": {
     "errors": [ ... ],
     "warnings": [ ... ],
     "stats": {
        "txnsProcessed": number,
        "lockedOverridesRespected": number,
        "newAliasesProposed": number,
        "newEntitiesProposed": number,
        "uncategorizedCount": number
     }
  }
}
`;

const MASTER_ANALYSIS_PROMPT = `
ROLE

You are a forensic accounting and transaction-intelligence engine built for bluFin v3.

Your task is to ingest normalized banking transaction CSVs (company + personal instruments combined) and produce deep financial intelligence without modifying or overwriting any existing ledger logic.

This analysis is purely additive.

You must reason like:
	•	A CFO
	•	A forensic auditor
	•	A compliance officer
	•	A bookkeeping automation system

Use step-by-step reasoning internally, but output only the final structured JSON.

⸻

INPUT GUARANTEES

You will receive one or more CSV files.

All CSVs:
	•	Share the exact same schema
	•	May overlap in date ranges
	•	May contain duplicates across files
	•	Must be merged logically before analysis

Canonical Columns (guaranteed):
transaction_id
txn_date
description
amount
direction              (DEBIT | CREDIT)
instrument_id
instrument_name
instrument_type        (Company | Personal)
instrument_subtype     (SB | CA | CC | BNPL | OD)
account_holder
counterparty_raw
upi_vpa
bank_reference
status                 (DRAFT | POSTED | EXCLUDED)

GLOBAL NORMALIZATION RULES (MANDATORY)
	1.	Merge all CSVs into one logical dataset
	•	De-duplicate using:
transaction_id OR (txn_date + amount + bank_reference)
	2.	Include DRAFT rows in analysis
	3.	Exclude EXCLUDED rows from totals
	4.	Never assume category from prior UI state
	5.	Never emit objects, arrays, or nulls in text fields

⸻

KEY IDENTITIES (CRITICAL)

Directors
	•	Venkatraman Shankarnaryan
	•	Aliases: VENKAT, VENKY, SVIJAY19, VENKATRAMANSHANKARN
	•	Neelam Lal
	•	Relationship: Spouse of Venkatraman

Office Help
	•	Mukti / Muktikanta / Mukthi
	•	Office help
	•	Receives:
	•	Salary
	•	Errand / grocery money
	•	Paid from:
	•	Company instruments
	•	Personal instruments (very frequently)

Employees (non-director)

Includes but not limited to:
HRIDAM
SABARI
JOSHUA
RIYA
NARMADA
GOPIKA
TALIB
KARTHI
NAYAN
MAHIKA
SHUBASHINI

CORE ANALYSIS OBJECTIVES

You must compute ALL of the following sections.

⸻

1️⃣ Venkat Paid on Behalf of Company

Identify transactions where:
	•	Instrument = Personal
	•	Payer = Venkat
	•	Expense is clearly company in nature

Examples (non-exhaustive):
	•	IT vendors (Cloud, SaaS, Hosting)
	•	MCO tools
	•	Office rent, electricity, internet
	•	Company credit card bill paid personally
	•	ICICI OD / interest paid personally
	•	Swiggy / Zepto for office food or groceries
	•	BNPL food orders for team

Output:
	•	Date
	•	Description
	•	Amount
	•	Instrument
	•	Confidence (0–1)
	•	Reason (plain string)

⸻

2️⃣ Company → Venkat (Management Overhead 1)

Identify ALL transfers from company instruments → Venkat personal instruments.

Classify each as:
	•	DIRECTOR_PAYMENT (salary / draw / advance)
	•	DIRECTOR_REIMBURSEMENT

Rules:
	•	Keywords like reimbursement, refund, paid for, vendor proximity → reimbursement
	•	Salary-like patterns / lump monthly → payment

Compute:
	•	Total amount
	•	Count
	•	Per-transaction breakdown

⸻

3️⃣ Company → Neelam (Management Overhead 2)

Same logic as above, only Neelam.

Compute:
	•	Salary
	•	Advance
	•	Reimbursement
	•	Total

⸻

4️⃣ Mukti / Office Help Tracker

Split into FOUR buckets:

A. Company → Mukti
B. Personal → Mukti
Each transaction must be tagged as:
	•	OFFICE_HELP_SALARY
	•	OFFICE_HELP_ERRANDS
	•	ADVANCE
	•	OTHER

Also compute:
	•	Total per bucket
	•	Instrument split (Company vs Personal)

⸻

5️⃣ Employee Salaries

A. Paid from Company Accounts
B. Paid from Personal Accounts
For each employee:
	•	Salary
	•	Salary advance
	•	Reimbursement

Provide:
	•	Per-employee totals
	•	Transaction list

⸻

6️⃣ IT Vendor Intelligence

Identify and group:
	•	Cloud providers
	•	Hosting
	•	SaaS tools
	•	Infra vendors

Compute:
	•	Vendor → total spend
	•	Category (IT_INFRASTRUCTURE or SOFTWARE_SUBSCRIPTIONS)

⸻

7️⃣ MCO Vendor Intelligence

Identify marketing / creative / SEO / tooling vendors.

Compute:
	•	Vendor → total spend
	•	Category

⸻

8️⃣ Company Inflows (Clients)

From Company instruments only:
	•	Identify all inbound transactions
	•	Group by client
	•	Subtotal per client
	•	Grand total

⸻

9️⃣ Venkat Inflows (Non-Company)

From Venkat personal instruments:
	•	Exclude transfers from company
	•	Identify:
	•	Loans
	•	Investments
	•	Other personal income

⸻

🔟 Expense Trackers (Independent)

Each tracker must list rows + totals:
	•	Fuel
	•	Cafes & Dining
	•	Food Delivery
	•	Hosting
	•	Subscriptions
	•	Bank Charges
	•	Rent (Office vs Personal)

⸻

CONFIDENCE & REASONING

Every row must include:
	•	confidence: 0.00 – 1.00
	•	reason: string only, never structured

If uncertain:
	•	Lower confidence
	•	Explicitly say why

⸻

OUTPUT FORMAT (STRICT)

Return ONE JSON OBJECT with this structure:
{
  meta: {},
  healthChecks: {},
  sections: {
    venkat_on_behalf_company: {},
    mgmt_overhead_1_company_to_venkat: {},
    mgmt_overhead_2_company_to_neelam: {},
    mukti_tracker: {},
    employee_salaries_company: {},
    employee_payments_personal: {},
    it_vendors: {},
    mco_vendors: {},
    company_inflows_clients: {},
    venkat_inflows_non_company: {},
    fuel_tracker: {},
    cafe_diner_tracker: {},
    food_delivery_tracker: {},
    hosting_tracker: {},
    extra_insights: {}
  },
  uiHints: {}
}

All text fields MUST be strings.
All numbers MUST be numbers.
No nulls. No undefined. No nested objects in strings.

⸻

HARD FAIL CONDITIONS

❌ Emitting React-unsafe values
❌ Guessing without confidence downgrade
❌ Overwriting or modifying ledger data
❌ Mixing personal and company totals
❌ Missing any section listed above

⸻

FINAL INSTRUCTION

Think deeply.
Cross-reference aggressively.
Be conservative in assumptions.
Be explicit in reasoning.
Return only valid JSON.
`;

const MASTER_CSV_INGEST_PROMPT = `
You are a deterministic CSV normalization engine for bluFin v3.
You MUST output ONLY a valid CSV (comma-separated), with EXACT header ordering and EXACT column names specified below.
No markdown. No explanations. No JSON. No additional text. Only CSV.

You will be given 1 or more input CSV files (raw text). They may have different headers and extra columns.
Your job: normalize ALL rows from ALL files into the Strict v3 schema, union them, and output a single Strict v3 CSV.

Strict v3 schema (EXACT header + order)

txn_id,source_file,txn_date,description_raw,description_clean,amount,direction,instrument_id,instrument_name,instrument_type,instrument_subtype,status,entity_alias_raw,entity_canonical,category_code,confidence,flags,notes

Hard constraints
	1.	Output MUST contain exactly the 18 columns above, in the exact order.
	2.	Every row must have 18 values (empty allowed).
	3.	instrument_type MUST be only one of: Company or Personal. Nothing else.
	4.	All rows from all files must be included (including draft).
	5.	Do not drop rows due to parse uncertainty; fill unknowns with empty string.
	6.	Ensure commas inside fields are quoted using standard CSV quoting (double quotes).
	7.	No “smart” reformatting of numbers/dates that changes meaning; only normalize.

Input format

You may receive multiple CSV blocks. Each block may be preceded by a filename marker.
Always use the filename marker as source_file for those rows. If absent, infer source_file from any column like source_file_name; else leave blank.

⸻

Mapping rules (important)

1) txn_id
	•	Use txn_id if present. Else use id. Else create deterministic id: HASH(txn_date + description_raw + amount + instrument_id + direction) (stable).

2) source_file
	•	Prefer source_file if present.
	•	Else use source_file_name.
	•	Else use provided filename marker.
	•	Else empty.

3) txn_date
	•	Prefer ISO date column if present: txn_date_iso.
	•	Else txn_date.
	•	Else txn_date_raw if it is already YYYY-MM-DD.
	•	Else keep as-is from txn_date_raw (do NOT invent a new date); if empty, keep empty.

4) description_raw
	•	Prefer description_raw.
	•	Else use description (or narration) as raw.

5) description_clean
	•	Prefer description_clean.
	•	Else use description.
	•	Else if only raw exists, set clean = raw.

6) amount
	•	Prefer numeric amount if present.
	•	Else amount_value.
	•	Else parse from amount_raw (strip currency symbols, commas).
	•	Keep sign OUT of amount; sign belongs to direction. Amount must be positive numeric string if possible. If cannot parse, keep original.

7) direction
	•	Must be exactly DEBIT or CREDIT if determinable.
	•	Prefer existing direction.
	•	Else infer:
	•	If amount is negative => set direction=DEBIT and make amount absolute.
	•	Else if description contains “CR” or “CREDIT” => CREDIT
	•	Else default to DEBIT if unknown.

8) instrument_id
	•	Prefer instrument_id. Else empty.

9) instrument_name
	•	Prefer instrument_name. Else empty.

10) instrument_type (STRICT: Company|Personal only)
	•	If input already contains exactly Company or Personal, keep it.
	•	Else map from common variants in ANY of these fields: instrument_type, instrument_name, instrument_subtype:
	•	If value contains PERSONAL => Personal
	•	Else if contains COMPANY or CORPORATE => Company
	•	Else if startswith SB_ => Personal
	•	Else if startswith CA_ => Company
	•	Else if startswith CC_:
	•	if contains PERSONAL => Personal
	•	else => Company
	•	Else if startswith BNPL_:
	•	if contains PERSONAL => Personal
	•	else => Personal (default BNPL to Personal unless explicitly corporate)
	•	Else fallback => Company (safe default)

11) instrument_subtype
	•	Preserve the original raw subtype/detail:
	•	Prefer instrument_subtype if present.
	•	Else store original instrument_type value (e.g., SB_PERSONAL, CC_COMPANY, etc.)
	•	Else empty.

12) status
	•	Prefer status. Else empty.

13) entity_alias_raw
	•	Prefer entity_alias_raw.
	•	Else entity.
	•	Else empty.

14) entity_canonical
	•	Prefer entity_canonical. Else empty.

15) category_code
	•	Prefer category_code.
	•	Else category.
	•	Else empty.

16) confidence
	•	Prefer confidence. Else empty.

17) flags
	•	Prefer flags. Else empty.
	•	If flags is an array/object, stringify as JSON in one cell.

18) notes
	•	Prefer notes. Else empty.

⸻

Output requirements
	•	Output ONE combined Strict v3 CSV for ALL provided files.
	•	Deduplicate header: only one header line at top.
	•	Keep original row ordering as much as possible, but it’s okay to append file-by-file.
	•	Never output any commentary or extra lines before/after CSV.

⸻

USER CONTENT WILL FOLLOW. PROCESS IT.
`;

// Analyze Image (Receipt/Invoice/Statement Page)
export const analyzeImageForTransaction = async (
  base64Data: string, 
  mimeType: string,
  instrumentId: string,
  docId: string
): Promise<Partial<Transaction>[] | null> => {
  const ai = getAIClient();
  if (!ai) {
    console.warn("Gemini API client not available — no API key set. Image OCR skipped.");
    return null;
  }

  // Ensure valid MIME type
  if (!mimeType || mimeType === 'application/octet-stream') {
    mimeType = 'image/jpeg';
  }

  try {
     
    const prompt = `You are a financial document OCR specialist. Analyze this bank/credit card statement image carefully.

INSTRUMENT CONTEXT: ${instrumentId}
${instrumentId.includes('lazypay') ? 'This is a LazyPay BNPL statement. Extract each purchase transaction with date, merchant name, and amount.' : ''}
${instrumentId.includes('simpl') ? 'This is a Simpl BNPL statement. Extract each purchase transaction with date, merchant name, and amount.' : ''}
${instrumentId.includes('rbl') ? 'This is an RBL Bank credit card statement. Extract each transaction with date, description, and amount. Debits are purchases, credits are payments/reversals.' : ''}
${instrumentId.includes('tata') || instrumentId.includes('sbi') ? 'This is an SBI Tata credit card statement. Extract each transaction with date, description, and amount.' : ''}

RULES:
1. Extract EVERY transaction row visible in the image
2. Dates must be in YYYY-MM-DD format (convert from DD/MM/YYYY or DD-MMM-YYYY etc.)
3. Amount must be a positive number (use direction field for debit/credit)
4. For BNPL: all purchases are DEBIT, payments/settlements are CREDIT
5. Skip header rows, totals, summary rows, opening/closing balance rows
6. If a date is unclear, use null
7. Description should be the merchant/payee name, cleaned of noise

Return structured JSON with all transactions found.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        rows: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              instrument_id: { type: Type.STRING },
              statement_id: { type: Type.STRING },
              date: { type: Type.STRING, nullable: true },
              description: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              direction: { type: Type.STRING, enum: ["DEBIT", "CREDIT"] },
              status: { type: Type.STRING, enum: ["VALID", "DRAFT", "REJECTED"] },
              issues: { type: Type.ARRAY, items: { type: Type.STRING } },
              confidence_score: { type: Type.NUMBER },
              confidence_band: { type: Type.STRING },
              confidence_factors: { type: Type.OBJECT, properties: { header_anchor: { type: Type.BOOLEAN, nullable: true }, row_alignment: { type: Type.BOOLEAN, nullable: true }, date_valid: { type: Type.BOOLEAN }, amount_valid: { type: Type.BOOLEAN }, desc_quality: { type: Type.STRING }, instrument_logic: { type: Type.STRING }, direction_logic: { type: Type.STRING } } },
              audit_trace: { type: Type.OBJECT, properties: { amount_source: { type: Type.STRING }, date_source: { type: Type.STRING }, normalization_notes: { type: Type.ARRAY, items: { type: Type.STRING } } } }
            }
          }
        },
        stats: { type: Type.OBJECT, properties: { input_rows: { type: Type.NUMBER }, valid_rows: { type: Type.NUMBER }, draft_rows: { type: Type.NUMBER }, rejected_rows: { type: Type.NUMBER }, zero_amount_rejected: { type: Type.NUMBER }, undefined_desc_rejected: { type: Type.NUMBER }, missing_date_drafts: { type: Type.NUMBER }, duplicates_flagged: { type: Type.NUMBER } } }
      }
    };

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: { parts: [{ inlineData: { mimeType, data: base64Data } }, { text: prompt }] },
      config: { responseMimeType: "application/json", responseSchema: responseSchema },
    });

    const text = response.text;
    if (!text) return null;
    const data = JSON.parse(text);
    const rows = data.rows || [];
    const results: Partial<Transaction>[] = [];
    for (const row of rows) {
        if (row.status === 'REJECTED') continue;
        const txn: Partial<Transaction> = {
            id: generateId(),
            instrumentId,
            sourceDocumentId: docId,
            txnDate: row.date || null,
            amount: Math.abs(row.amount || 0),
            description: row.description || "Extracted from Image",
            direction: (row.direction as "DEBIT" | "CREDIT") || "DEBIT",
            status: row.status === 'VALID' ? 'reviewed' : 'draft',
            issues: row.issues || [],
            needsAttention: row.status !== 'VALID' || !row.date,
            confidence: (row.confidence_score || 0) / 100,
            categoryCode: null,
            counterpartyType: "Unknown",
            month: getMonthFromDate(row.date || null),
            financialYear: getFinancialYear(row.date || null),
            parse: { method: 'GEMINI_AI_PRO', parserId: GEMINI_MODEL, anchorsMatched: row.confidence_factors?.header_anchor ? ['AI_HEADER_MATCH'] : [], warnings: row.audit_trace?.normalization_notes || [], rawRow: row },
            tags: ['AI_EXTRACTED', `CONFIDENCE_${row.confidence_band || 'U'}`]
        };
        results.push(txn);
    }
    return results;
  } catch (error) {
    console.error("Gemini Image Analysis Failed", error);
    return null;
  }
};

// --- CORE INTELLIGENCE ENGINE (NEW) ---
export const runCoreIntelligence = async (
    txns: Transaction[], 
    registries: EnrichmentRegistries, 
    aliasMap: Record<string, string>,
    instruments: Record<string, any>
): Promise<CoreIntelligenceResult | null> => {
    const ai = getAIClient();
    if (!ai) {
        console.error("Core Intelligence: No AI client — API key not set or invalid");
        return null;
    }

    // 1. Prepare minimal inputs (limit to 200 txns to avoid token overflow)
    const inputs = txns.slice(0, 200).map(t => ({
        id: t.id,
        txnDate: t.txnDate,
        description: t.description,
        descriptionRaw: t.descriptionRaw || t.description,
        amount: t.amount,
        direction: t.direction,
        instrumentId: t.instrumentId,
        instrumentType: instruments[t.instrumentId]?.instrumentType?.includes('COMPANY') ? 'Company' : 'Personal',
        status: t.status,
        vendorName: t.vendorName,
        categoryCode: t.categoryCode
    }));

    // 2. Prepare Context (Registries) - use available fields
    const registryContext = {
        companyVendors: registries.company_vendors.slice(0, 80).reduce((acc: any, v) => { 
            acc[v.vendor_name_canonical] = { totalSpend: v.total_spend, txnCount: v.txn_count, categories: v.category_distribution }; 
            return acc; 
        }, {}),
        personalMerchants: registries.personal_merchants.slice(0, 80).reduce((acc: any, v) => { 
            acc[v.vendor_name_canonical] = { totalSpend: v.total_spend, txnCount: v.txn_count, categories: v.category_distribution }; 
            return acc; 
        }, {}),
        employees: registries.employees.reduce((acc: any, e) => { 
            acc[e.employee_name_canonical] = { totalPaid: e.total_paid, txnCount: e.txn_count }; 
            return acc; 
        }, {}),
        clients: registries.clients.reduce((acc: any, c) => { 
            acc[c.client_name_canonical] = { totalReceived: c.total_received, txnCount: c.txn_count }; 
            return acc; 
        }, {}),
    };

    try {
        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                suggestionsByTxn: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            overrideApplied: { type: Type.BOOLEAN },
                            suggested: {
                                type: Type.OBJECT,
                                properties: {
                                    canonical: { type: Type.STRING },
                                    categoryCode: { type: Type.STRING },
                                    entityType: { type: Type.STRING },
                                    entityName: { type: Type.STRING },
                                    confidence: { type: Type.NUMBER },
                                    reason: { type: Type.STRING },
                                    aliasAction: { type: Type.STRING },
                                    alias: {
                                        type: Type.OBJECT,
                                        properties: { raw: { type: Type.STRING }, canonical: { type: Type.STRING } }
                                    },
                                    flags: { type: Type.ARRAY, items: { type: Type.STRING } }
                                }
                            }
                        }
                    }
                },
                registryDiff: {
                    type: Type.OBJECT,
                    properties: {
                        aliasMap: {
                            type: Type.OBJECT,
                            properties: {
                                add: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { raw: { type: Type.STRING }, canonical: { type: Type.STRING } } } },
                                update: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { raw: { type: Type.STRING }, canonical: { type: Type.STRING } } } }
                            }
                        },
                        specialBuckets: {
                            type: Type.OBJECT,
                            properties: {
                                mukti: { type: Type.OBJECT, properties: { canonical: { type: Type.STRING }, trackingFlag: { type: Type.STRING } } },
                                managementOverhead: { type: Type.OBJECT, properties: { canonicals: { type: Type.ARRAY, items: { type: Type.STRING } }, trackingFlag: { type: Type.STRING } } }
                            }
                        }
                    }
                },
                stickyDefaults: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            canonical: { type: Type.STRING },
                            entityType: { type: Type.STRING },
                            defaultCategoryCode: { type: Type.STRING },
                            confidence: { type: Type.NUMBER },
                            why: { type: Type.STRING }
                        }
                    }
                },
                ambiguousEntities: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            raw: { type: Type.STRING },
                            candidates: { type: Type.ARRAY, items: { type: Type.STRING } },
                            suggestedCategory: { type: Type.STRING },
                            whyAmbiguous: { type: Type.STRING },
                            askUser: { type: Type.STRING }
                        }
                    }
                },
                validation: {
                    type: Type.OBJECT,
                    properties: {
                        errors: { type: Type.ARRAY, items: { type: Type.STRING } },
                        warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
                        stats: { type: Type.OBJECT, properties: { txnsProcessed: { type: Type.NUMBER }, lockedOverridesRespected: { type: Type.NUMBER }, newAliasesProposed: { type: Type.NUMBER }, newEntitiesProposed: { type: Type.NUMBER }, uncategorizedCount: { type: Type.NUMBER } } }
                    }
                }
            }
        };

        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: `
            ${MASTER_INTELLIGENCE_PROMPT}

            --- CONTEXT DATA ---
            EXISTING REGISTRIES: ${JSON.stringify(registryContext)}
            ALIAS MAP: ${JSON.stringify(aliasMap)}
            
            --- INPUT TRANSACTIONS ---
            ${JSON.stringify(inputs)}
            `,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                thinkingConfig: { thinkingBudget: 32768 }
            }
        });

        const text = response.text;
        if (!text) return null;
        return JSON.parse(text) as CoreIntelligenceResult;

    } catch (e) {
        console.error("Core Intelligence Failed", e);
        return null;
    }
};

// --- MASTER ANALYSIS ENGINE ---
// Updates signature to accept raw parsed CSV rows + metadata
export const runMasterAnalysis = async (
    csvRows: any[], 
    csvMeta: { rowCount: number, dateRange: [string, string] },
    referenceData: any
): Promise<MasterAnalysisResult | null> => {
    const ai = getAIClient();
    if (!ai) return null;

    // Prepare payload object adhering to Input Contract
    const payload = {
        schemaVersion: "master_analysis_v1",
        csvMeta: csvMeta,
        transactions: csvRows, // Raw parsed CSV rows
        referenceData: referenceData
    };

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            config: {
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 32768 }
            },
            contents: `
            ${MASTER_ANALYSIS_PROMPT}

            --- INPUT DATA PAYLOAD ---
            ${JSON.stringify(payload)}
            `
        });

        const text = response.text;
        if (!text) return null;
        return JSON.parse(text) as MasterAnalysisResult;

    } catch (e) {
        console.error("Master Analysis Failed", e);
        throw e;
    }
};

// --- NEW: MASTER CSV INGEST (RAW FILE NORMALIZATION) ---
export const runCsvNormalization = async (files: File[]): Promise<string | null> => {
    const ai = getAIClient();
    if (!ai) return null;

    try {
        // 1. Read all files into a single text block with delimiters
        let combinedInput = "";
        for (const file of files) {
            const text = await file.text();
            combinedInput += `\n--- START OF FILE: ${file.name} ---\n${text}\n--- END OF FILE ---\n`;
        }

        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            config: {
                thinkingConfig: { thinkingBudget: 32768 }
            },
            contents: `
            ${MASTER_CSV_INGEST_PROMPT}

            --- RAW INPUT FILES ---
            ${combinedInput}
            `
        });

        return response.text || null;

    } catch (e) {
        console.error("CSV Normalization Failed", e);
        throw e;
    }
};

// Legacy stubs (deprecated - kept for import compatibility)
export const runCategoryAutoSuggest = async (): Promise<any> => [];
export const runLedgerEnrichment = async (): Promise<any> => null;
export const askAccountantAI = async (): Promise<string> => "";
export const runDeepAnalysis = async (): Promise<any> => null;
