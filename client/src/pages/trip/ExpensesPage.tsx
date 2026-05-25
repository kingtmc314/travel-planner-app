import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  Plus, Trash2, Loader2, DollarSign, TrendingUp, Users, Edit2, ArrowLeftRight,
  AlertCircle, CalendarRange, X, Calculator, ArrowRight, CheckCircle2,
  Check, ClipboardPaste
} from "lucide-react";
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
  if (NO_DECIMAL_CURRENCIES.has(currency)) return Math.round(amount).toLocaleString();
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDateStr(dateVal: Date | string | null | undefined): string {
  if (!dateVal) return new Date().toISOString().split("T")[0];
  if (dateVal instanceof Date) return dateVal.toISOString().split("T")[0];
  return String(dateVal).split("T")[0];
}

// ─── CSV parse helpers ───────────────────────────────────────────────────────
function detectSeparator(text: string): string {
  // Prefer tab if there are any tabs (spreadsheet paste)
  const tabCount = (text.match(/\t/g) || []).length;
  return tabCount > 0 ? "\t" : ",";
}

// RFC 4180-compliant CSV parser that handles quoted fields with embedded commas/newlines
function parseCsvLine(line: string, sep: string): string[] {
  if (sep === "\t") {
    // Tab-separated: no quoting needed, just split and trim
    return line.split("\t").map(c => c.trim());
  }
  // Comma-separated: handle quoted fields
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } // escaped quote
      else { inQuotes = !inQuotes; }
    } else if (ch === sep && !inQuotes) {
      result.push(current.trim()); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvText(text: string): string[][] {
  const sep = detectSeparator(text);
  return text.split("\n").map(l => l.trim()).filter(l => l.length > 0)
    .map(l => parseCsvLine(l, sep));
}

type ParsedExpense = {
  title: string; amount: string; currency: string;
  category: string; paidByName: string; date: string; notes: string;
  _error?: string;
};

const CATEGORY_MAP: Record<string, string> = {
  "交通": "transport", "transport": "transport",
  "住宿": "accommodation", "accommodation": "accommodation",
  "餐飲": "food", "food": "food", "飲食": "food",
  "景點": "attraction", "attraction": "attraction", "活動": "attraction",
  "購物": "shopping", "shopping": "shopping",
  "其他": "other", "other": "other",
};

function mapCategory(raw: string): string {
  if (!raw) return "other";
  return CATEGORY_MAP[raw.trim()] ?? CATEGORY_MAP[raw.toLowerCase().trim()] ?? "other";
}

function mapCurrency(raw: string): string {
  const upper = raw.toUpperCase().trim();
  return CURRENCIES.includes(upper) ? upper : "HKD";
}

function parseDate(raw: string): string {
  if (!raw) return new Date().toISOString().split("T")[0];
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`;
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  return new Date().toISOString().split("T")[0];
}

function autoMapColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const patterns: Record<string, RegExp> = {
    date: /日期|date/i, title: /名稱|標題|項目|title|name|desc/i,
    amount: /金額|amount|price|費用/i, currency: /貨幣|幣種|currency/i,
    category: /類別|分類|category/i, paidByName: /付款人|付款|payer|paid/i,
    notes: /備注|備註|notes|remark/i,
  };
  headers.forEach((h, i) => {
    for (const [key, re] of Object.entries(patterns)) {
      if (re.test(h) && !(key in map)) map[key] = i;
    }
  });
  return map;
}

function rowsToExpenses(rows: string[][], hasHeader: boolean, baseCurrency: string): ParsedExpense[] {
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const headers = hasHeader ? rows[0] : [];
  const colMap = hasHeader ? autoMapColumns(headers) : {};
  return dataRows.map(cells => {
    const get = (key: string, pos: number) => {
      const idx = colMap[key] ?? (hasHeader ? -1 : pos);
      return idx >= 0 && idx < cells.length ? cells[idx] : "";
    };
    const title = get("title", 1);
    const rawAmount = get("amount", 2);
    const amount = rawAmount.replace(/[^0-9.]/g, "");
    const currency = mapCurrency(get("currency", 3) || baseCurrency);
    const category = mapCategory(get("category", 4));
    const paidByName = get("paidByName", 5);
    const date = parseDate(get("date", 0));
    const notes = get("notes", 6);
    const error = !title ? "缺少名稱" : !amount || isNaN(parseFloat(amount)) ? "金額無效" : undefined;
    return { title, amount, currency, category, paidByName, date, notes, _error: error };
  }).filter(r => r.title || r.amount);
}

// ─── Inline row state ────────────────────────────────────────────────────────
type EditValues = {
  title?: string; amount?: string; currency?: string;
  category?: string; paidByName?: string; date?: string; notes?: string;
};

type PendingRow = {
  title: string; amount: string; currency: string;
  category: string; paidByName: string; date: string; notes: string;
};

type EditingCell = { rowIdx: number; col: string } | null;

// ─── Main component ──────────────────────────────────────────────────────────
export default function ExpensesPage({ tripId }: { tripId: number }) {
  const { data: expenses, refetch, isLoading } = trpc.expenses.list.useQuery({ tripId }, { refetchInterval: 15000 });
  const { data: trip } = trpc.trips.get.useQuery({ tripId });
  const baseCurrency = trip?.baseCurrency ?? "HKD";
  const canEdit = trip?.userRole === "owner" || trip?.userRole === "editor";

  const [displayCurrency, setDisplayCurrency] = useState<string | null>(null);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showSplit, setShowSplit] = useState(false);

  // Inline table
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [pendingRows, setPendingRows] = useState<PendingRow[]>([]);
  const [editValues, setEditValues] = useState<EditValues>({});

  // CSV import
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvHasHeader, setCsvHasHeader] = useState(true);
  const [parsedRows, setParsedRows] = useState<ParsedExpense[]>([]);
  const [importParsed, setImportParsed] = useState(false);

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
      id: e.id, amount: String(e.amount), currency: e.currency, date: getDateStr(e.date),
    }));
  }, [expenses, displayCurrency]);

  const { data: conversionData, isLoading: conversionLoading } = trpc.currency.convertExpenses.useQuery(
    { targetCurrency: displayCurrency ?? "HKD", expenses: expenseInputs },
    { enabled: !!displayCurrency && expenseInputs.length > 0, staleTime: 24 * 60 * 60 * 1000 }
  );

  const conversionMap = useMemo(() => {
    type ConvResult = NonNullable<typeof conversionData>["results"][0];
    if (!conversionData) return new Map<number, ConvResult>();
    return new Map(conversionData.results.map(r => [r.id, r]));
  }, [conversionData]);

  function getDisplayAmount(expense: { id: number; amount: string | number; currency: string }) {
    const rawAmount = parseFloat(String(expense.amount));
    if (!displayCurrency || displayCurrency === expense.currency)
      return { value: rawAmount, currency: expense.currency, rateDate: null, isFallback: false, isConverted: false };
    const conv = conversionMap.get(expense.id);
    if (!conv)
      return { value: rawAmount, currency: expense.currency, rateDate: null, isFallback: false, isConverted: false };
    return { value: conv.convertedAmount, currency: conv.convertedCurrency, rateDate: conv.rateDate, isFallback: conv.isFallback, isConverted: !conv.isIdentical };
  }

  const updateExpense = trpc.expenses.update.useMutation({
    onSuccess: () => { refetch(); toast.success("已儲存"); },
    onError: () => toast.error("儲存失敗"),
  });
  const deleteExpense = trpc.expenses.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("費用已刪除"); },
  });
  const addExpense = trpc.expenses.add.useMutation({
    onSuccess: () => { refetch(); toast.success("費用已新增"); },
    onError: () => toast.error("新增失敗"),
  });
  const bulkAdd = trpc.expenses.bulkAdd.useMutation({
    onSuccess: (data) => {
      refetch(); toast.success(`成功匯入 ${data.inserted} 筆費用`);
      setShowImport(false); setCsvText(""); setParsedRows([]); setImportParsed(false);
    },
    onError: () => toast.error("匯入失敗"),
  });

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
      byPayer: Object.entries(byPayer).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })),
    };
  }, [filteredExpenses, conversionMap, displayCurrency]);

  const effectiveCurrency = displayCurrency ?? baseCurrency;
  const hasFallback = conversionData?.results.some(r => r.isFallback) ?? false;
  const tripStart = trip?.startDate ? getDateStr(trip.startDate) : "";
  const tripEnd = trip?.endDate ? getDateStr(trip.endDate) : "";

  // ─── Inline editing ──────────────────────────────────────────────────────
  function startEdit(rowIdx: number, col: string, expense: any) {
    setEditingCell({ rowIdx, col });
    setEditValues({
      title: expense.title, amount: String(parseFloat(String(expense.amount))),
      currency: expense.currency, category: expense.category ?? "other",
      paidByName: expense.paidByName ?? "", date: getDateStr(expense.date), notes: expense.notes ?? "",
    });
  }

  function commitEdit(expense: any) {
    if (!editValues.title || !editValues.amount) { toast.error("名稱和金額為必填"); return; }
    updateExpense.mutate({
      expenseId: expense.id, tripId,
      title: editValues.title, amount: editValues.amount, currency: editValues.currency,
      category: editValues.category as any, paidByName: editValues.paidByName,
      date: editValues.date, notes: editValues.notes,
    });
    setEditingCell(null); setEditValues({});
  }

  function cancelEdit() { setEditingCell(null); setEditValues({}); }

  function addNewRow() {
    const newRow: PendingRow = {
      title: "", amount: "", currency: baseCurrency,
      category: "other", paidByName: "", date: new Date().toISOString().split("T")[0], notes: "",
    };
    setPendingRows(prev => [...prev, newRow]);
    const newIdx = (filteredExpenses?.length ?? 0) + pendingRows.length;
    setEditingCell({ rowIdx: newIdx, col: "title" });
    setEditValues({ ...newRow });
  }

  function commitNewRow(rowIdx: number) {
    const pendingIdx = rowIdx - (filteredExpenses?.length ?? 0);
    if (!editValues.title || !editValues.amount) {
      setPendingRows(prev => prev.filter((_, i) => i !== pendingIdx));
      setEditingCell(null); setEditValues({}); return;
    }
    addExpense.mutate({
      tripId, title: editValues.title!, amount: editValues.amount!,
      currency: editValues.currency ?? baseCurrency, category: (editValues.category ?? "other") as any,
      paidByName: editValues.paidByName, date: editValues.date ?? new Date().toISOString().split("T")[0],
      notes: editValues.notes,
    });
    setPendingRows(prev => prev.filter((_, i) => i !== pendingIdx));
    setEditingCell(null); setEditValues({});
  }

  function cancelNewRow(rowIdx: number) {
    const pendingIdx = rowIdx - (filteredExpenses?.length ?? 0);
    setPendingRows(prev => prev.filter((_, i) => i !== pendingIdx));
    setEditingCell(null); setEditValues({});
  }

  // ─── CSV import ──────────────────────────────────────────────────────────
  function handleParseCsv() {
    if (!csvText.trim()) { toast.error("請貼上數據"); return; }
    const rows = parseCsvText(csvText);
    if (rows.length === 0) { toast.error("無法解析數據"); return; }
    const parsed = rowsToExpenses(rows, csvHasHeader, baseCurrency);
    setParsedRows(parsed); setImportParsed(true);
  }

  function handleConfirmImport() {
    const valid = parsedRows.filter(r => !r._error);
    if (valid.length === 0) { toast.error("沒有有效的費用記錄"); return; }
    bulkAdd.mutate({
      tripId,
      expenses: valid.map(r => ({
        title: r.title, amount: r.amount, currency: r.currency,
        category: r.category as any, paidByName: r.paidByName || undefined,
        date: r.date, notes: r.notes || undefined,
      })),
    });
  }

  // ─── Cell renderer ───────────────────────────────────────────────────────
  function renderCell(expense: any, col: string, rowIdx: number, isNew = false) {
    const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.col === col;
    const isRowEditing = editingCell?.rowIdx === rowIdx;
    const base = "px-2 py-1.5 text-sm align-middle";

    if (col === "actions") {
      if (!canEdit) return <td key="actions" className={base} />;
      if (isRowEditing) {
        return (
          <td key="actions" className={`${base} whitespace-nowrap`}>
            <div className="flex items-center gap-1">
              <button onClick={() => isNew ? commitNewRow(rowIdx) : commitEdit(expense)}
                className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600" title="儲存">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => isNew ? cancelNewRow(rowIdx) : cancelEdit()}
                className="p-1 rounded hover:bg-muted text-muted-foreground" title="取消">
                <X className="w-4 h-4" />
              </button>
            </div>
          </td>
        );
      }
      return (
        <td key="actions" className={`${base} whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity`}>
          <div className="flex items-center gap-1">
            <button onClick={() => startEdit(rowIdx, "title", expense)}
              className="p-1 rounded hover:bg-accent text-muted-foreground" title="編輯">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => deleteExpense.mutate({ expenseId: expense.id, tripId })}
              className="p-1 rounded hover:bg-destructive/10 text-destructive" title="刪除">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      );
    }

    const startCellEdit = () => {
      if (!canEdit) return;
      if (!isRowEditing) {
        if (isNew) setEditingCell({ rowIdx, col });
        else startEdit(rowIdx, col, expense);
      } else {
        setEditingCell({ rowIdx, col });
      }
    };

    if (col === "date") {
      const displayDate = isRowEditing ? (editValues.date ?? "") : getDateStr(expense?.date);
      if (isEditing) {
        return (
          <td key="date" className={base}>
            <Input type="date" className="h-7 text-xs w-36 px-1.5"
              value={editValues.date ?? ""}
              onChange={e => setEditValues(v => ({ ...v, date: e.target.value }))}
              onKeyDown={e => {
                if (e.key === "Enter") setEditingCell({ rowIdx, col: "title" });
                if (e.key === "Escape") isNew ? cancelNewRow(rowIdx) : cancelEdit();
              }}
              autoFocus />
          </td>
        );
      }
      return (
        <td key="date" className={`${base} cursor-pointer hover:bg-accent/50 rounded`} onClick={startCellEdit}>
          <span className="text-muted-foreground">{displayDate}</span>
        </td>
      );
    }

    if (col === "title") {
      const displayTitle = isRowEditing ? (editValues.title ?? "") : expense?.title;
      if (isEditing) {
        return (
          <td key="title" className={base}>
            <Input className="h-7 text-xs min-w-[120px]" placeholder="費用名稱"
              value={editValues.title ?? ""}
              onChange={e => setEditValues(v => ({ ...v, title: e.target.value }))}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); setEditingCell({ rowIdx, col: "amount" }); }
                if (e.key === "Escape") isNew ? cancelNewRow(rowIdx) : cancelEdit();
              }}
              autoFocus />
          </td>
        );
      }
      return (
        <td key="title" className={`${base} cursor-pointer hover:bg-accent/50 rounded`} onClick={startCellEdit}>
          <span className="font-medium text-foreground">{displayTitle || <span className="text-muted-foreground italic text-xs">點擊輸入</span>}</span>
        </td>
      );
    }

    if (col === "category") {
      const displayCat = isRowEditing ? (editValues.category ?? "other") : (expense?.category ?? "other");
      const cat = CATEGORIES.find(c => c.value === displayCat);
      if (isEditing) {
        return (
          <td key="category" className={base}>
            <Select value={editValues.category ?? "other"}
              onValueChange={v => { setEditValues(ev => ({ ...ev, category: v })); setEditingCell({ rowIdx, col: "currency" }); }}>
              <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </td>
        );
      }
      return (
        <td key="category" className={`${base} cursor-pointer`} onClick={startCellEdit}>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
            style={{ background: `${cat?.color}20`, color: cat?.color }}>
            {cat?.label ?? "其他"}
          </span>
        </td>
      );
    }

    if (col === "currency") {
      const displayCurr = isRowEditing ? (editValues.currency ?? baseCurrency) : expense?.currency;
      if (isEditing) {
        return (
          <td key="currency" className={base}>
            <Select value={editValues.currency ?? baseCurrency}
              onValueChange={v => { setEditValues(ev => ({ ...ev, currency: v })); setEditingCell({ rowIdx, col: "amount" }); }}>
              <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </td>
        );
      }
      return (
        <td key="currency" className={`${base} cursor-pointer hover:bg-accent/50 rounded`} onClick={startCellEdit}>
          <span className="text-muted-foreground text-xs">{displayCurr}</span>
        </td>
      );
    }

    if (col === "amount") {
      const rawAmt = isRowEditing ? parseFloat(editValues.amount ?? "0") : parseFloat(String(expense?.amount ?? "0"));
      const display = isRowEditing ? null : getDisplayAmount(expense);
      if (isEditing) {
        return (
          <td key="amount" className={base}>
            <Input type="number" className="h-7 text-xs w-28 text-right" placeholder="0.00"
              value={editValues.amount ?? ""}
              onChange={e => setEditValues(v => ({ ...v, amount: e.target.value }))}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); setEditingCell({ rowIdx, col: "paidByName" }); }
                if (e.key === "Escape") isNew ? cancelNewRow(rowIdx) : cancelEdit();
              }}
              autoFocus />
          </td>
        );
      }
      return (
        <td key="amount" className={`${base} text-right cursor-pointer hover:bg-accent/50 rounded`} onClick={startCellEdit}>
          {display && display.isConverted ? (
            <div>
              <span className="font-semibold text-foreground">{display.currency} {formatAmount(display.value, display.currency)}</span>
              <div className="text-[10px] text-muted-foreground">原 {expense.currency} {formatAmount(rawAmt, expense.currency)}</div>
            </div>
          ) : (
            <span className="font-semibold text-foreground">
              {(display?.currency ?? expense?.currency)} {formatAmount(display?.value ?? rawAmt, display?.currency ?? expense?.currency ?? baseCurrency)}
            </span>
          )}
        </td>
      );
    }

    if (col === "paidByName") {
      const displayPayer = isRowEditing ? (editValues.paidByName ?? "") : expense?.paidByName;
      if (isEditing) {
        return (
          <td key="paidByName" className={base}>
            <Input className="h-7 text-xs w-24" placeholder="付款人"
              value={editValues.paidByName ?? ""}
              onChange={e => setEditValues(v => ({ ...v, paidByName: e.target.value }))}
              onKeyDown={e => {
                if (e.key === "Enter") isNew ? commitNewRow(rowIdx) : commitEdit(expense);
                if (e.key === "Escape") isNew ? cancelNewRow(rowIdx) : cancelEdit();
              }}
              autoFocus />
          </td>
        );
      }
      return (
        <td key="paidByName" className={`${base} cursor-pointer hover:bg-accent/50 rounded`} onClick={startCellEdit}>
          <span className="text-muted-foreground text-xs">{displayPayer || "—"}</span>
        </td>
      );
    }

    return <td key={col} className={base} />;
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  const validImportCount = parsedRows.filter(r => !r._error).length;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">費用記帳</h2>
          <p className="text-muted-foreground text-sm mt-0.5">基本貨幣：{baseCurrency}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Currency conversion toggle */}
          <div className="relative">
            <button
              onClick={() => setShowCurrencyPicker(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                displayCurrency ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground"
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              {displayCurrency ? displayCurrency : "換算"}
              {conversionLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            </button>
            {showCurrencyPicker && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg p-2 w-48">
                <div className="grid grid-cols-3 gap-1">
                  {displayCurrency && (
                    <button onClick={() => { setDisplayCurrency(null); setShowCurrencyPicker(false); }}
                      className="col-span-3 text-xs px-2 py-1.5 rounded-lg hover:bg-destructive/10 text-destructive text-center mb-1">
                      取消換算
                    </button>
                  )}
                  {CURRENCIES.map(c => (
                    <button key={c} onClick={() => { setDisplayCurrency(c); setShowCurrencyPicker(false); }}
                      className={`text-xs px-2 py-1.5 rounded-lg hover:bg-accent transition-colors ${displayCurrency === c ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Date filter */}
          <div className="relative">
            <button
              onClick={() => setShowDateFilter(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                isFiltered ? "bg-green-600 text-white border-green-600"
                  : "bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground"
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5" />
              {isFiltered ? "篩選中" : "日期"}
            </button>
            {showDateFilter && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg p-4 w-72">
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">日期範圍篩選</p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">開始日期</Label>
                    <Input type="date" className="mt-1 h-8 text-sm" value={filterStart}
                      min={tripStart || undefined} max={filterEnd || tripEnd || undefined}
                      onChange={e => setFilterStart(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">結束日期</Label>
                    <Input type="date" className="mt-1 h-8 text-sm" value={filterEnd}
                      min={filterStart || tripStart || undefined} max={tripEnd || undefined}
                      onChange={e => setFilterEnd(e.target.value)} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs"
                      onClick={() => { setFilterStart(""); setFilterEnd(""); setShowDateFilter(false); }}>清除</Button>
                    <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => setShowDateFilter(false)}>套用</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Split */}
          <button
            onClick={() => setShowSplit(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
              showSplit ? "bg-violet-600 text-white border-violet-600"
                : "bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground"
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            分帳
          </button>
          {/* CSV import */}
          {canEdit && (
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              貼上數據
            </button>
          )}
          {/* Add row */}
          {canEdit && (
            <Button onClick={addNewRow} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" />新增
            </Button>
          )}
        </div>
      </div>

      {/* Split Summary Panel */}
      {showSplit && <SplitSummaryPanel tripId={tripId} baseCurrency={baseCurrency} />}

      {/* Currency conversion notice */}
      {displayCurrency && (
        <div className={`mb-4 px-3 py-2 border rounded-lg flex items-start gap-2 text-xs ${
          hasFallback
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
            : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400"
        }`}>
          {hasFallback ? <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
          <span>
            {conversionLoading ? `正在查詢 ${displayCurrency} 歷史匯率…`
              : hasFallback ? `部分費用使用估算匯率（API 暫時無法取得歷史數據）`
              : `已按各筆費用付款日期換算為 ${displayCurrency}（收市匯率，資料來源：Frankfurter / 55 家央行）`}
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { icon: DollarSign, label: "總費用",
            value: conversionLoading && displayCurrency ? "計算中…" : `${effectiveCurrency} ${formatAmount(stats.total, effectiveCurrency)}`,
            color: "text-blue-500 bg-blue-50 dark:bg-blue-950/30" },
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

      {/* Viewer read-only banner */}
      {!canEdit && trip && (
        <div className="mb-4 px-3 py-2 border rounded-lg flex items-center gap-2 text-xs bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>只讀模式：您是此行程的檢視者，無法新增或編輯費用</span>
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

      {/* Inline-editable expense table */}
      {(!filteredExpenses || filteredExpenses.length === 0) && pendingRows.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <DollarSign className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">還沒有費用記錄</p>
          {canEdit && (
            <div className="flex items-center justify-center gap-3 mt-3">
              <button onClick={addNewRow} className="text-primary hover:underline text-sm">+ 新增第一筆費用</button>
              <span className="text-muted-foreground text-xs">或</span>
              <button onClick={() => setShowImport(true)} className="text-primary hover:underline text-sm flex items-center gap-1">
                <ClipboardPaste className="w-3.5 h-3.5" />貼上 CSV 數據
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">日期</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">名稱</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">類別</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">貨幣</th>
                  <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">金額</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">付款人</th>
                  <th className="px-2 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((expense, rowIdx) => (
                  <tr key={expense.id}
                    className={`border-b border-border last:border-0 group transition-colors ${
                      editingCell?.rowIdx === rowIdx ? "bg-accent/30" : "hover:bg-muted/30"
                    }`}>
                    {renderCell(expense, "date", rowIdx)}
                    {renderCell(expense, "title", rowIdx)}
                    {renderCell(expense, "category", rowIdx)}
                    {renderCell(expense, "currency", rowIdx)}
                    {renderCell(expense, "amount", rowIdx)}
                    {renderCell(expense, "paidByName", rowIdx)}
                    {renderCell(expense, "actions", rowIdx)}
                  </tr>
                ))}
                {pendingRows.map((row, pIdx) => {
                  const rowIdx = (filteredExpenses?.length ?? 0) + pIdx;
                  const mockExpense = { ...row, id: -1 };
                  return (
                    <tr key={`new-${pIdx}`} className="border-b border-border last:border-0 bg-primary/5">
                      {renderCell(mockExpense, "date", rowIdx, true)}
                      {renderCell(mockExpense, "title", rowIdx, true)}
                      {renderCell(mockExpense, "category", rowIdx, true)}
                      {renderCell(mockExpense, "currency", rowIdx, true)}
                      {renderCell(mockExpense, "amount", rowIdx, true)}
                      {renderCell(mockExpense, "paidByName", rowIdx, true)}
                      {renderCell(mockExpense, "actions", rowIdx, true)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="px-3 py-2 border-t border-border">
              <button onClick={addNewRow}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                <Plus className="w-3.5 h-3.5" />新增一行
              </button>
            </div>
          )}
        </div>
      )}

      {/* Click outside overlays */}
      {showCurrencyPicker && <div className="fixed inset-0 z-40" onClick={() => setShowCurrencyPicker(false)} />}
      {showDateFilter && <div className="fixed inset-0 z-40" onClick={() => setShowDateFilter(false)} />}

      {/* CSV Import Dialog */}
      <Dialog open={showImport} onOpenChange={(o) => {
        if (!o) { setShowImport(false); setImportParsed(false); setCsvText(""); setParsedRows([]); }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPaste className="w-4 h-4" />
              貼上數據批量匯入
            </DialogTitle>
          </DialogHeader>
          {!importParsed ? (
            <div className="space-y-4 mt-2">
              <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">支援格式：</p>
                <p>• 從 Excel / Google Sheets 直接複製貼上（Tab 分隔）</p>
                <p>• CSV 格式（逗號分隔）</p>
                <p>• 欄位順序：日期、名稱、金額、貨幣、類別、付款人、備注</p>
                <p>• 如有標題行，系統會自動識別欄位</p>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={csvHasHeader}
                  onChange={e => setCsvHasHeader(e.target.checked)} className="rounded" />
                第一行是標題行
              </label>
              <Textarea
                placeholder={"貼上試算表數據，例如：\n2025-01-15\t午餐\t250\tHKD\t餐飲\t張三\n2025-01-16\t地鐵\t50\tHKD\t交通\t李四"}
                value={csvText} onChange={e => setCsvText(e.target.value)}
                rows={10} className="font-mono text-xs" />
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowImport(false)}>取消</Button>
                <Button className="flex-1" onClick={handleParseCsv}>解析預覽</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <div className={`px-3 py-2 rounded-lg text-xs ${
                validImportCount > 0
                  ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
              }`}>
                解析完成：{validImportCount} 筆有效 · {parsedRows.length - validImportCount} 筆錯誤
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">狀態</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">日期</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">名稱</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">類別</th>
                      <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">金額</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">付款人</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, i) => {
                      const cat = CATEGORIES.find(c => c.value === row.category);
                      return (
                        <tr key={i} className={`border-b border-border last:border-0 ${row._error ? "bg-red-50/50 dark:bg-red-950/20" : ""}`}>
                          <td className="px-2 py-1.5">
                            {row._error
                              ? <span className="text-red-500 text-[10px]">{row._error}</span>
                              : <Check className="w-3.5 h-3.5 text-green-600" />}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">{row.date}</td>
                          <td className="px-2 py-1.5 font-medium text-foreground">{row.title || "—"}</td>
                          <td className="px-2 py-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{ background: `${cat?.color}20`, color: cat?.color }}>
                              {cat?.label ?? "其他"}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold">{row.currency} {row.amount}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{row.paidByName || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setImportParsed(false)}>返回修改</Button>
                <Button className="flex-1" disabled={validImportCount === 0 || bulkAdd.isPending} onClick={handleConfirmImport}>
                  {bulkAdd.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />匯入中…</>
                    : `確認匯入 ${validImportCount} 筆`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Split Summary Panel ─────────────────────────────────────────────────────
function SplitSummaryPanel({ tripId, baseCurrency }: { tripId: number; baseCurrency: string }) {
  const [splitCurrency, setSplitCurrency] = useState(baseCurrency);
  const { data, isLoading, error } = trpc.expenses.getSplitSummary.useQuery(
    { tripId, baseCurrency: splitCurrency },
    { staleTime: 60_000 }
  );
  return (
    <div className="mb-6 bg-card border border-violet-200 dark:border-violet-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-violet-50 dark:bg-violet-950/40 border-b border-violet-200 dark:border-violet-800">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <span className="font-semibold text-sm text-violet-900 dark:text-violet-200">分帳計算</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">換算為</span>
          <Select value={splitCurrency} onValueChange={setSplitCurrency}>
            <SelectTrigger className="h-7 w-24 text-xs border-violet-300 dark:border-violet-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["HKD","USD","EUR","GBP","JPY","CNY","TWD","SGD","AUD","CAD","KRW","THB"].map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {isLoading && (
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />計算中…
        </div>
      )}
      {error && (
        <div className="px-4 py-4 text-sm text-red-500 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />計算失敗，請稍後再試
        </div>
      )}
      {data && !isLoading && (
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">各人結餘</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.members.map(m => {
                const balance = m.net;
                const isPositive = balance > 0;
                const isZero = Math.abs(balance) < 0.01;
                return (
                  <div key={m.userId} className={`px-3 py-2.5 rounded-xl border text-sm ${
                    isZero ? "bg-muted/40 border-border"
                      : isPositive ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isZero ? "bg-muted text-muted-foreground"
                            : isPositive ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                            : "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300"
                        }`}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-foreground truncate">{m.name}</span>
                      </div>
                      <span className={`font-bold text-sm ${
                        isZero ? "text-muted-foreground"
                          : isPositive ? "text-green-700 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}>
                        {isZero ? "已結清" : (isPositive ? "應收 +" : "應付 ")}
                        {!isZero && `${formatAmount(Math.abs(balance), splitCurrency)} ${splitCurrency}`}
                      </span>
                    </div>
                    <div className="flex gap-3 text-[11px] text-muted-foreground pl-9">
                      <span>已付 <span className="font-medium text-foreground">{formatAmount(m.paidTotal, splitCurrency)}</span></span>
                      <span className="text-border">|</span>
                      <span>應付份額 <span className="font-medium text-foreground">{formatAmount(m.owedTotal, splitCurrency)}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {data.settlements.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">最少轉帳方案</p>
              <div className="space-y-2">
                {data.settlements.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2.5 bg-muted/40 rounded-xl border border-border text-sm">
                    <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 flex items-center justify-center text-xs font-bold shrink-0">
                      {s.from.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-foreground">{s.from}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 flex items-center justify-center text-xs font-bold shrink-0">
                      {s.to.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-foreground">{s.to}</span>
                    <span className="ml-auto font-semibold text-foreground shrink-0">
                      {formatAmount(s.amount, splitCurrency)} {splitCurrency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              所有費用已平均分攤，無需轉帳！
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            * 金額已按各筆費用付款日期換算為 {splitCurrency}（Frankfurter 歷史收市匯率）。
          </p>
        </div>
      )}
    </div>
  );
}
