export function sumAmountsByCurrency(items: Array<{ cost?: string | number | null; currency?: string | null }>, fallbackCurrency = "HKD"): Record<string, number> {
  const cents: Record<string, number> = {};
  for (const item of items) {
    if (item.cost === null || item.cost === undefined || String(item.cost).trim() === "") continue;
    const amount = Number(item.cost);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const currency = (item.currency?.trim() || fallbackCurrency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) continue;
    cents[currency] = (cents[currency] ?? 0) + Math.round(amount * 100);
  }
  return Object.fromEntries(Object.entries(cents).map(([currency, value]) => [currency, value / 100]));
}
