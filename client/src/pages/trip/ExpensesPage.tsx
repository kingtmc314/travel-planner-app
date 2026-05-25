import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Plus, Trash2, Loader2, DollarSign, TrendingUp, Users, Edit2, RefreshCw, ArrowLeftRight, AlertCircle, CalendarRange, X } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "transport", label: "交通", color: "#3b82f6" },
  { value: "accommodation", label: "住宿", color: "#8b5cf6" },
  { value: "food", label: "餐飲", color: "#f97316" },
  { value: "attraction", label: "景點", color: "#22c55e" },
  { value: "shopping", label: "購物", color: "#ec4899" },
  { value: "other", label: "其他", color: "#94a3b8" },
];

const CURRENCIES = ["HKD","USD","EUR","GBP","JPY","CNY","TWD","SGD","AUD","CAD","KRW","THB","EGP","MYR","IDR","PHP","VND"];

const NO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "IDR", "VND"]);

function formatAmount(amount: number, currency: string): string {
  if (NO_DECIMAL_CURRENCIES.has(currency)) {
    return Math.round(amount).toLocaleString();
  }
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDateStr(dateVal: Date | string | null | undefined): string {
  if (!dateVal) return new Date().toISOString().split("T")[0];
  if (dateVal instanceof Date) return dateVal.toISOString().split("T")[0];
  return String(dateVal).split("T")[0];
}

const emptyForm = (currency = "HKD") => ({
  title: "", amount: "", currency,
  category: "other", paidByName: "", date: new Date().toISOString().split("T")[0], notes: "",
});

export default function ExpensesPage({ tripId }: { tripId: number }) {
  const { data: expenses, refetch, isLoading } = trpc.expenses.list.useQuery({ tripId }, { refetchInterval: 15000 });
  const { data: trip } = trpc.trips.get.useQuery({ tripId });
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm(trip?.baseCurrency ?? "HKD"));

  const baseCurrency = trip?.baseCurrency ?? "HKD";
  const [displayCurrency, setDisplayCurrency] = useState<string | null>(null);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  // Date range filter
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    if (!filterStart && !filterEnd) return expenses;
    return expenses.filter(e => {
      const d = getDateStr(e.date);
      if (filterStart && d < filterStart) return false;
      if (filterEnd && d > filterEnd) return false;
      return true;
    });
  }, [expenses, filterStart, filterEnd]);

  const isFiltered = !!(filterStart || filterEnd);

  const expenseInputs = useMemo(() => {
    if (!filteredExpenses || !displayCurrency) return [];
    return filteredExpenses.map(e => ({
      id: e.id,
      amount: String(e.amount),
      currency: e.currency,
      date: getDateStr(e.date),
    }));
  }, [expenses, displayCurrency]);

  const {
    data: conversionData,
    isLoading: conversionLoading,
    refetch: refetchConversion,
  } = trpc.currency.convertExpenses.useQuery(
    { targetCurrency: displayCurrency ?? "HKD", expenses: expenseInputs },
    {
      enabled: !!displayCurrency && expenseInputs.length > 0,
      staleTime: 24 * 60 * 60 * 1000,
    }
  );

  const conversionMap = useMemo(() => {
    type ConvResult = NonNullable<typeof conversionData>["results"][0];
    if (!conversionData) return new Map<number, ConvResult>();
    return new Map(conversionData.results.map(r => [r.id, r]));
  }, [conversionData]);

  function getDisplayAmount(expense: { id: number; amount: string | number; currency: string }) {
    const rawAmount = parseFloat(String(expense.amount));
    if (!displayCurrency || displayCurrency === expense.currency) {
      return { value: rawAmount, currency: expense.currency, rateDate: null, isFallback: false, isConverted: false };
    }
    const conv = conversionMap.get(expense.id);
    if (!conv) {
      return { value: rawAmount, currency: expense.currency, rateDate: null, isFallback: false, isConverted: false };
    }
    return {
      value: conv.convertedAmount,
      currency: conv.convertedCurrency,
      rateDate: conv.rateDate,
      isFallback: conv.isFallback,
      isConverted: !conv.isIdentical,
    };
  }

  const addExpense = trpc.expenses.add.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(emptyForm(trip?.baseCurrency ?? "HKD")); toast.success("費用已新增"); },
    onError: () => toast.error("新增失敗"),
  });
  const updateExpense = trpc.expenses.update.useMutation({
    onSuccess: () => { refetch(); setEditingExpense(null); toast.success("費用已更新"); },
    onError: () => toast.error("更新失敗"),
  });
  const deleteExpense = trpc.expenses.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("費用已刪除"); },
  });

  const handleAdd = () => {
    if (!form.title || !form.amount) { toast.error("請填寫必填欄位"); return; }
    addExpense.mutate({ tripId, ...form, category: form.category as any });
  };

  const handleUpdate = () => {
    if (!editingExpense || !form.title || !form.amount) { toast.error("請填寫必填欄位"); return; }
    updateExpense.mutate({ expenseId: editingExpense.id, tripId, ...form, category: form.category as any });
  };

  const openEdit = (expense: any) => {
    setEditingExpense(expense);
    setForm({
      title: expense.title,
      amount: String(parseFloat(expense.amount as string)),
      currency: expense.currency,
      category: expense.category ?? "other",
      paidByName: expense.paidByName ?? "",
      date: getDateStr(expense.date),
      notes: expense.notes ?? "",
    });
  };

  const stats = useMemo(() => {
    if (!filteredExpenses) return { total: 0, byCategory: [], byPayer: [] };
    let total = 0;
    const byCat: Record<string, number> = {};
    const byPayer: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      const { value } = getDisplayAmount(e);
      total += value;
      const cat = CATEGORIES.find(c => c.value === e.category);
      byCat[cat?.label ?? "其他"] = (byCat[cat?.label ?? "其他"] ?? 0) + value;
      const payer = e.paidByName ?? "未知";
      byPayer[payer] = (byPayer[payer] ?? 0) + value;
    });
    return {
      total,
      byCategory: Object.entries(byCat).map(([name, value]) => ({
        name, value: Math.round(value * 100) / 100,
        color: CATEGORIES.find(c => c.label === name)?.color ?? "#94a3b8"
      })),
      byPayer: Object.entries(byPayer).map(([name, value]) => ({
        name, value: Math.round(value * 100) / 100
      })),
    };
  }, [filteredExpenses, conversionMap, displayCurrency]);

  const effectiveCurrency = displayCurrency ?? baseCurrency;
  const hasFallback = conversionData?.results.some(r => r.isFallback) ?? false;

  // Trip date bounds for the date pickers
  const tripStart = trip?.startDate ? getDateStr(trip.startDate) : "";
  const tripEnd = trip?.endDate ? getDateStr(trip.endDate) : "";

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  const ExpenseForm = ({ onSubmit, loading, label }: { onSubmit: () => void; loading: boolean; label: string }) => (
    <div className="space-y-4 mt-2">
      <div>
        <Label>費用名稱 *</Label>
        <Input className="mt-1.5" placeholder="例：午餐" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>金額 *</Label>
          <Input className="mt-1.5" type="number" placeholder="0.00" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
        </div>
        <div>
          <Label>貨幣</Label>
          <Select value={form.currency} onValueChange={v => setForm({...form, currency: v})}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>類別</Label>
        <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>付款人</Label>
          <Input className="mt-1.5" placeholder="姓名" value={form.paidByName} onChange={e => setForm({...form, paidByName: e.target.value})} />
        </div>
        <div>
          <Label>日期</Label>
          <Input className="mt-1.5" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
        </div>
      </div>
      <div>
        <Label>備注</Label>
        <Textarea className="mt-1.5" placeholder="備注..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} />
      </div>
      <Button className="w-full" onClick={onSubmit} disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        {label}
      </Button>
    </div>
  );

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">費用記帳</h2>
          <p className="text-muted-foreground text-sm mt-0.5">基本貨幣：{baseCurrency}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative">
            <button
              onClick={() => setShowCurrencyPicker(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                displayCurrency
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground"
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              {displayCurrency ? displayCurrency : "換算"}
              {conversionLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            </button>
            {showCurrencyPicker && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg p-2 w-56 max-h-80 overflow-y-auto">
                <p className="text-[10px] text-muted-foreground px-2 pb-1.5 font-medium uppercase tracking-wide">顯示貨幣</p>
                <button
                  onClick={() => { setDisplayCurrency(null); setShowCurrencyPicker(false); }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${!displayCurrency ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent"}`}
                >
                  原始貨幣（各自顯示）
                </button>
                {CURRENCIES.map(c => (
                  <button
                    key={c}
                    onClick={() => { setDisplayCurrency(c); setShowCurrencyPicker(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${displayCurrency === c ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent"}`}
                  >
                    {c}
                    {c === baseCurrency && <span className="text-[10px] text-muted-foreground ml-1.5">（基本）</span>}
                  </button>
                ))}
                {displayCurrency && (
                  <div className="border-t border-border mt-1.5 pt-1.5">
                    <button
                      onClick={() => { refetchConversion(); toast.success("重新載入匯率中…"); }}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-accent flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3 h-3" />
                      重新載入匯率
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Date range filter button */}
          <div className="relative">
            <button
              onClick={() => setShowDateFilter(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                isFiltered
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground"
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5" />
              {isFiltered ? `${filterStart || "…"} ~ ${filterEnd || "…"}` : "篩選日期"}
              {isFiltered && (
                <span
                  onClick={(e) => { e.stopPropagation(); setFilterStart(""); setFilterEnd(""); }}
                  className="ml-0.5 hover:opacity-70"
                >
                  <X className="w-3 h-3" />
                </span>
              )}
            </button>
            {showDateFilter && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg p-4 w-72">
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">日期範圍篩選</p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">開始日期</Label>
                    <Input
                      type="date"
                      className="mt-1 h-8 text-sm"
                      value={filterStart}
                      min={tripStart || undefined}
                      max={filterEnd || tripEnd || undefined}
                      onChange={e => setFilterStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">結束日期</Label>
                    <Input
                      type="date"
                      className="mt-1 h-8 text-sm"
                      value={filterEnd}
                      min={filterStart || tripStart || undefined}
                      max={tripEnd || undefined}
                      onChange={e => setFilterEnd(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs"
                      onClick={() => { setFilterStart(""); setFilterEnd(""); setShowDateFilter(false); }}
                    >
                      清除
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => setShowDateFilter(false)}
                    >
                      套用
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <Button onClick={() => { setShowAdd(true); setForm(emptyForm(trip?.baseCurrency ?? "HKD")); }} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />新增費用
          </Button>
        </div>
      </div>

      {/* Currency conversion notice */}
      {displayCurrency && (
        <div className={`mb-4 px-3 py-2 border rounded-lg flex items-start gap-2 text-xs ${
          hasFallback
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
            : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400"
        }`}>
          {hasFallback ? <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
          <span>
            {conversionLoading
              ? `正在查詢 ${displayCurrency} 歷史匯率…`
              : hasFallback
                ? `部分費用使用估算匯率（API 暫時無法取得歷史數據）`
                : `已按各筆費用付款日期換算為 ${displayCurrency}（收市匯率，資料來源：Frankfurter / 55 家央行）`
            }
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          {
            icon: DollarSign,
            label: "總費用",
            value: conversionLoading && displayCurrency
              ? "計算中…"
              : `${effectiveCurrency} ${formatAmount(stats.total, effectiveCurrency)}`,
            color: "text-blue-500 bg-blue-50 dark:bg-blue-950/30"
          },
          { icon: TrendingUp, label: "筆數", value: `${expenses?.length ?? 0} 筆`, color: "text-green-500 bg-green-50 dark:bg-green-950/30" },
          { icon: Users, label: "付款人", value: `${stats.byPayer.length} 人`, color: "text-purple-500 bg-purple-50 dark:bg-purple-950/30" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-2xl border border-border p-3 text-center">
            <div className={`w-8 h-8 rounded-xl ${s.color} flex items-center justify-center mx-auto mb-1.5`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div className="text-sm font-bold text-foreground">{s.value}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {expenses && expenses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-card rounded-2xl border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">類別分佈</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={stats.byCategory} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {stats.byCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [`${effectiveCurrency} ${formatAmount(v, effectiveCurrency)}`, ""]} />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">各人支出</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.byPayer} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`${effectiveCurrency} ${formatAmount(v, effectiveCurrency)}`, "支出"]} />
                <Bar dataKey="value" fill="oklch(0.42 0.12 255)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Active filter notice */}
      {isFiltered && (
        <div className="mb-4 px-3 py-2 border rounded-lg flex items-center gap-2 text-xs bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
          <CalendarRange className="w-3.5 h-3.5 shrink-0" />
          <span>篩選中：{filterStart || "最早"} 至 {filterEnd || "最新"} · 顯示 {filteredExpenses.length} / {expenses?.length ?? 0} 筆</span>
          <button onClick={() => { setFilterStart(""); setFilterEnd(""); }} className="ml-auto hover:opacity-70">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Expense list */}
      {!filteredExpenses || filteredExpenses.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <DollarSign className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">還沒有費用記錄</p>
          <button onClick={() => setShowAdd(true)} className="text-primary hover:underline mt-2 text-sm">+ 新增第一筆費用</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredExpenses.map(expense => {
            const cat = CATEGORIES.find(c => c.value === expense.category);
            const rawAmount = parseFloat(String(expense.amount));
            const display = getDisplayAmount(expense);

            return (
              <div key={expense.id} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{background:`${cat?.color}20`, color: cat?.color}}>
                  <DollarSign className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-foreground text-sm">{expense.title}</p>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{background:`${cat?.color}20`, color: cat?.color}}>{cat?.label}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                    <span>{getDateStr(expense.date)}</span>
                    {expense.paidByName && <><span>·</span><span>由 {expense.paidByName} 付款</span></>}
                    {display.isConverted && display.rateDate && (
                      <>
                        <span>·</span>
                        <span className={display.isFallback ? "text-amber-500" : "text-blue-500"}>
                          {display.isFallback ? "估算匯率" : `${display.rateDate} 匯率`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {conversionLoading && displayCurrency && displayCurrency !== expense.currency ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-auto" />
                  ) : (
                    <>
                      <p className="font-bold text-foreground">
                        {display.currency} {formatAmount(display.value, display.currency)}
                      </p>
                      {display.isConverted && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          原 {expense.currency} {formatAmount(rawAmount, expense.currency)}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => openEdit(expense)}
                    className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => deleteExpense.mutate({ expenseId: expense.id, tripId })}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>新增費用</DialogTitle></DialogHeader>
          <ExpenseForm onSubmit={handleAdd} loading={addExpense.isPending} label="新增費用" />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingExpense} onOpenChange={(o) => !o && setEditingExpense(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>修改費用</DialogTitle></DialogHeader>
          <ExpenseForm onSubmit={handleUpdate} loading={updateExpense.isPending} label="儲存變更" />
        </DialogContent>
      </Dialog>

      {showCurrencyPicker && (
        <div className="fixed inset-0 z-40" onClick={() => setShowCurrencyPicker(false)} />
      )}
      {showDateFilter && (
        <div className="fixed inset-0 z-40" onClick={() => setShowDateFilter(false)} />
      )}
    </div>
  );
}
