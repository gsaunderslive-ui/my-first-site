/** Income, credit, and buying-power helpers for tenant CRM views. */

export type PreApprovalStatus = "none" | "pre-qualified" | "pre-approved";

export function estimateIncomeFromRent(rentAmount: number): number {
  return Math.round(rentAmount * 3 * 12);
}

/** Midpoint of a range like "660-699", or null if unparseable. */
export function parseCreditRangeMid(range: string): number | null {
  const m = String(range || "").match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a + b) / 2);
}

/**
 * If no reliable credit data, estimate from on-time status and engagement hints.
 */
export function estimateCreditScoreFromBehavior(input: {
  creditScoreRange: string;
  onTimeStatus?: string | null;
  engagementScore?: number;
}): number {
  const fromRange = parseCreditRangeMid(input.creditScoreRange);
  if (fromRange != null) return fromRange;

  let base = 640;
  const ot = String(input.onTimeStatus || "").toLowerCase();
  if (ot.includes("always") || ot.includes("excellent")) base += 45;
  else if (ot.includes("usually") || ot.includes("good")) base += 25;
  else if (ot.includes("late") || ot.includes("poor")) base -= 40;

  const eng = Number(input.engagementScore || 0);
  base += Math.min(30, Math.round(eng * 2));

  return Math.max(300, Math.min(850, base));
}

/** 30-year fixed term for affordability math. */
const AFFORDABILITY_TERM_MONTHS = 360;

/** Assumed down payment as a fraction of purchase price (illustrative). */
const AFFORDABILITY_DOWN_PAYMENT = 0.1;

/**
 * Gross monthly income × this cap → max principal & interest payment (common “front-end” rule of thumb).
 * Not a guarantee; lenders use full underwriting.
 */
const AFFORDABILITY_PI_RATIO = 0.28;

/**
 * Illustrative annual APR (not a live rate quote) by credit tier — used only to translate payment → loan size.
 */
export function illustrativeAprFromCreditScore(score: number): number {
  if (score >= 760) return 0.065;
  if (score >= 740) return 0.06625;
  if (score >= 700) return 0.06875;
  if (score >= 660) return 0.07125;
  if (score >= 620) return 0.075;
  return 0.08;
}

/**
 * Standard fixed-rate amortization: given max monthly P&amp;I, return max loan principal.
 * Payment formula: P = L × r(1+r)^n / ((1+r)^n − 1) → solve for L.
 */
export function maxLoanFromMonthlyPI(monthlyPI: number, annualRate: number, termMonths: number): number {
  if (monthlyPI <= 0 || termMonths <= 0) return 0;
  const r = annualRate / 12;
  if (r <= 0) return monthlyPI * termMonths;
  const factor = Math.pow(1 + r, termMonths);
  return (monthlyPI * (factor - 1)) / (r * factor);
}

export type MortgageAffordabilityBreakdown = {
  annualIncome: number;
  grossMonthly: number;
  housingRatio: number;
  maxMonthlyPI: number;
  annualRate: number;
  aprPercentLabel: string;
  termMonths: number;
  loanAmount: number;
  downPaymentPct: number;
  homePrice: number;
};

/** Core calculator shared by display value and tooltips. */
export function mortgageAffordabilityBreakdown(
  annualIncome: number,
  estimatedCreditScore: number
): MortgageAffordabilityBreakdown | null {
  if (!annualIncome || annualIncome <= 0) return null;

  const grossMonthly = annualIncome / 12;
  const housingRatio = AFFORDABILITY_PI_RATIO;
  const maxMonthlyPI = grossMonthly * housingRatio;
  const annualRate = illustrativeAprFromCreditScore(estimatedCreditScore);
  const loanAmount = maxLoanFromMonthlyPI(maxMonthlyPI, annualRate, AFFORDABILITY_TERM_MONTHS);
  const homePrice = loanAmount / (1 - AFFORDABILITY_DOWN_PAYMENT);

  return {
    annualIncome,
    grossMonthly,
    housingRatio,
    maxMonthlyPI,
    annualRate,
    aprPercentLabel: (annualRate * 100).toFixed(2),
    termMonths: AFFORDABILITY_TERM_MONTHS,
    loanAmount,
    downPaymentPct: AFFORDABILITY_DOWN_PAYMENT,
    homePrice: Math.round(homePrice)
  };
}

/**
 * Estimated affordable home price from a mortgage-style calculator:
 * 28% of gross monthly income → max P&amp;I, 30-year fixed, illustrative APR by credit, 10% down → price = loan / 0.9.
 *
 * `engagementSignals` is accepted for API compatibility with callers; it does not change this calculation.
 */
export function estimateBuyingPower(input: {
  annualIncome: number;
  estimatedCreditScore: number;
  engagementSignals: number;
}): number {
  const b = mortgageAffordabilityBreakdown(input.annualIncome, input.estimatedCreditScore);
  return b ? b.homePrice : 0;
}

/** Two short sentences max: simple equation chain + disclaimer (same math as `estimateBuyingPower`). */
export function buyingPowerTooltipShort(input: {
  annualIncome: number;
  estimatedCreditScore: number;
  engagementSignals: number;
}): string {
  const b = mortgageAffordabilityBreakdown(input.annualIncome, input.estimatedCreditScore);
  if (!b) {
    return "Income (or rent×3) → 28% of gross monthly for P&I, illustrative APR from credit, 30yr, 10% down → price. Not a pre-approval.";
  }
  const gm = Math.round(b.grossMonthly);
  const pi = Math.round(b.maxMonthlyPI);
  const loan = Math.round(b.loanAmount);
  const dp = Math.round(b.downPaymentPct * 100);
  return (
    `$${gm.toLocaleString()}/mo gross × 28% → ~$${pi.toLocaleString()}/mo P&I → ~$${loan.toLocaleString()} loan @ ${b.aprPercentLabel}% APR (30yr) + ~${dp}% down ≈ $${b.homePrice.toLocaleString()} price. ` +
    "Illustrative only—not pre-approval."
  );
}

export function annualIncomeFromTenant(input: {
  estimatedIncome: number;
  rentAmount: number;
}): number {
  const inc = Number(input.estimatedIncome || 0);
  if (inc > 0) return inc;
  return estimateIncomeFromRent(input.rentAmount);
}
