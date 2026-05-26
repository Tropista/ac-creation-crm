import { inferProcessType, PROCESS_TYPES } from "./production";

export function computeProcessTypeStats(documents = []) {
  const byKey = {};

  for (const entry of PROCESS_TYPES) {
    byKey[entry.key] = {
      key: entry.key,
      label: entry.label,
      revenueHT: 0,
      count: 0,
    };
  }

  for (const doc of documents || []) {
    const process = inferProcessType(doc);
    const key = process?.key || "other";
    if (!byKey[key]) {
      byKey[key] = { key, label: process?.label || "Autre", revenueHT: 0, count: 0 };
    }
    byKey[key].revenueHT += Number(doc.totalHT || 0);
    byKey[key].count += 1;
  }

  return Object.values(byKey)
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.revenueHT - a.revenueHT);
}

export function allocateExpensesByProcessRevenue(processStats = [], totalExpensesHT = 0) {
  const revenueTotal = processStats.reduce((sum, entry) => sum + entry.revenueHT, 0);
  if (revenueTotal <= 0 || totalExpensesHT <= 0) {
    return processStats.map((entry) => ({ ...entry, marginHT: entry.revenueHT }));
  }

  return processStats.map((entry) => {
    const share = entry.revenueHT / revenueTotal;
    const allocatedExpenses = totalExpensesHT * share;
    return {
      ...entry,
      marginHT: entry.revenueHT - allocatedExpenses,
    };
  });
}
