# CLAUDE.md — Instructions for Claude Code

**Repo:** `blufinclassify-v3`
**Owner:** Venkat S, Blustream
**Last updated:** May 2026
**Reference document:** `docs/REPORTS_SPEC.md` (the locked P&L specification)

---

## 0. Read This First, Always

Before doing **any** work on this repo, you must:

1. Read `docs/REPORTS_SPEC.md` end-to-end. It is the source of truth for the P&L hierarchy, every line item, and the data model. If a request conflicts with the spec, raise the conflict and ask before proceeding.
2. Read this file (`CLAUDE.md`) end-to-end.
3. Read `package.json`, `App.tsx`, `types.ts`, `services/taxonomy.ts`, and `store/store.tsx` to understand the existing architecture before writing any code.

You are working on a **production financial application** for a single owner-operated agency. The data is real money. Bugs that lose, double-count, or misclassify transactions cause real harm. Optimise for correctness over speed.

---

## 1. What This App Is

`blufinclassify-v3` is a React + Vite single-page application that ingests bank statements, credit card statements, and invoices, classifies every transaction, and produces P&L reports. It currently runs **entirely in the browser** with IndexedDB persistence. AI classification uses Google Gemini.

The app is being extended in two phases:

- **Phase 1 (this work):** Restructure reports to match the WPP-style P&L defined in `REPORTS_SPEC.md`. Add granular categorisation, vendor-to-P&L-line mapping, budget tracking, invoice tracking, statutory tracking, capex register.
- **Phase 2 (later, separate spec):** Add a backend (Vercel serverless + Supabase) for Gmail ingestion, SMS-from-email parsing, and MCP integration with multiple Gmail accounts.

You are working on Phase 1. Do not implement Phase 2 features unless explicitly asked.

---

## 2. The Business (Context You Need)

Blustream is a digital marketing/creative agency in India. Single legal entity in FY26. ~12 employees + 3 office support + 2 management. Revenue ~₹1.5cr/year. Multi-currency (INR primary, USD/HKD exports). GST registered. Professional Tax registered. Not yet PF/ESI registered.

The owner thinks about P&L the way WPP does at the group level: gross billings, pass-through costs stripped out, net revenue as the headline number, then granular cost lines. The full hierarchy is in `REPORTS_SPEC.md` Section 2.

**Key business facts you must internalise:**

- Vendors are paid from at least 6 different email accounts (`venkat@blustream.in`, `info@blustream.in`, `operations@blustream.in`, `svijay19@gmail.com`, `venkat@leaddigital.net`, `venkat@blueoceanmarketing.in`).
- Director (Venkat) has a current account with the company (mixed personal/company spend on company cards, reimbursements both directions).
- Variable pay is tied to revenue brackets (see `Payroll_26_1.xlsx` Master sheet).
- Capex threshold is ₹1,00,000.
- The "mixed personal" subscriptions on `svijay19@gmail.com` (Coursiv, Heartin, LiftPro, Toon App, Prequel, Meta Verified, Tapo, Google Play Pass) are **research tools for client work** and map to P&L line `6.3.15`. Do not flag as personal.

---

## 3. Architectural Constraints

You **must respect** the following constraints. Violating these is a critical error.

1. **Browser-only in Phase 1.** Do not add a backend, server, or any code that requires a server runtime. All persistence is IndexedDB. All AI calls are direct from browser to Gemini.

2. **Schema additions, not breaking changes.** The existing `Transaction`, `Document`, `AppState` types are in production. Add new optional fields. Do not rename or remove existing fields. Do not change the meaning of existing field values.

3. **Existing taxonomy stays valid.** `services/taxonomy.ts` category codes remain the coarse-grained classifier output. The new `pnlLineId` is an additional, more granular field. Mapping between them is in `REPORTS_SPEC.md` Section 5.3.

4. **Gemini stays the only LLM.** Do not introduce Claude API, OpenAI API, or any other LLM dependency in Phase 1. The Gemini service is in `services/geminiService.ts` and uses `gemini-2.5-flash-preview-04-17`.

5. **No new top-level dependencies without justification.** If you must add an npm package, explain why an existing dependency cannot do the job. Avoid heavy dependencies. Avoid React libraries that conflict with React 19.

6. **IndexedDB schema migrations must be backward-compatible.** Bump `DB_VERSION` in `services/storage.ts` and `services/idb.ts` when adding stores. Provide a migration path that preserves existing user data.

7. **No data deletion in migrations.** When restructuring, keep old fields populated. The user has months of classified data; do not invalidate it.

8. **All money is `number` in INR (paise resolution if needed) unless explicitly multi-currency.** Use `currency: 'INR' | 'USD' | 'HKD' | 'OTHER'` and `fxRate?: number` for non-INR. Never store strings for amounts.

9. **Dates are ISO 8601 strings (`YYYY-MM-DD`).** Months are `YYYY-MM`. Financial Year is `FY26`, `FY27`, etc. (April-to-March in India.)

10. **The `entityId` field defaults to `'blustream'` for FY26.** All new code must accept and pass through `entityId` even though only one value is used today.

---

## 4. Coding Standards

- TypeScript strict. No `any` unless interfacing with untyped libraries.
- Functional React. Hooks. No class components except the existing `ErrorBoundary`.
- File naming follows the existing convention: PascalCase for components, camelCase for services.
- Tests for any new pure logic in `services/`. Use the existing pattern (`*.test.ts`, simple assertions, no test framework — see `services/categoryClassifier.test.ts`). Run tests via `node` or however the existing tests run; check `package.json` first.
- No CSS-in-JS. Tailwind-style utility classes only (the existing components already use this pattern with regular className strings).
- Lucide icons only.
- `recharts` for charts. `xlsx` for Excel I/O. `papaparse` for CSV. Do not add alternatives.

---

## 5. Phase 1 Commit Plan

Implement the work in this exact order. Each commit must be self-contained, pass typecheck (`tsc --noEmit`), and not break existing functionality. Open a PR per commit (or a single branch with logical commit boundaries — your choice).

**Important:** After each commit, run the app locally (`npm run dev`) and verify the existing flows still work: file upload → parse → classify → ledger view → existing reports. If anything regresses, fix it before moving to the next commit.

### Commit 1: Documentation and Constants

**Goal:** Land the spec and the static P&L structure. No behaviour change.

Files to add:
- `docs/REPORTS_SPEC.md` (the spec — already provided)
- `docs/CLAUDE.md` (this file)
- `services/pnlStructure.ts` (the typed P&L tree)

`pnlStructure.ts` must export:
```typescript
export interface PnLLine { /* per REPORTS_SPEC.md §5.2 */ }
export const PNL_LINES: readonly PnLLine[]; // every L1, L2, L3 from §2.1
export const getPnLLine: (id: string) => PnLLine | undefined;
export const getChildren: (parentId: string | null) => PnLLine[];
export const getRollupLines: () => PnLLine[]; // computed=true
export const getActiveLines: () => PnLLine[];
```

Every entry from `REPORTS_SPEC.md` Section 2.1 must be present, with correct parentId, level, direction, computed, and active flags. Cross-check against the spec line-by-line. **Inactive lines** (6.1.14, 6.1.15, 6.6.14) have `active: false`.

Acceptance:
- [ ] `tsc --noEmit` passes
- [ ] Unit test verifies tree integrity: every non-root line has a valid parent, no cycles, levels match parent+1
- [ ] Unit test verifies all line IDs from REPORTS_SPEC are present (count match)

### Commit 2: Type Extensions

**Goal:** Extend `types.ts` with the new fields per `REPORTS_SPEC.md` §5.2. No behaviour change.

- Add `EntityId` type
- Add `pnlLineId`, `pnlSubTag`, `entityId`, `isPassthrough`, `passthroughClientId`, `isCapex`, `capexAssetCategory` to `Transaction` (all optional)
- Add `BudgetLine`, `Invoice`, `StatutoryLiability`, `VendorPnLMapping` interfaces
- Extend `AppState` to include new stores: `budget`, `invoices`, `statutory`, `vendorPnLMappings`, `pnlClassifications`
- Bump `meta.schemaVersion`

Migration: existing transactions get `entityId: 'blustream'` populated by a one-time migration in `store/store.tsx` `APP/HYDRATE_SUCCESS` handler.

Acceptance:
- [ ] `tsc --noEmit` passes
- [ ] App boots, existing data still loads, no console errors
- [ ] All existing Transaction objects gain `entityId: 'blustream'` after first hydration

### Commit 3: P&L Classifier (the core engine)

**Goal:** Given a Transaction, resolve it to a P&L line.

Add `services/pnlClassifier.ts`:
```typescript
export interface PnLClassificationInput {
  txn: Transaction;
  vendorMappings: VendorPnLMapping[];
}

export interface PnLClassificationResult {
  pnlLineId: string;
  confidence: 'manual' | 'rule' | 'vendor_map' | 'category_default' | 'gemini' | 'unresolved';
  reason: string;
  subTag?: string;
  isPassthrough?: boolean;
  isCapex?: boolean;
}

export function classifyToPnL(input: PnLClassificationInput): PnLClassificationResult;
```

**Resolution order (must be exactly this priority):**
1. Manual override (if user has set `pnlLineId` directly on the txn) → confidence: `manual`
2. Vendor mapping (if `vendorCanonical` exists in `VendorPnLMapping[]` registry) → confidence: `vendor_map`
3. Rule-based: hard-coded rules for unambiguous patterns (e.g. `description matches 'Adobe' → 6.3.5`, `amount >= 100000 AND categoryCode = 'EQUIPMENT_CAPEX' → Section 15`) → confidence: `rule`
4. Existing category code default mapping (per `REPORTS_SPEC.md` §5.3 table) → confidence: `category_default`. Some categories map to L2 (e.g. `SAAS_MCO_MARKETING_CREATIVE` → "varies"); in those cases, return `6.7.17` (Miscellaneous) and flag for review.
5. Gemini fallback (call `geminiService` with a prompt that includes the full PNL_LINES list + txn context) → confidence: `gemini`
6. Unresolved → return `pnlLineId: '6.7.17'`, `confidence: 'unresolved'`, set `txn.needsAttention = true`

**Capex flagging:**
- If `txn.amount >= 100000` AND category is in `[EQUIPMENT_CAPEX, IT_INFRASTRUCTURE, OFFICE_MAINTENANCE_REPAIRS]` AND description suggests asset purchase: set `isCapex: true`, route to Section 15.
- Otherwise expense it.

**Pass-through flagging:**
- If `categoryCode === 'COGS_MEDIA'` OR vendor mapping points to `2.x.x`: `isPassthrough: true`. Required: `passthroughClientId` must be set or flagged for review.

Add `services/pnlClassifier.test.ts` with at least 30 test cases covering:
- Each L2 area at least once
- Capex threshold edge cases (₹99,999 vs ₹1,00,000 vs ₹1,00,001)
- Pass-through detection
- Each confidence level reached
- Mixed personal subscriptions on svijay19@gmail.com → `6.3.15`
- Director reimbursement → `17.3` (below-line, not P&L)
- GST payment → `16.4` (below-line)

Acceptance:
- [ ] All tests pass
- [ ] Run classifier over existing seeded transactions in IDB; manually verify the buckets are sensible

### Commit 4: Vendor → P&L Mapping Registry

**Goal:** Editable vendor mapping table in Settings.

- Add to store: `state.vendorPnLMappings: Record<string, VendorPnLMapping>` keyed by `vendorCanonical`
- Add reducer cases: `VENDOR_PNL_MAP/UPSERT`, `VENDOR_PNL_MAP/DELETE`, `VENDOR_PNL_MAP/BULK_IMPORT`
- Add UI in `components/SettingsPage.tsx`: a new section "Vendor → P&L Mapping" with:
  - Searchable list of all vendors seen in transactions
  - For each vendor: dropdown to select P&L line (filtered to L3 active lines)
  - Optional sub-tag input
  - "Auto-suggest with Gemini" button per vendor
  - Bulk import from CSV
- Seed initial mappings from the `IT_AND_MCO_Vendors__Status_Update_2.xlsx` file's vendor list:
  - Adobe → 6.3.5, Canva → 6.3.6, Figma → 6.3.7
  - ChatGPT → 6.3.1, Claude AI → 6.3.1, Claude API → 6.3.2, Gemini API → 6.3.2
  - Fireflies → 6.3.3, HeyGen → 6.3.3, Eleven Labs → 6.3.3
  - Apify → 6.3.4
  - Mailchimp → 6.3.9, DataforSEO → 6.3.10, Awario → 6.3.11, LinkTree → 6.3.14
  - Coursiv → 6.3.15, Heartin → 6.3.15, LiftPro → 6.3.15, Toon App → 6.3.15, Prequel → 6.3.15, Meta Verified → 6.3.15, Tapo → 6.3.15, Google Play Pass → 6.3.15
  - Zoom → 6.3.16, Slack → 6.3.17, Apple Storage → 6.3.18, Google One → 6.3.19, LinkedIn (premium) → 6.3.20
  - Hostinger → 6.3.21, Google Cloud → 6.3.22, Digital Ocean → 6.3.22, Vercel → 6.3.22, CloudNow → 6.3.23
  - Supabase → 6.3.25, GitHub → 6.3.26, WPMU Dev → 6.3.29
  - VI / Jio / Airtel mobile numbers → 6.3.31, Airtel Broadband → 6.3.32

Acceptance:
- [ ] User can add/edit/delete a vendor mapping in Settings
- [ ] Mapping changes immediately re-classify all matching transactions (via store update)
- [ ] Seed data populates on first run only (don't overwrite user edits on subsequent loads)
- [ ] Bulk CSV import works for `vendorCanonical,pnlLineId,subTag` rows

### Commit 5: P&L Report Component

**Goal:** Replace the existing PnL tab in `components/Reports.tsx` with a new component that renders the full hierarchy.

- Add `components/PnLReport.tsx`
- Wire it into `components/Reports.tsx` (replace the existing `'pnl'` tab content; keep other tabs untouched for now)

Layout per `REPORTS_SPEC.md` §4.1:
- Tree view, default expanded to L2
- Period selector: Month / Quarter / FY-YTD / Custom
- Comparison: vs Prior Period / vs Prior Year / vs Budget
- Columns: Line | Actual | Budget | Variance (₹) | Variance (%)
- Computed lines (3, 5, 7, 9, 12, 14) in bold
- Inactive lines shown greyed out with "—"
- Click any L3 → opens filtered Ledger view

Engine: a new `services/pnlAggregator.ts` that:
- Takes the full transaction list + period + entityId
- Returns a `Map<pnlLineId, { actual, budget, variance, txnIds[] }>` for every line in PNL_LINES
- Handles rollups (L1 = sum of L2; L2 = sum of L3)
- Handles computed lines (3, 5, 7, 9, 12, 14)
- Excludes below-line (sections 15-18) from P&L total

Acceptance:
- [ ] FY26 YTD P&L renders in < 2 seconds for current data volume
- [ ] All 14 L1 sections present (including computed)
- [ ] Drill-through works: click `6.3.5` → Ledger filters to Adobe transactions only
- [ ] Inactive lines render as "—" not "₹0"
- [ ] Variance calculation correct (positive variance for cost lines = bad; for revenue = good — colour code accordingly)

### Commit 6: Budget Import & Budget Vs Actual

**Goal:** Import the FY26 budget sheet and overlay on the P&L Report.

- Add `services/budgetImport.ts`: parses the FY26 Budget xlsx (the format is messy — see `FY_26_BUDGET_.xlsx`); maps each line to a `pnlLineId`.
- Add Settings page section: "Import Budget" — file picker, preview of mapped lines, confirm to commit.
- Add `state.budget: Record<EntityId, Record<FY, BudgetLine[]>>`
- Add `components/BudgetVsActual.tsx` — separate report tab; or fold into P&L Report's "vs Budget" comparison.

Mapping: Budget rows must be manually mapped on first import (the budget sheet uses informal names like "BS Salary", "MCO/IT", "Travel"). Provide a UI that shows each budget row and asks the user to pick the P&L line. Save the mapping for next year.

Acceptance:
- [ ] Existing FY26 Budget sheet imports without data loss
- [ ] Each budget row maps to either an L1, L2, or L3 line (user chooses)
- [ ] P&L Report "vs Budget" column populates from imported budget
- [ ] Re-importing replaces, not appends

### Commit 7: Vendor Spend Report

**Goal:** Replicate `IT_AND_MCO_Vendors__Status_Update_2.xlsx` as a live report.

- Add `components/VendorSpendReport.tsx`
- Add as a new tab in the Reports view
- Per `REPORTS_SPEC.md` §4.2: rows = vendors grouped by L2, columns = 12 months + Total + Avg
- Filters: paying email account, P&L category, amount range
- Highlight MoM change > 25%

Acceptance:
- [ ] Output matches the existing spreadsheet to ±5% on annual totals
- [ ] Filters work
- [ ] Export to xlsx produces the same shape as the source spreadsheet

### Commit 8: Invoice Tracker

**Goal:** Replicate `Invoice_Updated_2026.xlsx` and add payment matching.

- Add `services/invoiceTracker.ts`: invoice lifecycle (create, mark paid, link to txns)
- Add `components/ClientInvoiceTracker.tsx`
- Auto-match incoming credits in the ledger to invoices (by amount + client + date proximity)
- Aging buckets: 0-30 / 31-60 / 61-90 / 90+

Acceptance:
- [ ] Importing existing invoice xlsx populates state.invoices
- [ ] Auto-matching marks at least 50% of historical invoices as paid (verify against bank statement credits)
- [ ] Aging report shows outstanding correctly

### Commit 9: Statutory Liabilities Dashboard

**Goal:** Section 16 tracking.

- Add `services/statutoryTracker.ts`
- Add `components/StatutoryDashboard.tsx`
- Track GST (output, input, net, paid), TDS (receivable, payable, deposited), PT (registered), advance tax, self-assessment tax

Most of these are entered manually monthly. The app shows: liability accrued (from invoices/payroll), payments made (from ledger), outstanding, due date, overdue flag.

Acceptance:
- [ ] User can input monthly GST return summary
- [ ] TDS receivable auto-calculated from invoices issued
- [ ] Overdue items flag in red

### Commit 10: Capex Register

**Goal:** Section 15 tracking, separate from P&L.

- Add `components/CapexRegister.tsx`
- Lists all transactions flagged `isCapex: true`
- Allow manual entry for capex purchases the app missed (cash purchases, etc.)
- D&A input form: at year-end, user enters the CA-provided depreciation per asset category; it gets posted to Section 8

Acceptance:
- [ ] All txns ≥ ₹1L in capex-eligible categories show in the register
- [ ] User can add/edit/delete manual capex entries
- [ ] D&A entries flow into the P&L Report Section 8

### Commit 11: Director Reconciliation Audit

**Goal:** Audit the existing `components/DirectorReconciliation.tsx` against `REPORTS_SPEC.md` Section 17 and add missing sub-lines.

- Read the existing component
- For each of 17.1–17.7, verify it's tracked. Add what's missing.
- Director Net Position must equal: 17.4 + 17.3 − 17.2 − 17.5 − 17.6 (verify the math)

Acceptance:
- [ ] All 17.x lines visible
- [ ] Net position reconciles for any sample period

### Commit 12: Payroll Variance

**Goal:** Modelled vs Paid for each employee.

- Add `services/payrollModel.ts`: computes modelled pay per the revenue-bracket model in `Payroll_26_1.xlsx` Master sheet
- Add `components/PayrollVariance.tsx`
- For each employee: bracket-modelled pay (based on company revenue for the period) vs actual paid (from ledger) → variance + reason field

Acceptance:
- [ ] Modelled pay matches the Master sheet's brackets exactly (test with sample revenue values)
- [ ] Actual paid sums correctly per employee per month
- [ ] Variance shows; user can annotate

### Commit 13: Cash Position by Account

**Goal:** Per-instrument cash flow.

- Add `components/CashPosition.tsx`
- For each instrument in the registry: opening | inflows | outflows | closing
- Show linked email account
- Show top 5 vendors by spend per instrument

Acceptance:
- [ ] Closing balances reconcile with the latest statement balance per instrument
- [ ] Email account linkage visible

---

## 6. Things You Must Not Do

1. **Do not modify** `services/parsers.ts`, `services/failsafeClassifier.ts`, or `services/geminiService.ts` beyond minimal additions needed to support the new pipeline. These are the existing classifier engine; rewriting them is out of scope.
2. **Do not delete** any existing component or service file even if it appears unused. Mark legacy with a comment if needed.
3. **Do not add a backend** in any commit in this plan. Phase 2 will do that.
4. **Do not bypass** the existing `store/store.tsx` reducer pattern. All state mutations go through actions.
5. **Do not use `localStorage`** for new state. Use IndexedDB via the existing `StorageService`.
6. **Do not hardcode** vendor mappings into `pnlClassifier.ts`. They must come from the editable registry (Commit 4).
7. **Do not assume** the user wants Gemini to auto-classify on every commit run. Gemini calls cost money. Default to rule-based; Gemini is a fallback.
8. **Do not silently change** the existing taxonomy codes. They are referenced in many places.
9. **Do not skip tests.** Every new service file in this plan needs at least one test file.
10. **Do not commit secrets.** The Gemini API key is user-provided at runtime via Settings.

---

## 7. How to Run, Test, and Verify

```bash
# Install
npm install

# Dev
npm run dev          # Vite dev server, usually http://localhost:5173

# Typecheck
npx tsc --noEmit

# Build
npm run build

# Tests (existing pattern uses simple node-runnable .test.ts files; check existing test runner setup)
# If no formal test runner exists, run individual tests via:
npx tsx services/pnlClassifier.test.ts
```

Before opening any PR:
1. `npx tsc --noEmit` passes
2. `npm run build` passes
3. App boots in dev, no console errors
4. Existing flows untouched: file upload → parse → classify → ledger → reports
5. New tests pass

---

## 8. Working with the Owner

- The owner (Venkat) is non-technical but extremely sharp on the business logic. Push back if a request contradicts `REPORTS_SPEC.md`. Ask before deviating.
- For any P&L line ambiguity, default to **more granular**, not less. The owner has explicitly said "easier now than later."
- For any ambiguity in vendor categorisation, **flag for review** (set `needsAttention: true`) rather than guess.
- When showing progress, show numbers: "Classified 847 transactions across 23 vendors into 67 P&L lines; 12 flagged for review."

---

## 9. Phase 2 Preview (Not For This Phase)

For your awareness only — do not implement:

- Add Vercel serverless API in `/api`
- Add Supabase as the persistent store (mirror IDB to Postgres)
- Add Gmail OAuth + invoice/statement ingestion per email account
- Add SMS-from-email parsing webhook
- Expose data as MCP tools so Claude Desktop can query the P&L conversationally
- Multi-entity (LeadDigital, BlueOcean) consolidation in FY27

The schema additions in Phase 1 (`entityId`, `pnlLineId` on every transaction) are the foundation for Phase 2. Don't paint yourself into a corner.

---

## 10. When You're Done with Phase 1

The user must be able to:

1. Open the app, see a P&L Report that looks like a WPP group P&L for Blustream
2. Toggle Month / Quarter / FY-YTD
3. Compare vs Budget and vs Prior Period
4. Drill from any P&L line into the underlying transactions
5. See vendor spend grouped by P&L category, exactly like their existing IT_AND_MCO sheet but live
6. See invoices issued, with paid/unpaid status auto-tracked
7. See payroll variance between modelled and paid
8. See cash position per bank account / card
9. See statutory liabilities (GST, TDS, PT) with overdue flagging
10. See director reconciliation (Venkat's current account)
11. See capex register (items ≥ ₹1L)
12. Edit vendor → P&L mappings in Settings
13. Import the FY26 budget and overlay it on actuals

When all 13 of those work, Phase 1 is complete.
