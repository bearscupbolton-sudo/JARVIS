const BOLTON_ID = "XFS6DD0Z4HHKJ";
const SARATOGA_ID = "L8JQJBM6C66AK";
const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-01-18";

interface PayoutEntry {
  id: string;
  payout_id: string;
  effective_at: string;
  type: string;
  gross_amount_money: { amount: number; currency_code: string };
  fee_amount_money: { amount: number; currency_code: string };
  net_amount_money: { amount: number; currency_code: string };
  type_charge_details?: { payment_id: string };
  type_square_capital_payment_details?: { payment_id: string };
}

interface Payout {
  id: string;
  status: string;
  location_id: string;
  created_at: string;
  amount_money: { amount: number; currency_code: string };
  arrival_date: string;
  type: string;
}

interface LiquiditySnapshot {
  boltonGrossSales: number;
  boltonProcessingFees: number;
  boltonLoanWithholdings: number;
  boltonOtherDeductions: number;
  boltonNetDeposited: number;
  saratogaGrossSales: number;
  saratogaProcessingFees: number;
  saratogaNetDeposited: number;
  totalNetDeposited: number;
  loanWithholdingRate: number;
  debtAnchor: number;
  estimatedRemainingDebt: number;
  trueSpendable: number;
  status: string;
  payoutDetails: Array<{
    payoutId: string;
    arrivalDate: string;
    locationId: string;
    locationName: string;
    grossSales: number;
    fees: number;
    loanWithholdings: number;
    otherDeductions: number;
    netDeposited: number;
    entries: PayoutEntry[];
  }>;
  periodStart: string;
  periodEnd: string;
}

async function squareFetch(path: string): Promise<any> {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN not configured");
  const resp = await fetch(`${SQUARE_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Square API ${resp.status}: ${body}`);
  }
  return resp.json();
}

async function getPayouts(locationId: string, startDate: string, endDate: string): Promise<Payout[]> {
  const allPayouts: Payout[] = [];
  let cursor: string | null = null;

  do {
    let url = `/payouts?location_id=${locationId}&limit=50`;
    if (cursor) url += `&cursor=${cursor}`;
    const data = await squareFetch(url);
    const payouts = (data.payouts || []).filter((p: Payout) => {
      return p.arrival_date >= startDate && p.arrival_date <= endDate;
    });
    allPayouts.push(...payouts);

    cursor = data.cursor || null;
    if (data.payouts?.length > 0) {
      const lastDate = data.payouts[data.payouts.length - 1].arrival_date;
      if (lastDate < startDate) cursor = null;
    }
  } while (cursor);

  return allPayouts;
}

async function getPayoutEntries(payoutId: string): Promise<PayoutEntry[]> {
  const allEntries: PayoutEntry[] = [];
  let cursor: string | null = null;

  do {
    let url = `/payouts/${payoutId}/payout-entries?limit=50`;
    if (cursor) url += `&cursor=${cursor}`;
    const data = await squareFetch(url);
    allEntries.push(...(data.payout_entries || []));
    cursor = data.cursor || null;
  } while (cursor);

  return allEntries;
}

export async function getLiquiditySnapshot(
  startDate: string,
  endDate: string,
  bankBalance: number,
  debtAnchor: number = 51639.74
): Promise<LiquiditySnapshot> {
  const [boltonPayouts, saratogaPayouts] = await Promise.all([
    getPayouts(BOLTON_ID, startDate, endDate),
    getPayouts(SARATOGA_ID, startDate, endDate),
  ]);

  const payoutDetails: LiquiditySnapshot["payoutDetails"] = [];

  let boltonGross = 0, boltonFees = 0, boltonLoan = 0, boltonOther = 0, boltonNet = 0;
  let saratogaGross = 0, saratogaFees = 0, saratogaNet = 0;

  for (const payout of boltonPayouts) {
    const entries = await getPayoutEntries(payout.id);
    let pGross = 0, pFees = 0, pLoan = 0, pOther = 0;

    for (const e of entries) {
      if (e.type === "CHARGE") {
        pGross += e.gross_amount_money.amount;
        pFees += e.fee_amount_money.amount;
      } else if (e.type === "SQUARE_CAPITAL_PAYMENT") {
        pLoan += Math.abs(e.gross_amount_money.amount);
      } else if (e.type === "SQUARE_CAPITAL_REVERSED_PAYMENT") {
        pLoan -= Math.abs(e.gross_amount_money.amount);
      } else {
        pOther += Math.abs(e.gross_amount_money.amount);
      }
    }

    boltonGross += pGross;
    boltonFees += pFees;
    boltonLoan += pLoan;
    boltonOther += pOther;
    boltonNet += payout.amount_money.amount;

    payoutDetails.push({
      payoutId: payout.id,
      arrivalDate: payout.arrival_date,
      locationId: BOLTON_ID,
      locationName: "BC Bolton",
      grossSales: pGross / 100,
      fees: pFees / 100,
      loanWithholdings: pLoan / 100,
      otherDeductions: pOther / 100,
      netDeposited: payout.amount_money.amount / 100,
      entries,
    });
  }

  for (const payout of saratogaPayouts) {
    const entries = await getPayoutEntries(payout.id);
    let pGross = 0, pFees = 0;

    for (const e of entries) {
      if (e.type === "CHARGE") {
        pGross += e.gross_amount_money.amount;
        pFees += e.fee_amount_money.amount;
      }
    }

    saratogaGross += pGross;
    saratogaFees += pFees;
    saratogaNet += payout.amount_money.amount;

    payoutDetails.push({
      payoutId: payout.id,
      arrivalDate: payout.arrival_date,
      locationId: SARATOGA_ID,
      locationName: "BC Saratoga",
      grossSales: pGross / 100,
      fees: pFees / 100,
      loanWithholdings: 0,
      otherDeductions: 0,
      netDeposited: payout.amount_money.amount / 100,
      entries,
    });
  }

  payoutDetails.sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate));

  const boltonGrossDollars = boltonGross / 100;
  const boltonLoanDollars = boltonLoan / 100;
  const withholdingRate = boltonGrossDollars > 0 ? (boltonLoanDollars / boltonGrossDollars) * 100 : 0;
  const estimatedRemaining = debtAnchor - boltonLoanDollars;

  const salesTaxReserve = bankBalance * 0.08;
  const trueSpendable = bankBalance - salesTaxReserve - Math.max(0, estimatedRemaining > 0 ? 0 : 0);

  const status = trueSpendable > 10000 ? "GROWTH_READY" : trueSpendable > 5000 ? "STABLE" : trueSpendable > 0 ? "TIGHT" : "CRITICAL";

  return {
    boltonGrossSales: boltonGrossDollars,
    boltonProcessingFees: boltonFees / 100,
    boltonLoanWithholdings: boltonLoanDollars,
    boltonOtherDeductions: boltonOther / 100,
    boltonNetDeposited: boltonNet / 100,
    saratogaGrossSales: saratogaGross / 100,
    saratogaProcessingFees: saratogaFees / 100,
    saratogaNetDeposited: saratogaNet / 100,
    totalNetDeposited: (boltonNet + saratogaNet) / 100,
    loanWithholdingRate: Math.round(withholdingRate * 100) / 100,
    debtAnchor,
    estimatedRemainingDebt: Math.max(0, estimatedRemaining),
    trueSpendable: Math.round(trueSpendable * 100) / 100,
    status,
    payoutDetails,
    periodStart: startDate,
    periodEnd: endDate,
  };
}

export async function getDebtTracker(debtAnchor: number = 51639.74): Promise<{
  anchor: number;
  totalWithheld: number;
  remaining: number;
  withholdingRate: number;
  dailyBreakdown: Array<{ date: string; amount: number; cumulative: number }>;
}> {
  const now = new Date();
  const startDate = "2025-01-01";
  const endDate = now.toISOString().slice(0, 10);

  const payouts = await getPayouts(BOLTON_ID, startDate, endDate);

  let totalWithheld = 0;
  let totalGross = 0;
  const dailyMap = new Map<string, number>();

  for (const payout of payouts) {
    const entries = await getPayoutEntries(payout.id);
    for (const e of entries) {
      if (e.type === "SQUARE_CAPITAL_PAYMENT") {
        const amt = Math.abs(e.gross_amount_money.amount) / 100;
        totalWithheld += amt;
        const date = payout.arrival_date;
        dailyMap.set(date, (dailyMap.get(date) || 0) + amt);
      }
      if (e.type === "CHARGE") {
        totalGross += e.gross_amount_money.amount / 100;
      }
    }
  }

  const dailyBreakdown: Array<{ date: string; amount: number; cumulative: number }> = [];
  let cumulative = 0;
  const sortedDates = [...dailyMap.keys()].sort();
  for (const date of sortedDates) {
    cumulative += dailyMap.get(date)!;
    dailyBreakdown.push({ date, amount: dailyMap.get(date)!, cumulative });
  }

  return {
    anchor: debtAnchor,
    totalWithheld: Math.round(totalWithheld * 100) / 100,
    remaining: Math.round(Math.max(0, debtAnchor - totalWithheld) * 100) / 100,
    withholdingRate: totalGross > 0 ? Math.round((totalWithheld / totalGross) * 10000) / 100 : 0,
    dailyBreakdown,
  };
}
