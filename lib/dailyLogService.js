/**
 * Daily financial logs: one document per day at users/{uid}/dailyLogs/{YYYY-MM-DD}
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";

export const TRANSACTION_CATEGORIES = [
  "Food",
  "Transport",
  "Rent",
  "Utilities",
  "Entertainment",
  "Healthcare",
  "Shopping",
  "Salary",
  "Education",
  "Other",
];

export function newEntryId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `e_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function todayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysToDateString(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** @param {string} yearMonth YYYY-MM */
export function monthRangeStrings(yearMonth) {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m) return { start: "", end: "" };
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/** @param {string} yearMonth YYYY-MM */
export function prevYearMonth(yearMonth) {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export function dailyLogDocRef(db, uid, dateStr) {
  return doc(db, "users", uid, "dailyLogs", dateStr);
}

/**
 * @returns {Promise<{ date: string, entries: Array }>}
 */
export async function loadDailyLog(db, uid, dateStr) {
  const snap = await getDoc(dailyLogDocRef(db, uid, dateStr));
  if (!snap.exists()) {
    return { date: dateStr, entries: [] };
  }
  const data = snap.data();
  return {
    date: data.date || dateStr,
    entries: Array.isArray(data.entries) ? data.entries : [],
  };
}

/**
 * @param {Array<{id: string, amount: number, category: string, note: string, type: 'income'|'expense'}>} entries
 */
export async function saveDailyLog(db, uid, dateStr, entries) {
  const cleaned = (entries || [])
    .map((e) => ({
      id: e.id || newEntryId(),
      amount: Math.max(0, Number(e.amount) || 0),
      category: e.category || "Other",
      note: String(e.note || "").slice(0, 500),
      type: e.type === "income" ? "income" : "expense",
    }))
    .filter((e) => e.amount > 0);
  await setDoc(dailyLogDocRef(db, uid, dateStr), {
    date: dateStr,
    entries: cleaned,
    updatedAt: new Date().toISOString(),
  });
  return { date: dateStr, entries: cleaned };
}

/**
 * All daily log docs for a calendar month (efficient range query on `date`)
 * @param {string} yearMonth YYYY-MM
 */
export async function loadMonthLogs(db, uid, yearMonth) {
  const { start, end } = monthRangeStrings(yearMonth);
  if (!start || !end) return [];
  const q = query(
    collection(db, "users", uid, "dailyLogs"),
    where("date", ">=", start),
    where("date", "<=", end)
  );
  const snap = await getDocs(q);
  const out = [];
  snap.forEach((d) => out.push(d.data()));
  return out.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

/**
 * @param {Array<{ entries?: Array }>} logs
 */
export function aggregateMonth(logs) {
  let totalIncome = 0;
  let totalExpense = 0;
  /** @type {Record<string, { income: number, expense: number }>} */
  const byCategory = {};

  (logs || []).forEach((log) => {
    (log.entries || []).forEach((e) => {
      const amt = Math.max(0, Number(e.amount) || 0);
      const cat = e.category || "Other";
      if (!byCategory[cat]) {
        byCategory[cat] = { income: 0, expense: 0 };
      }
      if (e.type === "income") {
        totalIncome += amt;
        byCategory[cat].income += amt;
      } else {
        totalExpense += amt;
        byCategory[cat].expense += amt;
      }
    });
  });

  return {
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    byCategory,
  };
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * @param {ReturnType<typeof aggregateMonth>} current
 * @param {ReturnType<typeof aggregateMonth> | null} previous
 * @returns {string[]}
 */
export function generateInsights(current, previous) {
  const insights = [];
  if (!current) return insights;

  const { totalIncome, totalExpense, net, byCategory } = current;
  insights.push(
    `This month: income ${fmtMoney(totalIncome)}, expenses ${fmtMoney(totalExpense)}. Net: ${fmtMoney(net)} (${net >= 0 ? "saved" : "deficit"}).`
  );

  let maxCat = null;
  let maxExp = 0;
  Object.entries(byCategory).forEach(([cat, v]) => {
    const ex = v.expense || 0;
    if (ex > maxExp) {
      maxExp = ex;
      maxCat = cat;
    }
  });
  if (maxCat && maxExp > 0) {
    insights.push(`Highest spending category: ${maxCat} (${fmtMoney(maxExp)}).`);
  }

  if (previous && previous.byCategory) {
    const prevFood = previous.byCategory.Food?.expense || 0;
    const curFood = byCategory.Food?.expense || 0;
    if (prevFood > 0 && curFood > prevFood) {
      const pct = Math.round(((curFood - prevFood) / prevFood) * 100);
      insights.push(`You spent ${pct}% more on Food than last month.`);
    } else if (prevFood > 0 && curFood < prevFood) {
      const pct = Math.round(((prevFood - curFood) / prevFood) * 100);
      insights.push(`You spent ${pct}% less on Food than last month.`);
    }

    const prevTotalExp = previous.totalExpense || 0;
    const curTotalExp = totalExpense;
    if (prevTotalExp > 0 && curTotalExp > prevTotalExp) {
      const pct = Math.round(((curTotalExp - prevTotalExp) / prevTotalExp) * 100);
      if (pct > 5) {
        insights.push(`Total spending is ${pct}% higher than last month.`);
      }
    }
  }

  return insights;
}
