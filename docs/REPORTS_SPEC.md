# Blustream Reports Specification

**Status:** LOCKED v1.0 — May 2026
**Owner:** Venkat S
**App:** blufinclassify-v3
**Reference model:** WPP-style P&L (group-level), adapted for an Indian agency at ~₹1.5cr revenue scale

This document is the single source of truth for what the app must report. Every reporting feature, classifier rule, and database schema must conform to this. Changes to this document require a version bump and a corresponding migration plan.

---

## 1. Confirmed Operating Decisions

| # | Decision | Status | Implication |
|---|---|---|---|
| 1 | PF / ESI registration | **Not registered (will register later)** | P&L lines 6.1.6.1, 6.1.6.2 exist but default to ₹0; show in UI as inactive but selectable |
| 2 | Professional Tax registration | **Registered** | P&L line 6.1.6.3 active |
| 3 | Group Health Insurance | **Not subscribed (will add later)** | P&L line 6.6.3.5 exists, defaults to ₹0, selectable |
| 4 | Mixed personal subscriptions on svijay19@gmail.com | **Treat as research tools (MCO Marketing & Analytics)** | Map to line 6.3.3 with sub-tag `RESEARCH_REFERENCE` |
| 5 | Depreciation schedule | **CA-provided, year-end adjustment** | Section 8 (D&A) is a manual annual entry, not auto-computed |
| 6 | Capex threshold | **₹1,00,000 (one lakh)** | Items ≥ ₹1L go to Capex (Section 15), below go to operating expense |
| 7 | Multi-entity | **Single entity (Blustream) for FY26; LeadDigital and BlueOceanMarketing are brand aliases** | Schema includes `entity_id` for FY27 readiness; all FY26 transactions tagged `entity_id = 'blustream'` |

---

## 2. P&L Hierarchy (Three Levels)

The P&L is structured as a tree with three levels:
- **Level 1 (L1):** Top-level P&L sections (Revenue, OpEx, etc.)
- **Level 2 (L2):** Major line items (Staff Costs, Establishment Costs, etc.)
- **Level 3 (L3):** Granular sub-lines that map to transactions

Every transaction must resolve to exactly one L3 line. L2 and L1 totals are computed by rollup.

### 2.1 P&L Line Catalogue

The complete hierarchy is defined in `services/pnlStructure.ts` (see Section 4 for schema). The full list is reproduced here for reference.

#### L1: 1. REVENUE

| ID | Name | Direction | Notes |
|---|---|---|---|
| 1.1 | Service Revenue — Non-Media (Domestic) | Credit | INR domestic services excl. media execution |
| 1.1.1 | Retainer Fees | Credit | Apcer, Amol Kadam, Synup |
| 1.1.2 | Project Fees — Web Development | Credit | Jasmine, Imersive |
| 1.1.3 | Project Fees — Video Production | Credit | Jasmine, Firmenich |
| 1.1.4 | Project Fees — Creative & Content | Credit | Changes Advertising, Gaitonde |
| 1.1.5 | Project Fees — Social Media Management | Credit | Kalpavriksha SMM, Gaitonde |
| 1.1.6 | Project Fees — SEO | Credit | Kalpavriksha SEO |
| 1.1.7 | Project Fees — Webinar/Event Management | Credit | Prakruthi |
| 1.1.8 | Hosting & Maintenance Fees | Credit | Kalpavriksha hosting, Phoenix hosting |
| 1.1.9 | Logo & Brand Identity | Credit | Dilon Kirby |
| 1.1.10 | Other Non-Media Services | Credit | catch-all |
| 1.2 | Service Revenue — Media (Domestic) | Credit | |
| 1.2.1 | Media Execution Fees | Credit | Changes, Synup managed service |
| 1.2.2 | Digital Media Mark-up | Credit | Kalpavriksha digital media |
| 1.3 | Service Revenue — Exports (USD) | Credit | |
| 1.3.1 | USD Retainers | Credit | Covertree |
| 1.3.2 | USD Projects | Credit | Imersive (TIU), Dilon |
| 1.4 | Service Revenue — Exports (Other FX) | Credit | |
| 1.4.1 | HKD Projects | Credit | Phoenix Marketing |
| 1.4.2 | Other Foreign Currency | Credit | Future-proofed |
| 1.5 | Other Operating Income | Credit | |
| 1.5.1 | Reimbursement Income (Travel/Expenses billed) | Credit | |
| 1.5.2 | Late Fees / Interest on Receivables | Credit | |
| 1.6 | Non-Operating Income | Credit | |
| 1.6.1 | Bank Interest Earned | Credit | |
| 1.6.2 | FX Gain on Realisation | Credit | |
| 1.6.3 | Refunds & Reversals Received | Credit | |
| 1.6.4 | Miscellaneous Income | Credit | |

#### L1: 2. PASS-THROUGH COSTS

| ID | Name | Direction | Notes |
|---|---|---|---|
| 2.1 | Media Pass-through | Debit | |
| 2.1.1 | Meta Ads (Client) | Debit | Tagged with client_id |
| 2.1.2 | Google Ads (Client) | Debit | |
| 2.1.3 | LinkedIn Ads (Client) | Debit | |
| 2.1.4 | Other Platform Ads (Client) | Debit | YouTube, Twitter, programmatic |
| 2.2 | Production Pass-through | Debit | |
| 2.2.1 | Stock Media (Client Work) | Debit | |
| 2.2.2 | Influencer Payments | Debit | |
| 2.2.3 | Print/OOH Production | Debit | |
| 2.3 | Tech Pass-through | Debit | |
| 2.3.1 | Domains & SSL (Client) | Debit | |
| 2.3.2 | Third-party SaaS for Client | Debit | Shopify apps, plugins |

#### L1: 3. NET REVENUE (computed)

= 1. REVENUE − 2. PASS-THROUGH COSTS

This is the headline number. All margin calculations use Net Revenue, not Gross Billings.

#### L1: 4. COST OF SERVICES (Direct Delivery)

| ID | Name | Direction | Notes |
|---|---|---|---|
| 4.1 | Freelancer & Contractor Fees | Debit | |
| 4.1.1 | Designers (Freelance) | Debit | |
| 4.1.2 | Developers (Freelance) | Debit | |
| 4.1.3 | Video Editors / Animators | Debit | |
| 4.1.4 | Copywriters | Debit | |
| 4.1.5 | Voiceover Artists | Debit | |
| 4.1.6 | Other Specialist Freelancers | Debit | |
| 4.2 | Stock & Asset Licensing (Own Use) | Debit | |
| 4.2.1 | Stock Photo / Video | Debit | |
| 4.2.2 | Music Licensing | Debit | |
| 4.2.3 | Font Licensing | Debit | |
| 4.3 | Production Tools (Per-Project) | Debit | |
| 4.3.1 | Equipment Rental | Debit | Cameras, lights, mics |
| 4.3.2 | Studio Rental | Debit | |
| 4.4 | Project-Specific Software | Debit | One-off SaaS not in MCO |

#### L1: 5. GROSS PROFIT (computed)

= 3. NET REVENUE − 4. COST OF SERVICES

#### L1: 6. OPERATING EXPENSES

##### L2: 6.1 Staff Costs

| ID | Name | Direction | Notes |
|---|---|---|---|
| 6.1.1 | Salaries — BS Execution Team (Fixed) | Debit | Hridam, Sabri, Talib, Joshua, Karthi, Gopika, Narmada, Riya, Mahika, Nayan, Shubashini, Nikhil |
| 6.1.2 | Salaries — BS Execution Team (Variable) | Debit | Per revenue-bracket model |
| 6.1.3 | Salaries — Market Intel Team (Fixed) | Debit | (employee tag required) |
| 6.1.4 | Salaries — Market Intel Team (Variable) | Debit | |
| 6.1.5 | Salaries — New Capability/NC Team (Fixed) | Debit | |
| 6.1.6 | Salaries — New Capability/NC Team (Variable) | Debit | |
| 6.1.7 | Director Salary — Venkat (Fixed) | Debit | |
| 6.1.8 | Director Variable Pay — Venkat | Debit | |
| 6.1.9 | Director Salary — Neelam | Debit | |
| 6.1.10 | Office Support — Driver Salary | Debit | Sarathy |
| 6.1.11 | Office Support — Office Help Salary | Debit | Mukti |
| 6.1.12 | Office Support — Maid | Debit | Vijaya |
| 6.1.13 | Office Support — Other | Debit | |
| 6.1.14 | Statutory — PF Employer Share | Debit | **Inactive (not registered); placeholder** |
| 6.1.15 | Statutory — ESI Employer Share | Debit | **Inactive; placeholder** |
| 6.1.16 | Statutory — Professional Tax (Employer) | Debit | **Active** |
| 6.1.17 | Statutory — LWF | Debit | State-specific |
| 6.1.18 | Statutory — Gratuity Provision | Debit | Annual |
| 6.1.19 | Statutory — Bonus (Statutory) | Debit | Diwali / annual |
| 6.1.20 | Welfare — Staff Meals & Pantry | Debit | Daily tea/coffee/snacks |
| 6.1.21 | Welfare — Team Lunches & Dinners | Debit | |
| 6.1.22 | Welfare — Team Outings & Offsites | Debit | |
| 6.1.23 | Welfare — Festival Celebrations | Debit | |
| 6.1.24 | Welfare — Health Check-ups | Debit | |
| 6.1.25 | Recruitment — Job Boards | Debit | Naukri, LinkedIn Recruiter |
| 6.1.26 | Recruitment — Agency Fees | Debit | |
| 6.1.27 | Recruitment — Background Verification | Debit | |
| 6.1.28 | Recruitment — Onboarding Kit | Debit | |
| 6.1.29 | L&D — Online Courses | Debit | Coursera, Udemy |
| 6.1.30 | L&D — Books & Material | Debit | |
| 6.1.31 | L&D — Certifications | Debit | |
| 6.1.32 | L&D — External Training | Debit | |
| 6.1.33 | Reimb. — Internet (WFH) | Debit | |
| 6.1.34 | Reimb. — Phone | Debit | |
| 6.1.35 | Reimb. — Other Employee | Debit | |
| 6.1.36 | Stipends — Interns | Debit | |
| 6.1.37 | Referral Fees — Employee | Debit | |

##### L2: 6.2 Establishment Costs

| ID | Name | Direction | Notes |
|---|---|---|---|
| 6.2.1 | Rent — Primary Office | Debit | |
| 6.2.2 | Rent — Secondary Location | Debit | Studio, storage, satellite |
| 6.2.3 | Rent — Coworking / Hotdesk | Debit | |
| 6.2.4 | Maintenance — Society/Building Charges | Debit | |
| 6.2.5 | Maintenance — Repairs & Refurbishment | Debit | |
| 6.2.6 | Maintenance — Pest Control & Cleaning | Debit | |
| 6.2.7 | Utilities — Electricity | Debit | |
| 6.2.8 | Utilities — Water | Debit | |
| 6.2.9 | Utilities — Gas | Debit | |
| 6.2.10 | Office Supplies — Stationery & Printing | Debit | |
| 6.2.11 | Office Supplies — Pantry | Debit | Tea, coffee, snacks |
| 6.2.12 | Office Supplies — Cleaning | Debit | |
| 6.2.13 | Office Supplies — Drinking Water | Debit | |
| 6.2.14 | Property Tax | Debit | |
| 6.2.15 | Trade License | Debit | |

##### L2: 6.3 Technology & IT Costs

| ID | Name | Direction | Notes |
|---|---|---|---|
| 6.3.1 | MCO — AI: LLM Subscriptions | Debit | ChatGPT, Claude, Gemini |
| 6.3.2 | MCO — AI: LLM API | Debit | Claude API, OpenAI API, Gemini API |
| 6.3.3 | MCO — AI: Audio/Video AI | Debit | Eleven Labs, HeyGen, Fireflies |
| 6.3.4 | MCO — AI: Other | Debit | Apify |
| 6.3.5 | MCO — Design: Adobe | Debit | All Adobe seats |
| 6.3.6 | MCO — Design: Canva | Debit | |
| 6.3.7 | MCO — Design: Figma | Debit | |
| 6.3.8 | MCO — Design: Other | Debit | |
| 6.3.9 | MCO — Marketing Tools: Email | Debit | Mailchimp |
| 6.3.10 | MCO — Marketing Tools: SEO | Debit | DataforSEO |
| 6.3.11 | MCO — Marketing Tools: Social Listening | Debit | Awario |
| 6.3.12 | MCO — Marketing Tools: SMM Tools | Debit | Buffer, Hootsuite |
| 6.3.13 | MCO — Marketing Tools: Analytics | Debit | |
| 6.3.14 | MCO — Marketing Tools: Link Mgmt | Debit | LinkTree |
| 6.3.15 | MCO — Marketing Tools: Research/Reference | Debit | **Coursiv, Heartin, LiftPro, Toon App, Prequel, Meta Verified, Tapo, Google Play Pass** — research for client work |
| 6.3.16 | MCO — Comms: Video Conferencing | Debit | Zoom |
| 6.3.17 | MCO — Comms: Messaging | Debit | Slack |
| 6.3.18 | MCO — Comms: Cloud Storage (Apple) | Debit | |
| 6.3.19 | MCO — Comms: Cloud Storage (Google) | Debit | Google One |
| 6.3.20 | MCO — Comms: LinkedIn Premium | Debit | |
| 6.3.21 | IT — Hosting: Web Hosting | Debit | Hostinger |
| 6.3.22 | IT — Hosting: Cloud Compute | Debit | Google Cloud, Digital Ocean, Vercel |
| 6.3.23 | IT — Hosting: Managed Hosting | Debit | CloudNow |
| 6.3.24 | IT — Hosting: CDN | Debit | Cloudflare paid tier |
| 6.3.25 | IT — Database & Backend | Debit | Supabase |
| 6.3.26 | IT — DevOps: Source Control | Debit | GitHub |
| 6.3.27 | IT — DevOps: CI/CD | Debit | |
| 6.3.28 | IT — DevOps: Monitoring | Debit | Sentry, Datadog |
| 6.3.29 | IT — DevOps: WordPress Tools | Debit | WPMU Dev |
| 6.3.30 | IT — Domains & SSL (Own) | Debit | |
| 6.3.31 | Telecom — Mobile (per number) | Debit | Tagged with phone_number |
| 6.3.32 | Telecom — Office Broadband | Debit | Airtel Broadband |
| 6.3.33 | Telecom — Backup/Secondary ISP | Debit | |
| 6.3.34 | Telecom — Mobile Data Cards/Hotspot | Debit | |
| 6.3.35 | Hardware — Below Capex Threshold | Debit | Cables, mice, keyboards (< ₹1L) |

##### L2: 6.4 Sales, Marketing & Business Development (Own Brand)

| ID | Name | Direction | Notes |
|---|---|---|---|
| 6.4.1 | Own Brand — Meta Ads | Debit | Blustream's own ad account |
| 6.4.2 | Own Brand — Google Ads | Debit | |
| 6.4.3 | Own Brand — LinkedIn Ads | Debit | |
| 6.4.4 | Own Brand — Content Production | Debit | Blog, video, podcast |
| 6.4.5 | Own Brand — Stock & Assets | Debit | |
| 6.4.6 | Events — Conference Attendance | Debit | Tickets |
| 6.4.7 | Events — Conference Sponsorship | Debit | Booth, sponsor packages |
| 6.4.8 | Events — Trade Shows | Debit | |
| 6.4.9 | Events — Networking | Debit | |
| 6.4.10 | Events — Hosted Events | Debit | |
| 6.4.11 | BD — Pitch Materials | Debit | |
| 6.4.12 | BD — RFP Submission | Debit | |
| 6.4.13 | BD — Proposal Templates | Debit | |
| 6.4.14 | PR — Agency Fees | Debit | |
| 6.4.15 | PR — Press Releases | Debit | |
| 6.4.16 | PR — Awards Submissions | Debit | Effies, Kyoorius |
| 6.4.17 | Memberships — Industry Bodies | Debit | AAAI, IAMAI |
| 6.4.18 | Memberships — Trade Publications | Debit | |
| 6.4.19 | Memberships — Paid Newsletters | Debit | |
| 6.4.20 | Branded Merchandise — Internal Swag | Debit | |
| 6.4.21 | Branded Merchandise — Client Gifts | Debit | Diwali, year-end |
| 6.4.22 | Branded Merchandise — Prospect Gifts | Debit | |
| 6.4.23 | Referral & Commission Paid | Debit | |
| 6.4.24 | Affiliate Payouts | Debit | |

##### L2: 6.5 Travel, Vehicle & Fuel

| ID | Name | Direction | Notes |
|---|---|---|---|
| 6.5.1 | Local Travel — Cabs (Uber/Ola/Rapido) | Debit | |
| 6.5.2 | Local Travel — Auto/Metro/Bus | Debit | |
| 6.5.3 | Local Travel — Driver Reimbursable (Sarathy) | Debit | |
| 6.5.4 | Air — Domestic Flights | Debit | |
| 6.5.5 | Air — International Flights | Debit | |
| 6.5.6 | Trains (IRCTC) | Debit | |
| 6.5.7 | Bus (Intercity) | Debit | |
| 6.5.8 | Accommodation — Hotels (Domestic) | Debit | |
| 6.5.9 | Accommodation — Hotels (International) | Debit | |
| 6.5.10 | Accommodation — Airbnb / Serviced | Debit | |
| 6.5.11 | Per-diem & Travel Meals | Debit | |
| 6.5.12 | Travel — Visa Fees | Debit | |
| 6.5.13 | Travel — Forex Card / FX Mark-up | Debit | |
| 6.5.14 | Travel — Travel Insurance | Debit | |
| 6.5.15 | Vehicle — Fuel (Company Vehicle) | Debit | |
| 6.5.16 | Vehicle — Fuel (Director Reimb.) | Debit | |
| 6.5.17 | Vehicle — Fuel (Driver) | Debit | |
| 6.5.18 | Vehicle — Servicing | Debit | |
| 6.5.19 | Vehicle — Repairs | Debit | |
| 6.5.20 | Vehicle — Tyres / Battery | Debit | |
| 6.5.21 | Vehicle — Cleaning | Debit | |
| 6.5.22 | Vehicle — Insurance | Debit | |
| 6.5.23 | Vehicle — RC / FasTag | Debit | |
| 6.5.24 | Vehicle — Parking | Debit | |
| 6.5.25 | Vehicle — Tolls | Debit | |
| 6.5.26 | Vehicle — Traffic Fines | Debit | |
| 6.5.27 | Travel — Client Reimbursable (track for billback) | Debit | Offsets to revenue |

##### L2: 6.6 Professional & Statutory Costs

| ID | Name | Direction | Notes |
|---|---|---|---|
| 6.6.1 | Professional — Chartered Accountant | Debit | Audit, filing |
| 6.6.2 | Professional — Legal/Lawyer | Debit | |
| 6.6.3 | Professional — Company Secretary | Debit | |
| 6.6.4 | Professional — Tax Consultant | Debit | |
| 6.6.5 | Professional — HR Consultant | Debit | |
| 6.6.6 | Professional — Strategy/Business Consultant | Debit | |
| 6.6.7 | Audit — Statutory Audit Fee | Debit | |
| 6.6.8 | Audit — Internal Audit | Debit | |
| 6.6.9 | Compliance — ROC/MCA Filings | Debit | |
| 6.6.10 | Insurance — Office/Property | Debit | |
| 6.6.11 | Insurance — Cyber | Debit | |
| 6.6.12 | Insurance — Professional Indemnity | Debit | |
| 6.6.13 | Insurance — D&O | Debit | |
| 6.6.14 | Insurance — Group Health (Employees) | Debit | **Inactive; placeholder** |
| 6.6.15 | Statutory Fees — ROC Filing | Debit | |
| 6.6.16 | Statutory Fees — GST Filing | Debit | |
| 6.6.17 | Statutory Fees — TDS Filing | Debit | |
| 6.6.18 | Statutory Fees — License Renewals | Debit | |
| 6.6.19 | IP — Trademark Registration | Debit | |
| 6.6.20 | IP — Trademark Renewal | Debit | |
| 6.6.21 | IP — Copyright/Patent | Debit | |

##### L2: 6.7 Other Operating Costs

| ID | Name | Direction | Notes |
|---|---|---|---|
| 6.7.1 | Postage & Courier | Debit | Bluedart, DTDC |
| 6.7.2 | Document Storage | Debit | |
| 6.7.3 | Bank Charges — Account Maintenance | Debit | |
| 6.7.4 | Bank Charges — NEFT/RTGS/Wire | Debit | |
| 6.7.5 | Bank Charges — Cheque Book | Debit | |
| 6.7.6 | Bank Charges — Cash Handling | Debit | |
| 6.7.7 | Bank Charges — Card Annual Fees | Debit | |
| 6.7.8 | Bank Charges — Card Late Fees | Debit | |
| 6.7.9 | Bad Debts Written Off | Debit | |
| 6.7.10 | Provision for Doubtful Debts | Debit | |
| 6.7.11 | Donations | Debit | |
| 6.7.12 | CSR Spend | Debit | |
| 6.7.13 | Repairs — Laptops | Debit | |
| 6.7.14 | Repairs — Phones | Debit | |
| 6.7.15 | Repairs — Other Equipment | Debit | |
| 6.7.16 | Petty Cash — Logged Spend | Debit | |
| 6.7.17 | Miscellaneous (target < 1% OpEx) | Debit | |

#### L1: 7. EBITDA (computed)

= 5. GROSS PROFIT − 6. TOTAL OPERATING EXPENSES

#### L1: 8. Depreciation & Amortisation (Year-End Adjustment)

| ID | Name | Direction | Input mode |
|---|---|---|---|
| 8.1 | Depreciation — Computer Equipment | Debit | Manual (year-end) |
| 8.2 | Depreciation — Production Equipment | Debit | Manual |
| 8.3 | Depreciation — Office Furniture | Debit | Manual |
| 8.4 | Depreciation — Vehicles | Debit | Manual |
| 8.5 | Amortisation — Software Perpetual | Debit | Manual |
| 8.6 | Amortisation — Trademarks/IP | Debit | Manual |

D&A is entered annually from the CA's depreciation schedule via the Settings page. No automatic computation in FY26.

#### L1: 9. EBIT (computed)

= 7. EBITDA − 8. D&A

#### L1: 10. Finance Income / (Costs)

| ID | Name | Direction |
|---|---|---|
| 10.1 | Interest on Loans Paid | Debit |
| 10.2 | Interest on Director Loan Paid | Debit |
| 10.3 | Interest on Late Vendor Payments | Debit |

Note: Bank interest earned is in 1.6.1 (Other Income), per Indian SME convention.

#### L1: 11. FX Gain / (Loss)

| ID | Name | Direction |
|---|---|---|
| 11.1 | Realised FX Gain | Credit |
| 11.2 | Realised FX Loss | Debit |
| 11.3 | Unrealised FX Translation Gain/Loss | Year-end |

#### L1: 12. PBT (computed)

= 9. EBIT + 10. Finance Income − 10. Finance Costs ± 11. FX

#### L1: 13. Tax

| ID | Name | Direction |
|---|---|---|
| 13.1 | Current Tax — Income Tax | Debit |
| 13.2 | Advance Tax | Debit |
| 13.3 | Self-Assessment Tax | Debit |
| 13.4 | Deferred Tax | Debit/Credit |
| 13.5 | Tax Penalties / Interest | Debit |

#### L1: 14. PAT (computed)

= 12. PBT − 13. Tax

---

## 3. Below-the-Line Tracking (Not in P&L)

These show in dedicated tabs, not the P&L Report.

### 3.1 Capex Register (Section 15)

Threshold: **₹1,00,000.** Anything ≥ this amount goes to Capex.

| ID | Name |
|---|---|
| 15.1 | Capex — Laptops & Computers |
| 15.2 | Capex — Production Equipment |
| 15.3 | Capex — Office Furniture |
| 15.4 | Capex — Vehicles |
| 15.5 | Capex — Office Renovation |
| 15.6 | Capex — Software Perpetual License |

### 3.2 Statutory Liabilities Clearing (Section 16)

| ID | Name |
|---|---|
| 16.1 | GST — Output Tax Collected |
| 16.2 | GST — Input Tax Credit |
| 16.3 | GST — Net Payable/Refundable |
| 16.4 | GST — Cash Paid (PMT-06 / GSTR-3B) |
| 16.5 | TDS — Receivable (deducted by clients) |
| 16.6 | TDS — Payable (deducted on vendors) |
| 16.7 | TDS — Deposited (challan) |
| 16.8 | TCS — If applicable |
| 16.9 | PF Payable (placeholder) |
| 16.10 | PF Deposited (placeholder) |
| 16.11 | ESI Payable (placeholder) |
| 16.12 | ESI Deposited (placeholder) |
| 16.13 | Professional Tax — Employee Deduction |
| 16.14 | Professional Tax — Employer Liability |
| 16.15 | LWF Payable / Deposited |
| 16.16 | Advance Tax — Quarterly Payments |
| 16.17 | Self-Assessment Tax |

### 3.3 Director Current Account (Section 17)

| ID | Name |
|---|---|
| 17.1 | Director Salary Paid (mirror of 6.1.7) |
| 17.2 | Director Personal Spend on Company Card |
| 17.3 | Director Reimbursement Owed |
| 17.4 | Director Loan to Company |
| 17.5 | Director Loan Repaid by Company |
| 17.6 | Director Drawings (Non-Salary) |
| 17.7 | Director Net Position (computed) |

### 3.4 Internal Transfers & Settlements (Section 18)

| ID | Name |
|---|---|
| 18.1 | Bank Account Transfers (own ↔ own) |
| 18.2 | Credit Card Bill Settlements |
| 18.3 | BNPL Settlements |
| 18.4 | Cash Withdrawals (to petty cash) |
| 18.5 | Inter-Entity Transfers (FY27 ready) |

---

## 4. Required Reports

### 4.1 P&L Report (replaces existing Reports tab)

**Component:** `components/PnLReport.tsx`

**Layout:**
- Three-column header: P&L Line | Period Actual | Budget | Variance | %
- Collapsible tree: default open to L2, click to expand to L3
- Period selector: Month / Quarter / FY-YTD / Custom Range
- Comparison toggle: vs Prior Period / vs Prior Year / vs Budget
- Currency: INR primary, USD/HKD shown in tooltips on hover for export lines
- Export: CSV, XLSX (matching this exact hierarchy)

**Computed lines:** 3, 5, 7, 9, 12, 14 must show in bold and update reactively.

**Drill-through:** Clicking any L3 line opens a filtered Ledger view showing all transactions in that line for the selected period.

### 4.2 Vendor Spend Report

**Component:** `components/VendorSpendReport.tsx`

**Replicates** the existing `IT_AND_MCO_Vendors.xlsx` sheet structure but live:
- Rows: vendors grouped by P&L L2 line (MCO / IT / Telecom)
- Columns: 12 months (FY) + Total Annual + Avg/month
- Filter: by paying email account, by category, by amount range
- Highlight: month-over-month change > 25% in red/green

### 4.3 Budget vs Actual

**Component:** `components/BudgetVsActual.tsx`

**Source:** FY26 Budget sheet imported via Settings → Budget Import
**Layout:** P&L hierarchy, with Budget / Actual / Variance / % per quarter (Q1/Q2/Q3/Q4) and FY total

### 4.4 Client Invoice Tracker

**Component:** `components/ClientInvoiceTracker.tsx`

**Replicates** the `Invoice_Updated_2026.xlsx` structure:
- Invoice No. | Date | Type (Media/Non-Media) | Client | Description | Net | CGST | SGST | IGST | Gross | Status (Paid/Unpaid/Partial) | Days Outstanding
- Auto-match to incoming credits in the ledger to flip status to Paid
- Aging buckets: 0-30 / 31-60 / 61-90 / 90+

### 4.5 Payroll Variance

**Component:** `components/PayrollVariance.tsx`

For each employee:
- Modelled Pay (per revenue bracket from Payroll sheet)
- Actual Paid (from ledger)
- Variance & reason

### 4.6 Cash Position by Account

**Component:** `components/CashPosition.tsx`

For each instrument (bank account / credit card):
- Opening balance | Inflows | Outflows | Closing balance
- Linked email account
- Linked vendors paid from this account

### 4.7 Director Reconciliation (existing — verify against Section 17)

**Component:** `components/DirectorReconciliation.tsx`
**Action:** Audit existing component to ensure all six 17.x lines are tracked. Add missing lines.

### 4.8 Statutory Liabilities Dashboard

**Component:** `components/StatutoryDashboard.tsx`

For each liability in Section 16:
- Liability accrued | Paid | Outstanding | Due Date
- Highlight overdue in red

---

## 5. Schema Changes Required

### 5.1 New Files

- `services/pnlStructure.ts` — full hierarchy as a typed tree
- `services/pnlClassifier.ts` — transaction → P&L line resolution
- `services/budgetImport.ts` — parses FY budget sheet into typed budget data
- `services/invoiceTracker.ts` — invoice lifecycle (raised → paid)
- `services/payrollModel.ts` — variable-pay computation per revenue bracket
- `services/statutoryTracker.ts` — Section 16 liability tracking

### 5.2 Type Additions to `types.ts`

```typescript
// Entity (FY27-ready)
export type EntityId = 'blustream' | 'leaddigital' | 'blueocean';

// P&L
export interface PnLLine {
  id: string;              // e.g. "6.3.5"
  parentId: string | null; // e.g. "6.3"
  level: 1 | 2 | 3;
  name: string;
  direction: 'Debit' | 'Credit';
  computed: boolean;       // true for rollup lines (3, 5, 7, 9, 12, 14)
  active: boolean;         // false for placeholder lines (PF/ESI/GHI)
  notes?: string;
}

// Vendor → P&L mapping (editable registry)
export interface VendorPnLMapping {
  vendorCanonical: string;
  pnlLineId: string;
  emailAccount?: string;   // used as matching hint
  confidence: 'manual' | 'auto_high' | 'auto_low';
  updatedAt: string;
  updatedBy: string;
}

// Extension to Transaction
export interface Transaction {
  // ... existing fields
  pnlLineId?: string;          // NEW — resolved P&L L3 line
  pnlSubTag?: string;          // NEW — e.g. RESEARCH_REFERENCE, CLIENT_PASSTHROUGH
  entityId?: EntityId;         // NEW — defaults to 'blustream' in FY26
  isPassthrough?: boolean;     // NEW — true if 2.x.x
  passthroughClientId?: string; // NEW — which client this was billed back to
  isCapex?: boolean;           // NEW — true if amount >= 100000 and category is capex-eligible
  capexAssetCategory?: string; // NEW — 15.x classification
}

// Budget
export interface BudgetLine {
  pnlLineId: string;
  fy: string;              // e.g. "FY26"
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  total: number;
  notes?: string;
}

// Invoice
export interface Invoice {
  id: string;              // e.g. "BSINV001/2025-26"
  invoiceDate: string;
  type: 'Media' | 'Non-Media';
  clientId: string;
  description: string;
  netAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  grossAmount: number;
  currency: 'INR' | 'USD' | 'HKD' | 'OTHER';
  fxRate?: number;         // if non-INR
  pnlLineId: string;       // which 1.x line
  status: 'Raised' | 'Partial' | 'Paid' | 'Cancelled' | 'Bad Debt';
  paidDate?: string;
  paidAmount?: number;
  matchedTxnIds: string[]; // ledger txns that settled this
  daysOutstanding?: number; // computed
}

// Statutory liability
export interface StatutoryLiability {
  id: string;
  type: '16.1' | '16.5' | '16.6' | '16.13' | string; // any 16.x
  period: string;          // e.g. "2025-04" for monthly, "FY26-Q1"
  accrued: number;
  paid: number;
  outstanding: number;
  dueDate: string;
  paidDate?: string;
  challanRef?: string;
}
```

### 5.3 Existing Taxonomy Compatibility

`services/taxonomy.ts` is **not deleted**. Existing category codes remain valid as a coarse-grained input to the P&L classifier. The P&L line is the new authoritative grouping. Mapping table:

| Existing Category | Default P&L Line | Notes |
|---|---|---|
| `SAAS_MCO_MARKETING_CREATIVE` | varies (6.3.x) | Resolved by vendor mapping |
| `IT_INFRASTRUCTURE` | varies (6.3.21–6.3.30) | |
| `TELCO_INTERNET` | 6.3.31–6.3.34 | By number/type |
| `OFFICE_RENT` | 6.2.1 | |
| `OFFICE_ELECTRICITY` | 6.2.7 | |
| `OFFICE_UTILITIES` | 6.2.8–6.2.9 | |
| `OFFICE_SUPPLIES` | 6.2.10–6.2.13 | |
| `OFFICE_MAINTENANCE_REPAIRS` | 6.2.4–6.2.6 | |
| `VEHICLE_FUEL` | 6.5.15–6.5.17 | By vehicle/driver |
| `VEHICLE_REPAIR_MAINTENANCE` | 6.5.18–6.5.21 | |
| `TRAVEL_LOCAL` | 6.5.1–6.5.3 | |
| `TRAVEL_INTERCITY` | 6.5.4–6.5.7 | |
| `MEALS_CLIENTS_TEAM` | 6.1.21 | |
| `COURIER_LOGISTICS` | 6.7.1 | |
| `PROFESSIONAL_SERVICES` | 6.6.1–6.6.6 | By specialisation |
| `BANK_CHARGES` | 6.7.3–6.7.8 | By type |
| `TAXES_GST` | 16.4 (below-line) | Statutory clearing, NOT P&L expense |
| `INSURANCE_PREMIUM` | 6.6.10–6.6.14 | By type |
| `STAFF_WELFARE` | 6.1.20–6.1.24 | |
| `MARKETING_AD_SPEND` | 2.1.x or 6.4.1–6.4.3 | Pass-through if client, OpEx if own brand |
| `SOFTWARE_SUBSCRIPTIONS` | 6.3.x | |
| `TRAINING_LEARNING` | 6.1.29–6.1.32 | |
| `EQUIPMENT_CAPEX` | Section 15 | If ≥ ₹1L; else 6.3.35 |
| `BNPL_SETTLEMENT` | 18.3 | |
| `CC_BILL_PAYMENT` | 18.2 | |
| `OTHER_COMPANY_EXPENSE` | 6.7.17 | Force user to refine |
| `INTERNAL_ADJUSTMENT` | 18.5 | |
| `COGS_MEDIA` | 2.1.x | |
| `COGS_NONMEDIA` | 4.x | |
| `EMPLOYEE_SALARY` | 6.1.1–6.1.6 | By team tag |
| `EMPLOYEE_SALARY_ADVANCE` | 6.1.x | Same line as base salary |
| `EMPLOYEE_REIMBURSEMENT` | 6.1.33–6.1.35 | |
| `OFFICE_HELP_SALARY` | 6.1.10–6.1.13 | |
| `OFFICE_HELP_ERRANDS` | 6.7.16 | Petty cash |
| `COMPANY_TRANSFER` | 18.1 | |
| `DIRECTOR_PAYMENT` | 6.1.7 / 17.6 | Salary vs drawings — needs resolution |
| `DIRECTOR_REIMBURSEMENT` | 17.3 | |
| `CLIENT_RECEIPT` | 1.1–1.4 | By invoice match |
| `OTHER_INCOME` | 1.6.4 | |
| `REFUND_REVERSAL` | 1.6.3 | |

---

## 6. Acceptance Criteria

The P&L implementation is "done" when:

1. ✅ Every transaction in the existing IndexedDB store auto-resolves to a P&L L3 line (or is flagged for manual review)
2. ✅ Existing FY26 budget spreadsheet imports cleanly, with every line mapped to a P&L line
3. ✅ FY26-to-date P&L report renders in < 2s for the full ledger
4. ✅ Vendor Spend Report matches the existing `IT_AND_MCO_Vendors.xlsx` to within ±5% on totals
5. ✅ Invoice Tracker matches the existing `Invoice_Updated_2026.xlsx` row-for-row
6. ✅ Director Reconciliation accounts for 100% of `DIRECTOR_PAYMENT` + `DIRECTOR_REIMBURSEMENT` transactions
7. ✅ Capex threshold flagging works: any txn ≥ ₹1L in capex-eligible category gets `isCapex=true` and a Section 15 line
8. ✅ Below-line items (16, 17, 18) do not appear in the P&L Report but appear in their dedicated dashboards
9. ✅ Settings page allows editing vendor → P&L line mappings, with changes propagating to historical transactions
10. ✅ Inactive lines (PF/ESI/GHI) appear in the P&L hierarchy but show as "—" or "Inactive" until activated in Settings

---

## 7. Out of Scope for v1.0

These are explicitly **not** part of this spec. Track separately:

- Gmail / SMS / MCP ingestion (Phase 2 — separate spec)
- Multi-entity consolidation (FY27 — schema-ready but no UI)
- Automatic depreciation computation (CA-driven for now)
- Real-time PF/ESI computation (until registered)
- TDS auto-deduction logic (track payable, manual filing)

---

## 8. Open Items (Tracked for Future Decisions)

1. **Variable pay computation** — modelled vs. paid: do we let the app compute the modelled number from revenue + bracket, or just import it from payroll? (Currently: import + show variance.)
2. **Bank interest earned placement** — kept in 1.6.1; Indian SME convention. Some prefer below-EBIT. Defer.
3. **Currency reporting** — INR only in FY26; multi-currency presentation deferred.
4. **Invoice GST split** — currently captured (CGST/SGST/IGST); confirm whether we need a separate GST register beyond 16.x clearing.
