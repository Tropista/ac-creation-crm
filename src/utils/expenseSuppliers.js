export function normalizeSupplierName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function expenseMatchesSupplier(expense, supplier) {
  if (!expense || !supplier) return false;

  if (
    expense.supplierId &&
    String(expense.supplierId) === String(supplier.id)
  ) {
    return true;
  }

  const expenseName = normalizeSupplierName(expense.supplierName);
  const supplierName = normalizeSupplierName(supplier.name);

  if (!expenseName || !supplierName) return false;

  return (
    expenseName === supplierName ||
    expenseName.includes(supplierName) ||
    supplierName.includes(expenseName)
  );
}

export function resolveSupplierForExpense(expense, suppliers = []) {
  if (!expense) return null;

  if (expense.supplierId) {
    const byId = suppliers.find(
      (supplier) => String(supplier.id) === String(expense.supplierId)
    );
    if (byId) return byId;
  }

  const expenseName = normalizeSupplierName(expense.supplierName);
  if (!expenseName) return null;

  const exact = suppliers.find(
    (supplier) => normalizeSupplierName(supplier.name) === expenseName
  );
  if (exact) return exact;

  return (
    suppliers.find((supplier) => {
      const supplierName = normalizeSupplierName(supplier.name);
      return (
        supplierName &&
        (expenseName.includes(supplierName) ||
          supplierName.includes(expenseName))
      );
    }) || null
  );
}

export function getExpensesForSupplier(supplier, expenses = []) {
  return expenses.filter((expense) => expenseMatchesSupplier(expense, supplier));
}

export function getExpenseDate(expense) {
  const value = expense?.purchaseDate || expense?.createdAt;
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isExpenseInMonth(expense, year, month) {
  const date = getExpenseDate(expense);
  if (!date) return false;
  return date.getFullYear() === year && date.getMonth() === month;
}

export function sumExpenseTotals(expenses = []) {
  return expenses.reduce(
    (acc, expense) => {
      acc.ht += Number(expense.amountHT || 0);
      acc.ttc += Number(expense.totalTTC || 0);
      return acc;
    },
    { ht: 0, ttc: 0 }
  );
}
