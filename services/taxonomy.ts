
import { Category } from '../types';

// --- CATEGORY BUCKETS (STRICT TAXONOMY) ---

export const CATEGORIES_COMPANY_EXPENSE = [
  // COMPANY (Expenses)
  "SAAS_MCO_MARKETING_CREATIVE",
  "IT_INFRASTRUCTURE",
  "TELCO_INTERNET",
  "OFFICE_RENT",
  "OFFICE_ELECTRICITY",
  "OFFICE_UTILITIES",
  "OFFICE_SUPPLIES",
  "OFFICE_MAINTENANCE_REPAIRS",
  "VEHICLE_FUEL",
  "VEHICLE_REPAIR_MAINTENANCE",
  "TRAVEL_LOCAL",
  "TRAVEL_INTERCITY",
  "MEALS_CLIENTS_TEAM",
  "COURIER_LOGISTICS",
  "PROFESSIONAL_SERVICES",
  "BANK_CHARGES",
  "TAXES_GST",
  "INSURANCE_PREMIUM",
  "STAFF_WELFARE",
  "MARKETING_AD_SPEND",
  "SOFTWARE_SUBSCRIPTIONS",
  "TRAINING_LEARNING",
  "EQUIPMENT_CAPEX",
  "BNPL_SETTLEMENT",
  "CC_BILL_PAYMENT",
  "OTHER_COMPANY_EXPENSE",
  "INTERNAL_ADJUSTMENT",
  "COGS_MEDIA",
  "COGS_NONMEDIA",

  // COMPANY (Payroll / People)
  "EMPLOYEE_SALARY",
  "EMPLOYEE_SALARY_ADVANCE",
  "EMPLOYEE_REIMBURSEMENT",
  "OFFICE_HELP_SALARY",
  "OFFICE_HELP_ERRANDS",

  // COMPANY (Transfers / Ownership) - outflow use-cases
  "COMPANY_TRANSFER",
  "DIRECTOR_PAYMENT",
  "DIRECTOR_REIMBURSEMENT",
] as const;

export const CATEGORIES_COMPANY_INCOME = [
  "CLIENT_RECEIPT",
  "OTHER_INCOME",
  "REFUND_REVERSAL",
] as const;

export const CATEGORIES_PERSONAL_EXPENSE = [
  // PERSONAL (Living)
  "PERSONAL_GROCERIES_DAILY_NEEDS",
  "PERSONAL_GROCERIES",
  "PERSONAL_DINING_CAFES",
  "PERSONAL_FOOD_DELIVERY",
  "PERSONAL_RENT",
  "PERSONAL_ELECTRICITY",
  "PERSONAL_UTILITIES",
  "PERSONAL_FUEL",
  "PERSONAL_VEHICLE_REPAIR_MAINTENANCE",
  "PERSONAL_LOCAL_RIDES",
  "PERSONAL_INTERCITY_TRAVEL",
  "PERSONAL_SHOPPING_ECOMMERCE",
  "PERSONAL_SHOPPING_GENERAL",
  "PERSONAL_MEDICAL_HEALTHCARE",
  "PERSONAL_FITNESS_WELLNESS",
  "PERSONAL_ENTERTAINMENT_LEISURE",
  "PERSONAL_SUBSCRIPTIONS",
  "PERSONAL_EDUCATION_LEARNING",
  "PERSONAL_GIFTS_DONATIONS",
  "PERSONAL_INSURANCE_PREMIUM",
  "PERSONAL_TAXES",
  "PERSONAL_HOME_MAINTENANCE",
  "PERSONAL_PET_CARE",
  "PERSONAL_OTHER",

  // PERSONAL (Money movement) - outflow use-cases
  "PERSONAL_TRANSFER",
  "PERSONAL_LOAN_EMI",
  "PERSONAL_CASH_WITHDRAWAL",
  "PERSONAL_INVESTMENTS",
] as const;

export const CATEGORIES_PERSONAL_INCOME = [
  "PERSONAL_TRANSFER",
] as const;

export const CATEGORIES_FALLBACK = [
  "UNCATEGORIZED",
] as const;

// --- MATRIX & TYPES ---

export type Scope = "Company" | "Personal";
export type Flow = "Expense" | "Income";

export const CATEGORY_MATRIX: Record<Scope, Record<Flow, readonly string[]>> = {
  Company: {
    Expense: CATEGORIES_COMPANY_EXPENSE,
    Income: CATEGORIES_COMPANY_INCOME,
  },
  Personal: {
    Expense: CATEGORIES_PERSONAL_EXPENSE,
    Income: CATEGORIES_PERSONAL_INCOME,
  },
} as const;

// --- HELPERS ---

export function getAllowedCategories(scope: Scope, flow: Flow): readonly string[] {
  return CATEGORY_MATRIX[scope][flow];
}

export function isCategoryAllowed(scope: Scope, flow: Flow, categoryCode: string): boolean {
  if (categoryCode === "UNCATEGORIZED") return true; // Always allow fallback in drafts
  return getAllowedCategories(scope, flow).includes(categoryCode);
}

export function validateManualClassification(input: {
  scope?: Scope;
  flow?: Flow;
  category_code?: string;
}): { ok: boolean; missing: string[]; invalid: string[] } {
  const missing: string[] = [];
  const invalid: string[] = [];

  if (!input.scope) missing.push("scope");
  if (!input.flow) missing.push("flow");
  if (!input.category_code) missing.push("category_code");

  if (input.scope && input.flow && input.category_code) {
    if (!isCategoryAllowed(input.scope, input.flow, input.category_code)) {
      invalid.push("category_code_not_allowed_for_scope_flow");
    }
  }

  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function canSaveReviewed(input: {
  scope?: Scope;
  flow?: Flow;
  category_code?: string;
}): boolean {
  const v = validateManualClassification(input);
  if (!v.ok) return false;
  return input.category_code !== "UNCATEGORIZED";
}

// Helper to look up human readable name from existing registry
export function getCategoryName(code: string, allCategories: Record<string, Category>): string {
    return allCategories[code]?.name || code;
}
