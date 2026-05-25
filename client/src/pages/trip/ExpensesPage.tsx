import { trpc } from "@/lib/trpc";
import { useI18n } from "@/hooks/useI18n";
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
  Check, ClipboardPaste, Camera, ImageIcon, ZoomIn, Download, FileDown, BarChart2
} from "lucide-react";
import { useState, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";

const CATEGORIES_ZH = [
  { value: "transport", label: "交通", color: "#3b82f6" },
  { value: "accommodation", label: "住宿", color: "#8b5cf6" },
  { value: "food", label: "餐飲", color: "#f97316" },
  { value: "attraction", label: "景點", color: "#22c55e" },
  { value: "shopping", label: "購物", color: "#ec4899" },
  { value: "other", label: "其他", color: "#94a3b8" },
];
const CATEGORIES_EN = [
  { value: "transport", label: "Transport", color: "#3b82f6" },
  { value: "accommodation", label: "Accommodation", color: "#8b5cf6" },
  { value: "food", label: "Food & Drink", color: "#f97316" },
  { value: "attraction", label: "Attraction", color: "#22c55e" },
  { value: "shopping", label: "Shopping", color: "#ec4899" },
  { value: "other", label: "Other", color: "#94a3b8" },
];
const CATEGORIES = CATEGORIES_ZH; // default; overridden per-component with useCats()
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
  const { t, lang } = useI18n();
  const CATS = lang === "zh" ? CATEGORIES_ZH : CATEGORIES_EN;
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

  // Receipt lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [uploadingReceiptId, setUploadingReceiptId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadExpenseId = useRef<number | null>(null);
  // AI OCR confirmation dialog
  const [ocrDialog, setOcrDialog] = useState<{
    expenseId: number;
    title: string; amount: string; currency: string; date: string;
    category: "transport" | "food" | "accommodation" | "attraction" | "shopping" | "other";
    confidence: number;
  } | null>(null);
  const [analyzingReceiptId, setAnalyzingReceiptId] = useState<number | null>(null);

  const [exportingPdf, setExportingPdf] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [chartView, setChartView] = useState<"category" | "payer">("category");
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
    onSuccess: () => { refetch(); toast.success(lang === "zh" ? "已儲存" : "Saved"); },
    onError: () => toast.error(lang === "zh" ? "儲存失敗" : "Save failed"),
  });
  const deleteExpense = trpc.expenses.delete.useMutation({
    onSuccess: () => { refetch(); toast.success(lang === "zh" ? "費用已刪除" : "Expense deleted"); },
  });
  const addExpense = trpc.expenses.add.useMutation({
    onSuccess: () => { refetch(); toast.success(lang === "zh" ? "費用已新增" : "Expense added"); },
    onError: () => toast.error(lang === "zh" ? "新增失敗" : "Add failed"),
  });
    const bulkAdd = trpc.expenses.bulkAdd.useMutation({
    onSuccess: (data) => {
      refetch(); toast.success(lang === "zh" ? `成功匯入 ${data.inserted} 筆費用` : `Imported ${data.inserted} expenses`);
      setShowImport(false); setCsvText(""); setParsedRows([]); setImportParsed(false);
    },
    onError: () => toast.error(lang === "zh" ? "匯入失敗" : "Import failed"),
  });
  const uploadReceipt = trpc.expenses.uploadReceipt.useMutation();
  const removeReceipt = trpc.expenses.removeReceipt.useMutation({
    onSuccess: () => { refetch(); toast.success(lang === "zh" ? "收據已刪除" : "Receipt deleted"); },
    onError: () => toast.error(lang === "zh" ? "刪除失敗" : "Delete failed"),
  });
  const analyzeReceipt = trpc.expenses.analyzeReceipt.useMutation({
    onSuccess: (data, vars) => {
      setAnalyzingReceiptId(null);
      // Only show dialog if we got at least a title or amount
      if (data.title || data.amount) {
        setOcrDialog({
          expenseId: (vars as any)._expenseId as number,
          title: data.title,
          amount: data.amount,
          currency: data.currency,
          date: data.date,
          category: data.category,
          confidence: data.confidence,
        });
      } else {
        toast(lang === "zh" ? "AI 未能辨識收據內容，請手動填寫" : "AI could not read the receipt, please fill in manually");
      }
    },
    onError: () => { setAnalyzingReceiptId(null); toast(lang === "zh" ? "AI 辨識失敗，請手動填寫" : "AI analysis failed, please fill in manually"); },
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const expId = pendingUploadExpenseId.current;
    if (!file || !expId) return;
    if (file.size > 10 * 1024 * 1024) { toast.error(lang === "zh" ? "檔案過大，最大 10MB" : "File too large, max 10MB"); return; }
    setUploadingReceiptId(expId);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const [header, base64] = dataUrl.split(",");
      const mimeType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
      // 1. Upload receipt image
      uploadReceipt.mutate(
        { expenseId: expId, tripId, imageData: base64, mimeType, fileName: file.name },
        {
          onSuccess: () => {
            refetch();
            toast.success(lang === "zh" ? "收據已上傳，AI 辨識中…" : "Receipt uploaded, AI analysing…");
            setUploadingReceiptId(null);
            // 2. Trigger AI OCR in parallel
            setAnalyzingReceiptId(expId);
            // Pass expenseId via a custom property on the input object
            const ocrInput = Object.assign(
              { tripId, imageData: base64, mimeType },
              { _expenseId: expId }
            );
            analyzeReceipt.mutate(ocrInput as any);
          },
          onError: (err) => {
            toast.error(lang === "zh" ? `上傳失敗: ${err.message}` : `Upload failed: ${err.message}`);
            setUploadingReceiptId(null);
          },
        }
      );
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [tripId, uploadReceipt, analyzeReceipt]);

  const stats = useMemo(() => {
    if (!filteredExpenses) return { total: 0, byCategory: [], byPayer: [] };
    let total = 0;
    const byCat: Record<string, number> = {};
    const byPayer: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      const { value } = getDisplayAmount(e);
      total += value;
      const cat = CATS.find(c => c.value === e.category);
      const catLabel = cat?.label ?? (lang === "zh" ? "其他" : "Other");
      byCat[catLabel] = (byCat[catLabel] ?? 0) + value;
      const payer = e.paidByName ?? (lang === "zh" ? "未知" : "Unknown");
      byPayer[payer] = (byPayer[payer] ?? 0) + value;
    });
    return {
      total,
      byCategory: Object.entries(byCat).map(([name, value]) => ({
        name, value: Math.round(value * 100) / 100,
        color: CATS.find(c => c.label === name)?.color ?? "#94a3b8"
      })),
      byPayer: Object.entries(byPayer).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })),
    };
  }, [filteredExpenses, conversionMap, displayCurrency]);

  async function handleExportPdf() {
    if (!expenses || expenses.length === 0) return;
    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const tripName = trip?.name ?? (lang === "zh" ? "行程費用報告" : "Trip Expense Report");
      const dateRange = trip ? `${getDateStr(trip.startDate)} ~ ${getDateStr(trip.endDate)}` : "";
      // Header
      doc.setFontSize(18); doc.setFont("helvetica", "bold");
      doc.text(tripName, 14, 20);
      doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
      doc.text(dateRange, 14, 28);
      doc.text(`${lang === "zh" ? "匯出日期" : "Exported"}: ${new Date().toLocaleDateString()}`, 14, 34);
      doc.text(`${lang === "zh" ? "基本貨幣" : "Base currency"}: ${effectiveCurrency}`, 14, 40);
      // Table header
      let y = 50;
      const cols = [
        { label: lang === "zh" ? "日期" : "Date", x: 14, w: 28 },
        { label: lang === "zh" ? "名稱" : "Name", x: 44, w: 60 },
        { label: lang === "zh" ? "類別" : "Category", x: 106, w: 28 },
        { label: lang === "zh" ? "貨幣" : "Cur", x: 136, w: 16 },
        { label: lang === "zh" ? "金額" : "Amount", x: 154, w: 28 },
        { label: lang === "zh" ? "付款人" : "Payer", x: 184, w: 22 },
      ];
      doc.setFillColor(240, 240, 250); doc.rect(12, y - 5, 186, 8, "F");
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(60);
      cols.forEach(c => doc.text(c.label, c.x, y));
      y += 6;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(40);
      let total = 0;
      expenses.forEach((e, idx) => {
        if (y > 270) { doc.addPage(); y = 20; }
        if (idx % 2 === 0) { doc.setFillColor(250, 250, 255); doc.rect(12, y - 4, 186, 7, "F"); }
        const catLabel = CATS.find(c => c.value === e.category)?.label ?? (lang === "zh" ? "其他" : "Other");
        const amt = parseFloat(String(e.amount));
        total += amt;
        doc.text(getDateStr(e.date), cols[0].x, y);
        const titleText = (e.title ?? "").substring(0, 28);
        doc.text(titleText, cols[1].x, y);
        doc.text(catLabel.substring(0, 10), cols[2].x, y);
        doc.text(e.currency ?? "", cols[3].x, y);
        doc.text(formatAmount(amt, e.currency), cols[4].x, y, { align: "right" });
        doc.text((e.paidByName ?? "").substring(0, 8), cols[5].x, y);
        y += 7;
      });
      // Total row
      y += 2;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(`${lang === "zh" ? "合計" : "Total"}: ${effectiveCurrency} ${formatAmount(stats.total, effectiveCurrency)}`, 14, y);
      // Footer
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`${lang === "zh" ? "由 Travel Planner 匯出" : "Exported by Travel Planner"} · ${new Date().toISOString()}`, 14, 290);
      doc.save(`${tripName.replace(/\s+/g, "_")}_expenses.pdf`);
      toast.success(lang === "zh" ? "PDF 已匯出" : "PDF exported");
    } catch (err) {
      toast.error(lang === "zh" ? "匯出失敗" : "Export failed");
    } finally {
      setExportingPdf(false);
    }
  }

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
    if (!editValues.title || !editValues.amount) { toast.error(lang === "zh" ? "名稱和金額為必填" : "Name and amount are required"); return; }
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
    if (!csvText.trim()) { toast.error(lang === "zh" ? "請貼上數據" : "Please paste data first"); return; }
    const rows = parseCsvText(csvText);
    if (rows.length === 0) { toast.error(lang === "zh" ? "無法解析數據" : "Could not parse data"); return; }
    const parsed = rowsToExpenses(rows, csvHasHeader, baseCurrency);
    setParsedRows(parsed); setImportParsed(true);
  }

  function handleConfirmImport() {
    const valid = parsedRows.filter(r => !r._error);
    if (valid.length === 0) { toast.error(lang === "zh" ? "沒有有效的費用記錄" : "No valid expense records found"); return; }
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
                className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600" title={lang === "zh" ? "儲存" : "Save"}>
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => isNew ? cancelNewRow(rowIdx) : cancelEdit()}
                className="p-1 rounded hover:bg-muted text-muted-foreground" title={lang === "zh" ? "取消" : "Cancel"}>
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
              className="p-1 rounded hover:bg-accent text-muted-foreground" title={lang === "zh" ? "編輯" : "Edit"}>
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => deleteExpense.mutate({ expenseId: expense.id, tripId })}
              className="p-1 rounded hover:bg-destructive/10 text-destructive" title={lang === "zh" ? "刪除" : "Delete"}>
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
            <Input className="h-7 text-xs min-w-[120px]" placeholder={lang === "zh" ? "費用名稱" : "Expense name"}
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
          <span className="font-medium text-foreground">{displayTitle || <span className="text-muted-foreground italic text-xs">{lang === "zh" ? "點擊輸入" : "Click to enter"}</span>}</span>
        </td>
      );
    }

    if (col === "category") {
      const displayCat = isRowEditing ? (editValues.category ?? "other") : (expense?.category ?? "other");
      const cat = CATS.find(c => c.value === displayCat);
      if (isEditing) {
        return (
          <td key="category" className={base}>
            <Select value={editValues.category ?? "other"}
              onValueChange={v => { setEditValues(ev => ({ ...ev, category: v })); setEditingCell({ rowIdx, col: "currency" }); }}>
              <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{CATS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </td>
        );
      }
      return (
        <td key="category" className={`${base} cursor-pointer`} onClick={startCellEdit}>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
            style={{ background: `${cat?.color}20`, color: cat?.color }}>
            {cat?.label ?? (lang === "zh" ? "其他" : "Other")}
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
            <Input className="h-7 text-xs w-24" placeholder={lang === "zh" ? "付款人" : "Payer"}
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
          <h2 className="text-xl font-bold text-foreground">{lang === "zh" ? "費用記帳" : "Expenses"}</h2>
          <p className="text-muted-foreground text-sm mt-0.5">{lang === "zh" ? "基本貨幣：" : "Base currency: "}{baseCurrency}</p>
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
              {displayCurrency ? displayCurrency : (lang === "zh" ? "換算" : "Convert")}
              {conversionLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            </button>
            {showCurrencyPicker && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg p-2 w-48">
                <div className="grid grid-cols-3 gap-1">
                  {displayCurrency && (
                    <button onClick={() => { setDisplayCurrency(null); setShowCurrencyPicker(false); }}
                      className="col-span-3 text-xs px-2 py-1.5 rounded-lg hover:bg-destructive/10 text-destructive text-center mb-1">
                        {lang === "zh" ? "取消換算" : "Clear"}
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
              {isFiltered ? (lang === "zh" ? "篩選中" : "Filtered") : (lang === "zh" ? "日期" : "Date")}
            </button>
            {showDateFilter && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg p-4 w-72">
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">{lang === "zh" ? "日期範圍篩選" : "Date Range Filter"}</p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">{lang === "zh" ? "開始日期" : "From"}</Label>
                    <Input type="date" className="mt-1 h-8 text-sm" value={filterStart}
                      min={tripStart || undefined} max={filterEnd || tripEnd || undefined}
                      onChange={e => setFilterStart(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">{lang === "zh" ? "結束日期" : "To"}</Label>
                    <Input type="date" className="mt-1 h-8 text-sm" value={filterEnd}
                      min={filterStart || tripStart || undefined} max={tripEnd || undefined}
                      onChange={e => setFilterEnd(e.target.value)} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs"
                      onClick={() => { setFilterStart(""); setFilterEnd(""); setShowDateFilter(false); }}>{lang === "zh" ? "清除" : "Clear"}</Button>
                    <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => setShowDateFilter(false)}>{lang === "zh" ? "套用" : "Apply"}</Button>
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
            {lang === "zh" ? "分帳" : "Split"}
          </button>
          {/* CSV import */}
          {canEdit && (
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              {lang === "zh" ? "貼上數據" : "Paste Data"}
            </button>
          )}
          {/* Chart toggle */}
          <button
            onClick={() => setShowCharts(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
              showCharts ? "bg-blue-600 text-white border-blue-600"
                : "bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground"
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            {lang === "zh" ? "圖表" : "Charts"}
          </button>
          {/* PDF Export */}
          {expenses && expenses.length > 0 && (
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground disabled:opacity-50"
            >
              {exportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              {lang === "zh" ? "匯出 PDF" : "Export PDF"}
            </button>
          )}
          {/* Add row */}
          {canEdit && (
            <Button onClick={addNewRow} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" />{lang === "zh" ? "新增" : "Add"}
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
            {conversionLoading ? (lang === "zh" ? `正在查詢 ${displayCurrency} 歷史匯率…` : `Fetching ${displayCurrency} historical rates…`) : hasFallback ? (lang === "zh" ? `部分費用使用估算匯率（API 暫時無法取得歷史數據）` : `Some expenses use estimated rates (historical data unavailable)`) : (lang === "zh" ? `已按各筆費用付款日期換算為 ${displayCurrency}（收市匯率，資料來源：Frankfurter / 55 家央行）` : `Converted to ${displayCurrency} by payment date (closing rates, Frankfurter / 55 central banks)`)}
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { icon: DollarSign, label: lang === "zh" ? "總費用" : "Total",
            value: conversionLoading && displayCurrency ? "計算中…" : `${effectiveCurrency} ${formatAmount(stats.total, effectiveCurrency)}`,
            color: "text-blue-500 bg-blue-50 dark:bg-blue-950/30" },
          { icon: TrendingUp, label: lang === "zh" ? "筆數" : "Count", value: lang === "zh" ? `${expenses?.length ?? 0} 筆` : `${expenses?.length ?? 0}`, color: "text-green-500 bg-green-50 dark:bg-green-950/30" },
          { icon: Users, label: lang === "zh" ? "付款人" : "Payers", value: lang === "zh" ? `${stats.byPayer.length} 人` : `${stats.byPayer.length}`, color: "text-purple-500 bg-purple-50 dark:bg-purple-950/30" },
          { icon: ImageIcon, label: lang === "zh" ? "收據" : "Receipts", value: lang === "zh" ? `${expenses?.filter(e => e.receiptUrl).length ?? 0} 張` : `${expenses?.filter(e => e.receiptUrl).length ?? 0}`, color: "text-orange-500 bg-orange-50 dark:bg-orange-950/30" },
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

      {/* Charts panel - collapsible */}
      {showCharts && expenses && expenses.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5 mb-6">
          {/* View switcher */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">{lang === "zh" ? "支出分析" : "Expense Analytics"}</h3>
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              <button
                onClick={() => setChartView("category")}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  chartView === "category" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent"
                }`}
              >{lang === "zh" ? "類別" : "Category"}</button>
              <button
                onClick={() => setChartView("payer")}
                className={`px-3 py-1.5 font-medium transition-colors border-l border-border ${
                  chartView === "payer" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent"
                }`}
              >{lang === "zh" ? "成員" : "Member"}</button>
            </div>
          </div>
          {chartView === "category" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pie chart */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">{lang === "zh" ? "類別占比" : "Category breakdown"}</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={stats.byCategory} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {stats.byCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`${effectiveCurrency} ${formatAmount(v, effectiveCurrency)}`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Bar chart by category */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">{lang === "zh" ? "各類別金額" : "Amount by category"}</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.byCategory} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [`${effectiveCurrency} ${formatAmount(v, effectiveCurrency)}`, ""]} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {stats.byCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {chartView === "payer" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pie by payer */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">{lang === "zh" ? "成員支出占比" : "Member share"}</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={stats.byPayer} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {stats.byPayer.map((_, i) => (
                        <Cell key={i} fill={["#3b82f6","#8b5cf6","#f97316","#22c55e","#ec4899","#94a3b8","#eab308","#06b6d4"][i % 8]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`${effectiveCurrency} ${formatAmount(v, effectiveCurrency)}`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Bar by payer */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">{lang === "zh" ? "各人支出金額" : "Amount per member"}</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.byPayer} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [`${effectiveCurrency} ${formatAmount(v, effectiveCurrency)}`, ""]} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {stats.byPayer.map((_, i) => (
                        <Cell key={i} fill={["#3b82f6","#8b5cf6","#f97316","#22c55e","#ec4899","#94a3b8","#eab308","#06b6d4"][i % 8]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Viewer read-only banner */}
      {!canEdit && trip && (
        <div className="mb-4 px-3 py-2 border rounded-lg flex items-center gap-2 text-xs bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{lang === "zh" ? "只讀模式：您是此行程的檢視者，無法新增或編輯費用" : "Read-only: you are a viewer of this trip and cannot add or edit expenses"}</span>
        </div>
      )}

      {/* Active filter notice */}
      {isFiltered && (
        <div className="mb-4 px-3 py-2 border rounded-lg flex items-center gap-2 text-xs bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
          <CalendarRange className="w-3.5 h-3.5 shrink-0" />
          <span>{lang === "zh" ? `篩選中：${filterStart || "最早"} 至 ${filterEnd || "最新"} · 顯示 ${filteredExpenses.length} / ${expenses?.length ?? 0} 筆` : `Filtered: ${filterStart || "earliest"} to ${filterEnd || "latest"} · showing ${filteredExpenses.length} / ${expenses?.length ?? 0}`}</span>
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
          <p className="text-muted-foreground">{lang === "zh" ? "還沒有費用記錄" : "No expenses yet"}</p>
          {canEdit && (
            <div className="flex items-center justify-center gap-3 mt-3">
              <button onClick={addNewRow} className="text-primary hover:underline text-sm">+ {lang === "zh" ? "新增第一筆費用" : "Add first expense"}</button>
              <span className="text-muted-foreground text-xs">{lang === "zh" ? "或" : "or"}</span>
              <button onClick={() => setShowImport(true)} className="text-primary hover:underline text-sm flex items-center gap-1">
                <ClipboardPaste className="w-3.5 h-3.5" />{lang === "zh" ? "貼上 CSV 數據" : "Paste CSV data"}
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
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{lang === "zh" ? "日期" : "Date"}</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">{lang === "zh" ? "名稱" : "Name"}</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{lang === "zh" ? "類別" : "Category"}</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{lang === "zh" ? "貨幣" : "Currency"}</th>
                  <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">{lang === "zh" ? "金額" : "Amount"}</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{lang === "zh" ? "付款人" : "Payer"}</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground whitespace-nowrap w-10" title="收據">
                    <ImageIcon className="w-3.5 h-3.5 mx-auto" />
                  </th>
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
                    <td className="px-1 py-1.5 text-center align-middle">
                      <div className="relative inline-flex items-center justify-center">
                        {expense.receiptUrl ? (
                          <button
                            onClick={() => setLightboxUrl(expense.receiptUrl!)}
                            className="relative group/thumb w-8 h-8 rounded overflow-hidden border border-border hover:border-primary transition-colors inline-flex items-center justify-center"
                            title={lang === "zh" ? "查看收據" : "View receipt"}
                          >
                            <img src={expense.receiptUrl} alt={lang === "zh" ? "收據" : "Receipt"} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                              <ZoomIn className="w-3 h-3 text-white" />
                            </div>
                          </button>
                        ) : canEdit ? (
                          <button
                            onClick={() => { pendingUploadExpenseId.current = expense.id; fileInputRef.current?.click(); }}
                            disabled={uploadingReceiptId === expense.id}
                            className="w-8 h-8 rounded border border-dashed border-border hover:border-primary hover:text-primary text-muted-foreground transition-colors inline-flex items-center justify-center opacity-0 group-hover:opacity-100"
                            title={lang === "zh" ? "上傳收據" : "Upload receipt"}
                          >
                            {uploadingReceiptId === expense.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Camera className="w-3 h-3" />}
                          </button>
                        ) : null}
                        {/* AI analyzing spinner overlay */}
                        {analyzingReceiptId === expense.id && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center" title="AI 辨識中…">
                            <Loader2 className="w-2.5 h-2.5 text-primary-foreground animate-spin" />
                          </div>
                        )}
                      </div>
                    </td>
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
                      <td className="px-1 py-1.5" />
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
                <Plus className="w-3.5 h-3.5" />{lang === "zh" ? "新增一行" : "Add Row"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Hidden file input for receipt upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Receipt Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] w-full flex flex-col items-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full mb-3 px-1">
              <span className="text-white/80 text-sm font-medium">{lang === "zh" ? "收據照片" : "Receipt"}</span>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <Download className="w-3.5 h-3.5" />{lang === "zh" ? "下載" : "Download"}
                </a>
                {canEdit && (
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-xs transition-colors"
                    onClick={() => {
                      const exp = filteredExpenses?.find(e => e.receiptUrl === lightboxUrl);
                      if (exp) { removeReceipt.mutate({ expenseId: exp.id, tripId }); setLightboxUrl(null); }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />{lang === "zh" ? "刪除收據" : "Remove Receipt"}
                  </button>
                )}
                <button
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                  onClick={() => setLightboxUrl(null)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <img
              src={lightboxUrl}
              alt={lang === "zh" ? "收據" : "Receipt"}
              className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* AI OCR Confirmation Dialog */}
      <Dialog open={!!ocrDialog} onOpenChange={(o) => { if (!o) setOcrDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-lg">✨</span> {lang === "zh" ? "AI 收據辨識結果" : "AI Receipt Analysis"}
            </DialogTitle>
          </DialogHeader>
          {ocrDialog && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {lang === "zh" ? 'AI 已從收據中擷取以下資訊，請確認或修改後點「套用」。' : "AI extracted the following from your receipt. Review and edit before applying."}
                {ocrDialog.confidence < 0.6 && (
                  <span className="ml-1 text-amber-500">{lang === "zh" ? "（信心度較低，請仔細核對）" : "(Low confidence — please verify)"}</span>
                )}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">{lang === "zh" ? "商家名稱" : "Merchant"}</Label>
                  <Input
                    className="h-8 text-sm mt-1"
                    value={ocrDialog.title}
                    onChange={e => setOcrDialog(d => d ? { ...d, title: e.target.value } : d)}
                  />
                </div>
                <div>
                  <Label className="text-xs">{lang === "zh" ? "金額" : "Amount"}</Label>
                  <Input
                    className="h-8 text-sm mt-1"
                    value={ocrDialog.amount}
                    onChange={e => setOcrDialog(d => d ? { ...d, amount: e.target.value } : d)}
                  />
                </div>
                <div>
                  <Label className="text-xs">{lang === "zh" ? "貨幣" : "Currency"}</Label>
                  <Select
                    value={ocrDialog.currency || ""}
                    onValueChange={v => setOcrDialog(d => d ? { ...d, currency: v } : d)}
                  >
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue placeholder={lang === "zh" ? "選擇貨幣" : "Select currency"} />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{lang === "zh" ? "日期" : "Date"}</Label>
                  <Input
                    type="date"
                    className="h-8 text-sm mt-1"
                    value={ocrDialog.date}
                    onChange={e => setOcrDialog(d => d ? { ...d, date: e.target.value } : d)}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">{lang === "zh" ? "類別" : "Category"}</Label>
                  <Select
                    value={ocrDialog.category}
                    onValueChange={v => setOcrDialog(d => d ? { ...d, category: v as typeof d.category } : d)}
                  >
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setOcrDialog(null)}
                >
                  {lang === "zh" ? "跳過" : "Skip"}
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={updateExpense.isPending}
                  onClick={() => {
                    if (!ocrDialog) return;
                    const updates: Record<string, string> = {};
                    if (ocrDialog.title)    updates.title    = ocrDialog.title;
                    if (ocrDialog.amount)   updates.amount   = ocrDialog.amount;
                    if (ocrDialog.currency) updates.currency = ocrDialog.currency;
                    if (ocrDialog.date)     updates.date     = ocrDialog.date;
                    if (ocrDialog.category) updates.category = ocrDialog.category;
                    updateExpense.mutate(
                      { expenseId: ocrDialog.expenseId, tripId, ...updates } as any,
                      { onSuccess: () => { setOcrDialog(null); toast.success(lang === "zh" ? "資訊已套用" : "Information applied"); } }
                    );
                  }}
                >
                  {updateExpense.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (lang === "zh" ? "✔ 套用" : "✔ Apply")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
              {lang === "zh" ? "貼上數據批量匯入" : "Paste Data to Import"}
            </DialogTitle>
          </DialogHeader>
          {!importParsed ? (
            <div className="space-y-4 mt-2">
              <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
<p className="font-medium text-foreground">{lang === "zh" ? "支援格式：" : "Supported formats:"}</p>
<p>• {lang === "zh" ? "從 Excel / Google Sheets 直接複製貼上（Tab 分隔）" : "Copy-paste from Excel / Google Sheets (tab-separated)"}</p>
<p>• {lang === "zh" ? "CSV 格式（逗號分隔）" : "CSV format (comma-separated)"}</p>
<p>• {lang === "zh" ? "欄位順序：日期、名稱、金額、貨幣、類別、付款人、備注" : "Column order: date, name, amount, currency, category, payer, notes"}</p>
<p>• {lang === "zh" ? "如有標題行，系統會自動識別欄位" : "Header row is auto-detected"}</p>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={csvHasHeader}
                  onChange={e => setCsvHasHeader(e.target.checked)} className="rounded" />
                {lang === "zh" ? "第一行是標題行" : "First row is header"}
              </label>
              <Textarea
                placeholder={lang === "zh" ? "貼上試算表數據，例如：\n2025-01-15\t午餐\t250\tHKD\t餐飲\t張三\n2025-01-16\t地鐵\t50\tHKD\t交通\t李四" : "Paste spreadsheet data, e.g.:\n2025-01-15\tLunch\t250\tHKD\tFood\tAlice\n2025-01-16\tMTR\t50\tHKD\tTransport\tBob"}
                value={csvText} onChange={e => setCsvText(e.target.value)}
                rows={10} className="font-mono text-xs" />
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowImport(false)}>取消</Button>
                <Button className="flex-1" onClick={handleParseCsv}>{lang === "zh" ? "解析預覽" : "Preview"}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <div className={`px-3 py-2 rounded-lg text-xs ${
                validImportCount > 0
                  ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
              }`}>
                {lang === "zh" ? `解析完成：${validImportCount} 筆有效 · ${parsedRows.length - validImportCount} 筆錯誤` : `Parsed: ${validImportCount} valid · ${parsedRows.length - validImportCount} errors`}
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{lang === "zh" ? "狀態" : "Status"}</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{lang === "zh" ? "日期" : "Date"}</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{lang === "zh" ? "名稱" : "Name"}</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{lang === "zh" ? "類別" : "Category"}</th>
                      <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">{lang === "zh" ? "金額" : "Amount"}</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{lang === "zh" ? "付款人" : "Payer"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, i) => {
                      const cat = CATS.find(c => c.value === row.category);
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
                              {cat?.label ?? (lang === "zh" ? "其他" : "Other")}
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
                <Button variant="outline" className="flex-1" onClick={() => setImportParsed(false)}>{lang === "zh" ? "返回修改" : "Back"}</Button>
                <Button className="flex-1" disabled={validImportCount === 0 || bulkAdd.isPending} onClick={handleConfirmImport}>
                  {bulkAdd.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />{lang === "zh" ? "匯入中…" : "Importing…"}</>
                    : (lang === "zh" ? `確認匯入 ${validImportCount} 筆` : `Import ${validImportCount} rows`)}
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
  const { lang } = useI18n();
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
          <span className="font-semibold text-sm text-violet-900 dark:text-violet-200">{lang === "zh" ? "分帳計算" : "Split Calculator"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{lang === "zh" ? "換算為" : "Convert to"}</span>
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
          <Loader2 className="w-4 h-4 animate-spin" />{lang === "zh" ? "計算中…" : "Calculating…"}
        </div>
      )}
      {error && (
        <div className="px-4 py-4 text-sm text-red-500 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />{lang === "zh" ? "計算失敗，請稍後再試" : "Calculation failed, please try again"}
        </div>
      )}
      {data && !isLoading && (
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{lang === "zh" ? "各人結餘" : "Balances"}</p>
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
                        {isZero ? (lang === "zh" ? "已結清" : "Settled") : (isPositive ? (lang === "zh" ? "應收 +" : "Owed +") : (lang === "zh" ? "應付 " : "Owes "))}
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
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{lang === "zh" ? "最少轉帳方案" : "Minimum Transfers"}</p>
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
              {lang === "zh" ? "所有費用已平均分攤，無需轉帳！" : "All expenses are evenly split — no transfers needed!"}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            * {lang === "zh" ? `金額已按各筆費用付款日期換算為 ${splitCurrency}（Frankfurter 歷史收市匯率）。` : `Amounts converted to ${splitCurrency} using historical rates (Frankfurter).`}
          </p>
        </div>
      )}
    </div>
  );
}
