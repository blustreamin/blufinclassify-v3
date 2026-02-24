
import { Instrument, Category, Counterparty } from './types';

export const INITIAL_INSTRUMENTS: Instrument[] = [
  // 1. Tata Card (SBI Card)
  { 
      id: 'tata_cc_sbi', 
      name: 'Tata Card (SBI Card)', 
      institution: 'SBI Card', 
      instrumentType: 'CC_PERSONAL',
      allowedFileTypes: ['PDF', 'IMAGE'],
      tileKey: 'tata_cc_sbi',
      strictMatchTokens: ['SBI', 'TATA'],
      parser: 'image_manual' 
  },
  // 2. RBL PM Credit Card
  { 
      id: 'rbl_pm_cc', 
      name: 'RBL PM Credit Card', 
      institution: 'RBL', 
      instrumentType: 'CC_PERSONAL',
      allowedFileTypes: ['PDF', 'IMAGE'],
      tileKey: 'rbl_pm_cc',
      strictMatchTokens: ['RBL', 'PM'],
      parser: 'image_manual' 
  },
  // 3. RBL PSS Credit Card
  { 
      id: 'rbl_pss_cc', 
      name: 'RBL PSS Credit Card', 
      institution: 'RBL', 
      instrumentType: 'CC_PERSONAL',
      allowedFileTypes: ['PDF', 'IMAGE'],
      tileKey: 'rbl_pss_cc',
      strictMatchTokens: ['RBL', 'PSS'],
      parser: 'image_manual' 
  },
  // 4. ICICI Corporate Credit Card
  { 
      id: 'icici_cc_corporate', 
      name: 'ICICI Corporate Credit Card', 
      institution: 'ICICI', 
      instrumentType: 'CC_COMPANY',
      allowedFileTypes: ['CSV', 'XLS', 'XLSX', 'PDF'],
      tileKey: 'icici_cc_corporate',
      strictMatchTokens: ['ICICI', 'CORP'],
      parser: 'csv_generic'
  },
  // 5. ICICI Savings Account
  { 
      id: 'icici_sb_personal', 
      name: 'ICICI Savings Account', 
      institution: 'ICICI', 
      instrumentType: 'SB_PERSONAL',
      allowedFileTypes: ['CSV', 'XLS', 'XLSX', 'PDF'],
      tileKey: 'icici_sb_personal',
      strictMatchTokens: ['ICICI', 'SAVINGS'],
      parser: 'xls_generic'
  },
  // 6. Axis Savings Account
  { 
      id: 'axis_sb_personal', 
      name: 'Axis Savings Account', 
      institution: 'Axis', 
      instrumentType: 'SB_PERSONAL',
      allowedFileTypes: ['CSV', 'XLS', 'XLSX', 'PDF'],
      tileKey: 'axis_sb_personal',
      strictMatchTokens: ['AXIS', 'SAVINGS'],
      parser: 'csv_generic'
  },
  // 7. ICICI Current Account
  { 
      id: 'icici_ca_company', 
      name: 'ICICI Current Account', 
      institution: 'ICICI', 
      instrumentType: 'CA_COMPANY',
      allowedFileTypes: ['CSV', 'XLS', 'XLSX', 'PDF'],
      tileKey: 'icici_ca_company',
      strictMatchTokens: ['ICICI', 'CURRENT'],
      parser: 'csv_generic'
  },
  // 8. Axis Current Account
  { 
      id: 'axis_ca_company', 
      name: 'Axis Current Account', 
      institution: 'Axis', 
      instrumentType: 'CA_COMPANY',
      allowedFileTypes: ['CSV', 'XLS', 'XLSX', 'PDF'],
      tileKey: 'axis_ca_company',
      strictMatchTokens: ['AXIS', 'CURRENT'],
      parser: 'csv_generic'
  },
  // 9. LazyPay (BNPL)
  { 
      id: 'lazypay_bnpl_personal', 
      name: 'LazyPay (BNPL)', 
      institution: 'LazyPay', 
      instrumentType: 'BNPL_PERSONAL',
      allowedFileTypes: ['IMAGE', 'PDF'],
      tileKey: 'lazypay_bnpl_personal',
      strictMatchTokens: ['LAZYPAY'],
      parser: 'image_manual'
  },
  // 10. Simpl (BNPL)
  { 
      id: 'simpl_bnpl_personal', 
      name: 'Simpl (BNPL)', 
      institution: 'Simpl', 
      instrumentType: 'BNPL_PERSONAL',
      allowedFileTypes: ['IMAGE', 'PDF'],
      tileKey: 'simpl_bnpl_personal',
      strictMatchTokens: ['SIMPL'],
      parser: 'image_manual'
  }
];

export const INITIAL_CATEGORIES: Category[] = [
  // --- COMPANY: EXPENSES ---
  { code: 'SAAS_MCO_MARKETING_CREATIVE', name: 'MCO SaaS & Creative', kind: 'EXPENSE', glGroup: 'MCO', active: true },
  { code: 'IT_INFRASTRUCTURE', name: 'IT Infrastructure', kind: 'EXPENSE', glGroup: 'TECH', active: true },
  { code: 'TELCO_INTERNET', name: 'Telco & Internet', kind: 'EXPENSE', glGroup: 'OPS', active: true },
  { code: 'OFFICE_RENT', name: 'Office Rent', kind: 'EXPENSE', glGroup: 'FACILITY', active: true },
  { code: 'OFFICE_ELECTRICITY', name: 'Office Electricity', kind: 'EXPENSE', glGroup: 'FACILITY', active: true },
  { code: 'OFFICE_UTILITIES', name: 'Office Utilities', kind: 'EXPENSE', glGroup: 'FACILITY', active: true },
  { code: 'OFFICE_SUPPLIES', name: 'Office Supplies', kind: 'EXPENSE', glGroup: 'OPS', active: true },
  { code: 'OFFICE_MAINTENANCE_REPAIRS', name: 'Office Maintenance', kind: 'EXPENSE', glGroup: 'FACILITY', active: true },
  { code: 'VEHICLE_FUEL', name: 'Vehicle Fuel (Biz)', kind: 'EXPENSE', glGroup: 'TRAVEL', active: true },
  { code: 'VEHICLE_REPAIR_MAINTENANCE', name: 'Vehicle Repair (Biz)', kind: 'EXPENSE', glGroup: 'TRAVEL', active: true },
  { code: 'TRAVEL_LOCAL', name: 'Local Travel (Biz)', kind: 'EXPENSE', glGroup: 'TRAVEL', active: true },
  { code: 'TRAVEL_INTERCITY', name: 'Intercity Travel (Biz)', kind: 'EXPENSE', glGroup: 'TRAVEL', active: true },
  { code: 'MEALS_CLIENTS_TEAM', name: 'Meals (Clients/Team)', kind: 'EXPENSE', glGroup: 'TRAVEL', active: true },
  { code: 'COURIER_LOGISTICS', name: 'Courier & Logistics', kind: 'EXPENSE', glGroup: 'OPS', active: true },
  { code: 'PROFESSIONAL_SERVICES', name: 'Professional Services', kind: 'EXPENSE', glGroup: 'COMPLIANCE', active: true },
  { code: 'BANK_CHARGES', name: 'Bank Charges', kind: 'EXPENSE', glGroup: 'FINANCE', active: true },
  { code: 'TAXES_GST', name: 'Taxes & GST', kind: 'EXPENSE', glGroup: 'TAX', active: true },
  { code: 'INSURANCE_PREMIUM', name: 'Insurance Premium', kind: 'EXPENSE', glGroup: 'COMPLIANCE', active: true },
  { code: 'STAFF_WELFARE', name: 'Staff Welfare', kind: 'EXPENSE', glGroup: 'HR', active: true },
  { code: 'MARKETING_AD_SPEND', name: 'Ad Spend', kind: 'EXPENSE', glGroup: 'MCO', active: true },
  { code: 'SOFTWARE_SUBSCRIPTIONS', name: 'Software Subs', kind: 'EXPENSE', glGroup: 'TECH', active: true },
  { code: 'TRAINING_LEARNING', name: 'Training & Learning', kind: 'EXPENSE', glGroup: 'HR', active: true },
  { code: 'EQUIPMENT_CAPEX', name: 'Equipment / Capex', kind: 'EXPENSE', glGroup: 'ASSET', active: true },
  { code: 'BNPL_SETTLEMENT', name: 'BNPL Settlement', kind: 'TRANSFER', glGroup: 'LIABILITY', active: true },
  { code: 'CC_BILL_PAYMENT', name: 'CC Bill Payment', kind: 'TRANSFER', glGroup: 'LIABILITY', active: true },
  { code: 'OTHER_COMPANY_EXPENSE', name: 'Other Company Exp', kind: 'EXPENSE', glGroup: 'OPS', active: true },
  { code: 'INTERNAL_ADJUSTMENT', name: 'Internal Adjustment', kind: 'TRANSFER', glGroup: 'CONTRA', active: true },

  // --- COMPANY: PAYROLL / PEOPLE ---
  { code: 'EMPLOYEE_SALARY', name: 'Employee Salary', kind: 'EXPENSE', glGroup: 'PAYROLL', active: true },
  { code: 'EMPLOYEE_SALARY_ADVANCE', name: 'Salary Advance', kind: 'EXPENSE', glGroup: 'ASSET', active: true },
  { code: 'EMPLOYEE_REIMBURSEMENT', name: 'Employee Reimb.', kind: 'REIMBURSEMENT', glGroup: 'LIABILITY', active: true },
  { code: 'OFFICE_HELP_SALARY', name: 'Office Help Salary', kind: 'EXPENSE', glGroup: 'PAYROLL', active: true },
  { code: 'OFFICE_HELP_ERRANDS', name: 'Office Help Errands', kind: 'EXPENSE', glGroup: 'OPS', active: true },

  // --- COMPANY: REVENUE ---
  { code: 'CLIENT_RECEIPT', name: 'Client Receipt', kind: 'REVENUE', glGroup: 'REVENUE', active: true },
  { code: 'OTHER_INCOME', name: 'Other Income', kind: 'REVENUE', glGroup: 'REVENUE', active: true },
  { code: 'REFUND_REVERSAL', name: 'Refund / Reversal', kind: 'REVENUE', glGroup: 'CONTRA', active: true },

  // --- COMPANY: TRANSFERS / OWNERSHIP ---
  { code: 'COMPANY_TRANSFER', name: 'Company Transfer', kind: 'TRANSFER', glGroup: 'CONTRA', active: true },
  { code: 'DIRECTOR_PAYMENT', name: 'Director Payment', kind: 'TRANSFER', glGroup: 'DIRECTOR', active: true },
  { code: 'DIRECTOR_REIMBURSEMENT', name: 'Director Reimb.', kind: 'REIMBURSEMENT', glGroup: 'LIABILITY', active: true },

  // --- PERSONAL: LIVING ---
  { code: 'PERSONAL_GROCERIES_DAILY_NEEDS', name: 'Groceries & Daily', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_GROCERIES', name: 'Groceries', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_DINING_CAFES', name: 'Dining & Cafes', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_FOOD_DELIVERY', name: 'Food Delivery', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_RENT', name: 'Rent (Personal)', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_ELECTRICITY', name: 'Electricity (Personal)', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_UTILITIES', name: 'Utilities (Personal)', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_FUEL', name: 'Fuel (Personal)', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_VEHICLE_REPAIR_MAINTENANCE', name: 'Vehicle Maint (Pers)', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_LOCAL_RIDES', name: 'Local Rides (Pers)', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_INTERCITY_TRAVEL', name: 'Travel (Pers)', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_SHOPPING_ECOMMERCE', name: 'Shopping (Ecom)', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_SHOPPING_GENERAL', name: 'Shopping (Gen)', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_MEDICAL_HEALTHCARE', name: 'Medical', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_FITNESS_WELLNESS', name: 'Fitness', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_ENTERTAINMENT_LEISURE', name: 'Entertainment', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_SUBSCRIPTIONS', name: 'Subscriptions (Pers)', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_EDUCATION_LEARNING', name: 'Education (Pers)', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_GIFTS_DONATIONS', name: 'Gifts', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_INSURANCE_PREMIUM', name: 'Insurance (Pers)', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_TAXES', name: 'Taxes (Pers)', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_HOME_MAINTENANCE', name: 'Home Maint', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_PET_CARE', name: 'Pet Care', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_OTHER', name: 'Other Personal', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },

  // --- PERSONAL: MONEY MOVEMENT ---
  { code: 'PERSONAL_TRANSFER', name: 'Personal Transfer', kind: 'TRANSFER', glGroup: 'PERSONAL_CONTRA', active: true },
  { code: 'PERSONAL_LOAN_EMI', name: 'Loan EMI', kind: 'EXPENSE', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_CASH_WITHDRAWAL', name: 'Cash Withdrawal', kind: 'TRANSFER', glGroup: 'PERSONAL', active: true },
  { code: 'PERSONAL_INVESTMENTS', name: 'Investments', kind: 'TRANSFER', glGroup: 'PERSONAL_ASSET', active: true },

  // --- FALLBACK ---
  { code: 'UNCATEGORIZED', name: 'Uncategorized', kind: 'EXPENSE', glGroup: 'SUSPENSE', active: true },
];

export const INITIAL_COUNTERPARTIES: Counterparty[] = [
    { id: 'unknown', name: 'Unknown', type: 'Unknown', aliases: [], active: true }
];
