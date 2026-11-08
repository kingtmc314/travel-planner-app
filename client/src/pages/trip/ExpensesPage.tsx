import { trpc } from "@/lib/trpc";
import { useI18n } from "@/hooks/useI18n";
import { useAuth } from "@/_core/hooks/useAuth";
import { getHongKongToday, normalizeDateOnly } from "@/lib/hongKongDate";
import {
  defaultExpenseDate,
  expenseCsvCell,
  expenseDate,
  expenseInsights,
  originalCurrencyTotals,
  resolveExpenseAmount,
  validExpenseAmount,
} from "@/lib/expenseInsights";
import ActivityExpenseImport from "@/components/ActivityExpenseImport";
import { TripBudgetPanel } from "@/components/TripBudgetPanel";
import SplitSummaryPanel from "./SplitSummaryPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Plus,
  Trash2,
  Loader2,
  DollarSign,
  TrendingUp,
  Users,
  Edit2,
  ArrowLeftRight,
  AlertCircle,
  CalendarRange,
  X,
  Calculator,
  Check,
  ClipboardPaste,
  Camera,
  ImageIcon,
  ZoomIn,
  Download,
  FileDown,
  BarChart2,
} from "lucide-react";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
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
const CURRENCIES = [
  "HKD",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "TWD",
  "SGD",
  "AUD",
  "CAD",
  "KRW",
  "THB",
  "EGP",
  "MYR",
  "IDR",
  "PHP",
  "VND",
];
const NO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "IDR", "VND"]);

function formatAmount(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  if (NO_DECIMAL_CURRENCIES.has(currency))
    return Math.round(amount).toLocaleString();
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getDateStr(dateVal: Date | string | null | undefined): string {
  return expenseDate(dateVal);
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
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } // escaped quote
      else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvText(text: string): string[][] {
  const sep = detectSeparator(text);
  return text
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => parseCsvLine(l, sep));
}

type ParsedExpense = {
  title: string;
  amount: string;
  currency: string;
  category: string;
  paidByName: string;
  date: string;
  notes: string;
  _error?: string;
};

const CATEGORY_MAP: Record<string, string> = {
  交通: "transport",
  transport: "transport",
  住宿: "accommodation",
  accommodation: "accommodation",
  餐飲: "food",
  food: "food",
  飲食: "food",
  景點: "attraction",
  attraction: "attraction",
  活動: "attraction",
  購物: "shopping",
  shopping: "shopping",
  其他: "other",
  other: "other",
};

function mapCategory(raw: string): string {
  if (!raw) return "other";
  return (
    CATEGORY_MAP[raw.trim()] ??
    CATEGORY_MAP[raw.toLowerCase().trim()] ??
    "other"
  );
}

function mapCurrency(raw: string): string {
  const upper = raw.toUpperCase().trim();
  return /^[A-Z]{3}$/.test(upper) ? upper : "";
}

function parseDate(raw: string): string {
  if (!raw) return getHongKongToday();
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso)
    return normalizeDateOnly(
      `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
    );
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy)
    return normalizeDateOnly(
      `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`
    );
  return "";
}

function autoMapColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const patterns: Record<string, RegExp> = {
    date: /日期|date/i,
    title: /名稱|標題|項目|title|name|desc/i,
    amount: /金額|amount|price|費用/i,
    currency: /貨幣|幣種|currency/i,
    category: /類別|分類|category/i,
    paidByName: /付款人|付款|payer|paid/i,
    notes: /備注|備註|notes|remark/i,
  };
  headers.forEach((h, i) => {
    for (const [key, re] of Object.entries(patterns)) {
      if (re.test(h) && !(key in map)) map[key] = i;
    }
  });
  return map;
}

function rowsToExpenses(
  rows: string[][],
  hasHeader: boolean,
  baseCurrency: string
): ParsedExpense[] {
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const headers = hasHeader ? rows[0] : [];
  const colMap = hasHeader ? autoMapColumns(headers) : {};
  return dataRows
    .map(cells => {
      const get = (key: string, pos: number) => {
        const idx = colMap[key] ?? (hasHeader ? -1 : pos);
        return idx >= 0 && idx < cells.length ? cells[idx] : "";
      };
      const title = get("title", 1);
      const rawAmount = get("amount", 2);
      const amount = rawAmount.replace(/[,\s]/g, "");
      const currency = mapCurrency(get("currency", 3) || baseCurrency);
      const category = mapCategory(get("category", 4));
      const paidByName = get("paidByName", 5);
      const date = parseDate(get("date", 0));
      const notes = get("notes", 6);
      const error = !title
        ? "title"
        : validExpenseAmount(amount, true) === null
          ? "amount"
          : !currency
            ? "currency"
            : !date
              ? "date"
              : undefined;
      return {
        title,
        amount,
        currency,
        category,
        paidByName,
        date,
        notes,
        _error: error,
      };
    })
    .filter(r => r.title || r.amount);
}

// ─── Inline row state ────────────────────────────────────────────────────────
type EditValues = {
  title?: string;
  amount?: string;
  currency?: string;
  category?: string;
  paidByName?: string;
  date?: string;
  notes?: string;
};

type PendingRow = {
  title: string;
  amount: string;
  currency: string;
  category: string;
  paidByName: string;
  date: string;
  notes: string;
};

type EditingCell = { rowIdx: number; col: string } | null;

// ─── Main component ──────────────────────────────────────────────────────────
export default function ExpensesPage({ tripId }: { tripId: number }) {
  const { lang } = useI18n();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const CATS = lang === "zh" ? CATEGORIES_ZH : CATEGORIES_EN;
  const {
    data: expenses,
    refetch,
    isLoading,
    error: expensesError,
  } = trpc.expenses.list.useQuery({ tripId }, { refetchInterval: 15000 });
  const {
    data: trip,
    isLoading: tripLoading,
    error: tripError,
  } = trpc.trips.get.useQuery({ tripId });
  const {
    data: days,
    isLoading: activitiesLoading,
    error: activitiesError,
  } = trpc.itinerary.getDays.useQuery({ tripId });
  const { data: members } = trpc.members.list.useQuery({ tripId });
  const activitySources = useMemo(
    () =>
      (days ?? []).flatMap(day =>
        day.activities.map(activity => ({
          ...activity,
          date: getDateStr(day.date),
        }))
      ),
    [days]
  );
  const baseCurrency = trip?.baseCurrency ?? "HKD";
  const canEdit = trip?.userRole === "owner" || trip?.userRole === "editor";
  const authenticatedPayer =
    members?.find(member => member.userId === user?.id)?.displayName ??
    user?.name ??
    "";
  const [recentDefaults, setRecentDefaults] = useState<{
    tripId: number;
    currency: string;
    payer: string;
  } | null>(null);
  const [chartCurrency, setChartCurrency] = useState<string | null>(null);

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
  const [uploadingReceiptId, setUploadingReceiptId] = useState<number | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadExpenseId = useRef<number | null>(null);
  // AI OCR confirmation dialog
  const [ocrDialog, setOcrDialog] = useState<{
    expenseId: number;
    title: string;
    amount: string;
    currency: string;
    date: string;
    category:
      | "transport"
      | "food"
      | "accommodation"
      | "attraction"
      | "shopping"
      | "other";
    confidence: number;
  } | null>(null);
  const [analyzingReceiptId, setAnalyzingReceiptId] = useState<number | null>(
    null
  );

  const [exportingPdf, setExportingPdf] = useState(false);
  const [showCharts, setShowCharts] = useState(true);
  const [chartView, setChartView] = useState<"category" | "payer">("category");
  // CSV import
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvHasHeader, setCsvHasHeader] = useState(true);
  const [parsedRows, setParsedRows] = useState<ParsedExpense[]>([]);
  const [importParsed, setImportParsed] = useState(false);

  useEffect(() => {
    setRecentDefaults(null);
    setDisplayCurrency(null);
    setChartCurrency(null);
    setPendingRows([]);
    setEditingCell(null);
    setEditValues({});
    setFilterStart("");
    setFilterEnd("");
    setShowImport(false);
    setParsedRows([]);
    setImportParsed(false);
  }, [tripId]);

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
    return filteredExpenses
      .filter(e => validExpenseAmount(e.amount) !== null && getDateStr(e.date))
      .map(e => ({
        id: e.id,
        amount: String(e.amount),
        currency: e.currency,
        date: getDateStr(e.date),
      }));
  }, [filteredExpenses, displayCurrency]);

  const {
    data: conversionData,
    isLoading: conversionLoading,
    error: conversionError,
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

  function getDisplayAmount(expense: {
    id: number;
    amount: string | number;
    currency: string;
  }) {
    return resolveExpenseAmount(
      expense,
      displayCurrency,
      conversionMap.get(expense.id)
    );
  }

  const updateExpense = trpc.expenses.update.useMutation({
    onSuccess: () => {
      utils.invalidate();
      toast.success(lang === "zh" ? "已儲存" : "Saved");
    },
    onError: error =>
      toast.error(
        `${lang === "zh" ? "儲存失敗" : "Save failed"}: ${error.message}`
      ),
  });
  const deleteExpense = trpc.expenses.delete.useMutation({
    onSuccess: () => {
      utils.invalidate();
      toast.success(lang === "zh" ? "費用已刪除" : "Expense deleted");
    },
    onError: error =>
      toast.error(
        `${lang === "zh" ? "刪除失敗" : "Delete failed"}: ${error.message}`
      ),
  });
  const addExpense = trpc.expenses.add.useMutation({
    onSuccess: (_, input) => {
      setRecentDefaults({
        tripId,
        currency: input.currency,
        payer: input.paidByName ?? authenticatedPayer,
      });
      utils.invalidate();
      toast.success(lang === "zh" ? "費用已新增" : "Expense added");
    },
    onError: error =>
      toast.error(
        `${lang === "zh" ? "新增失敗" : "Add failed"}: ${error.message}`
      ),
  });
  const bulkAdd = trpc.expenses.bulkAdd.useMutation({
    onSuccess: data => {
      utils.invalidate();
      toast.success(
        lang === "zh"
          ? `成功匯入 ${data.inserted} 筆費用`
          : `Imported ${data.inserted} expenses`
      );
      setShowImport(false);
      setCsvText("");
      setParsedRows([]);
      setImportParsed(false);
    },
    onError: error =>
      toast.error(
        `${lang === "zh" ? "匯入失敗" : "Import failed"}: ${error.message}`
      ),
  });
  const uploadReceipt = trpc.expenses.uploadReceipt.useMutation();
  const removeReceipt = trpc.expenses.removeReceipt.useMutation({
    onSuccess: () => {
      utils.invalidate();
      toast.success(lang === "zh" ? "收據已刪除" : "Receipt deleted");
    },
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
          date:
            expenseDate(data.date) ||
            defaultExpenseDate(trip?.startDate, trip?.endDate),
          category: data.category,
          confidence: data.confidence,
        });
      } else {
        toast(
          lang === "zh"
            ? "AI 未能辨識收據內容，請手動填寫"
            : "AI could not read the receipt, please fill in manually"
        );
      }
    },
    onError: () => {
      setAnalyzingReceiptId(null);
      toast(
        lang === "zh"
          ? "AI 辨識失敗，請手動填寫"
          : "AI analysis failed, please fill in manually"
      );
    },
  });

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const expId = pendingUploadExpenseId.current;
      if (!file || !expId) return;
      if (file.size > 10 * 1024 * 1024) {
        toast.error(
          lang === "zh" ? "檔案過大，最大 10MB" : "File too large, max 10MB"
        );
        return;
      }
      setUploadingReceiptId(expId);
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string;
        const [header, base64] = dataUrl.split(",");
        const mimeType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
        // 1. Upload receipt image
        uploadReceipt.mutate(
          {
            expenseId: expId,
            tripId,
            imageData: base64,
            mimeType,
            fileName: file.name,
          },
          {
            onSuccess: () => {
              utils.invalidate();
              toast.success(
                lang === "zh"
                  ? "收據已上傳，AI 辨識中…"
                  : "Receipt uploaded, AI analysing…"
              );
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
            onError: err => {
              toast.error(
                lang === "zh"
                  ? `上傳失敗: ${err.message}`
                  : `Upload failed: ${err.message}`
              );
              setUploadingReceiptId(null);
            },
          }
        );
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [tripId, uploadReceipt, analyzeReceipt]
  );

  const resolvedExpenses = useMemo(
    () =>
      filteredExpenses.map(expense => {
        const resolved = resolveExpenseAmount(
          expense,
          displayCurrency,
          conversionMap.get(expense.id)
        );
        return {
          ...expense,
          value: resolved.value,
          resolvedCurrency: resolved.currency,
          unavailable: resolved.unavailable,
        };
      }),
    [filteredExpenses, conversionMap, displayCurrency]
  );
  const availableCurrencies = useMemo(
    () =>
      Array.from(
        new Set(
          resolvedExpenses
            .filter(expense => expense.value !== null)
            .map(expense => expense.resolvedCurrency)
        )
      ).sort(),
    [resolvedExpenses]
  );
  const analysisCurrency =
    chartCurrency && availableCurrencies.includes(chartCurrency)
      ? chartCurrency
      : displayCurrency && availableCurrencies.includes(displayCurrency)
        ? displayCurrency
        : availableCurrencies.includes(baseCurrency)
          ? baseCurrency
          : (availableCurrencies[0] ?? baseCurrency);
  const stats = useMemo(() => {
    const insights = expenseInsights(resolvedExpenses, analysisCurrency);
    return {
      ...insights,
      isMultiCurrency: Object.keys(insights.byCurrency).length > 1,
      byCategory: insights.byCategory.map(entry => ({
        ...entry,
        name:
          CATS.find(category => category.value === entry.category)?.label ??
          (lang === "zh" ? "其他" : "Other"),
        color:
          CATS.find(category => category.value === entry.category)?.color ??
          "#94a3b8",
      })),
      byPayer: insights.byPayer.map(entry => ({
        ...entry,
        name:
          entry.name === "__unknown__"
            ? lang === "zh"
              ? "未填付款人"
              : "Unspecified payer"
            : entry.name,
      })),
    };
  }, [resolvedExpenses, analysisCurrency, lang]);
  const unavailableConversionCount = resolvedExpenses.filter(
    expense => expense.unavailable
  ).length;
  const filteredActivities = activitySources.filter(
    activity =>
      (!filterStart || activity.date >= filterStart) &&
      (!filterEnd || activity.date <= filterEnd)
  );
  const pricedActivities = filteredActivities.filter(
    activity => validExpenseAmount(activity.cost) !== null
  );
  const estimatedTotals = originalCurrencyTotals(
    pricedActivities.map(activity => ({
      amount: activity.cost!,
      currency: activity.currency || baseCurrency,
    }))
  );
  const payerCount = new Set(
    filteredExpenses.map(expense => expense.paidByName?.trim()).filter(Boolean)
  ).size;

  async function handleExportPdf() {
    if (!filteredExpenses.length || exportingPdf) return;
    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const tripName =
        trip?.name ?? (lang === "zh" ? "行程費用報告" : "Trip Expense Report");
      const dateRange = trip
        ? `${getDateStr(trip.startDate)} ~ ${getDateStr(trip.endDate)}`
        : "";
      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(tripName, 14, 20);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(dateRange, 14, 28);
      doc.text(
        `Exported: ${getHongKongToday()} (Asia/Hong_Kong UTC+8)`,
        14,
        34
      );
      doc.text("Recorded expenses - original currencies / subtotals", 14, 40);
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
      doc.setFillColor(240, 240, 250);
      doc.rect(12, y - 5, 186, 8, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60);
      cols.forEach(c => doc.text(c.label, c.x, y));
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(40);
      filteredExpenses.forEach((e, idx) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        if (idx % 2 === 0) {
          doc.setFillColor(250, 250, 255);
          doc.rect(12, y - 4, 186, 7, "F");
        }
        const catLabel =
          CATS.find(c => c.value === e.category)?.label ??
          (lang === "zh" ? "其他" : "Other");
        const amt = validExpenseAmount(e.amount, true);
        doc.text(getDateStr(e.date), cols[0].x, y);
        const titleText = (e.title ?? "").substring(0, 28);
        doc.text(titleText, cols[1].x, y);
        doc.text(catLabel.substring(0, 10), cols[2].x, y);
        doc.text(e.currency ?? "", cols[3].x, y);
        doc.text(
          amt === null ? "Invalid" : formatAmount(amt, e.currency),
          cols[4].x,
          y,
          { align: "right" }
        );
        doc.text((e.paidByName ?? "").substring(0, 8), cols[5].x, y);
        y += 7;
      });
      // Total row
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      Object.entries(originalCurrencyTotals(filteredExpenses)).forEach(
        ([currency, amount]) => {
          if (y > 275) {
            doc.addPage();
            y = 20;
          }
          doc.text(
            `Subtotal: ${currency} ${formatAmount(amount, currency)}`,
            14,
            y
          );
          y += 6;
        }
      );
      // Footer
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`VoyageAI - ${getHongKongToday()} (Hong Kong)`, 14, 290);
      doc.save(`${tripName.replace(/\s+/g, "_")}_expenses.pdf`);
      toast.success(lang === "zh" ? "PDF 已匯出" : "PDF exported");
    } catch (err) {
      toast.error(lang === "zh" ? "匯出失敗" : "Export failed");
    } finally {
      setExportingPdf(false);
    }
  }

  function handleExportCsv() {
    if (!filteredExpenses.length) return;
    const headers =
      lang === "zh"
        ? ["日期", "名稱", "金額", "貨幣", "類別", "付款人", "備註"]
        : ["Date", "Name", "Amount", "Currency", "Category", "Payer", "Notes"];
    const rows = [
      headers,
      ...filteredExpenses.map(expense => [
        getDateStr(expense.date),
        expense.title,
        expense.amount,
        expense.currency,
        CATS.find(category => category.value === expense.category)?.label ??
          expense.category,
        expense.paidByName,
        expense.notes,
      ]),
      [],
      [
        lang === "zh"
          ? "原幣小計（不合併貨幣）"
          : "Original currency subtotals (not combined)",
      ],
      ...Object.entries(originalCurrencyTotals(filteredExpenses)).map(
        ([currency, amount]) => [currency, amount.toFixed(2)]
      ),
    ];
    const blob = new Blob(
      [
        "\uFEFF" +
          rows.map(row => row.map(expenseCsvCell).join(",")).join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${trip?.name ?? "VoyageAI"}_expenses.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const hasFallback = conversionData?.results.some(r => r.isFallback) ?? false;
  const tripStart = trip?.startDate ? getDateStr(trip.startDate) : "";
  const tripEnd = trip?.endDate ? getDateStr(trip.endDate) : "";

  // ─── Inline editing ──────────────────────────────────────────────────────
  function startEdit(rowIdx: number, col: string, expense: any) {
    if (addExpense.isPending || updateExpense.isPending) return;
    setEditingCell({ rowIdx, col });
    setEditValues({
      title: expense.title,
      amount: String(parseFloat(String(expense.amount))),
      currency: expense.currency,
      category: expense.category ?? "other",
      paidByName: expense.paidByName ?? "",
      date: getDateStr(expense.date),
      notes: expense.notes ?? "",
    });
  }

  function commitEdit(expense: any) {
    if (!canEdit || updateExpense.isPending) return;
    if (!validateEditValues()) return;
    updateExpense.mutate(
      {
        expenseId: expense.id,
        tripId,
        title: editValues.title?.trim(),
        amount: Number(editValues.amount).toFixed(2),
        currency: editValues.currency,
        category: editValues.category as any,
        paidByName: editValues.paidByName,
        date: editValues.date,
        notes: editValues.notes,
      },
      {
        onSuccess: () => {
          setEditingCell(null);
          setEditValues({});
        },
      }
    );
  }

  function cancelEdit() {
    setEditingCell(null);
    setEditValues({});
  }

  function validateEditValues() {
    if (!editValues.title?.trim()) {
      toast.error(lang === "zh" ? "請輸入開支名稱" : "Enter an expense name");
      return false;
    }
    if (validExpenseAmount(editValues.amount, true) === null) {
      toast.error(
        lang === "zh"
          ? "請輸入有效金額（退款可用負數）"
          : "Enter a finite amount (negative for refunds)"
      );
      return false;
    }
    if (!normalizeDateOnly(editValues.date)) {
      toast.error(lang === "zh" ? "請輸入有效日期" : "Enter a valid date");
      return false;
    }
    if (!/^[A-Z]{3}$/.test(editValues.currency ?? "")) {
      toast.error(lang === "zh" ? "請選擇有效貨幣" : "Select a valid currency");
      return false;
    }
    return true;
  }

  function addNewRow() {
    if (!canEdit || addExpense.isPending || tripLoading || pendingRows.length)
      return;
    const newRow: PendingRow = {
      title: "",
      amount: "",
      currency:
        recentDefaults?.tripId === tripId
          ? recentDefaults.currency
          : baseCurrency,
      category: "other",
      paidByName:
        recentDefaults?.tripId === tripId
          ? recentDefaults.payer
          : authenticatedPayer,
      date: defaultExpenseDate(tripStart, tripEnd),
      notes: "",
    };
    setPendingRows(prev => [...prev, newRow]);
    const newIdx = (filteredExpenses?.length ?? 0) + pendingRows.length;
    setEditingCell({ rowIdx: newIdx, col: "title" });
    setEditValues({ ...newRow });
  }

  function commitNewRow(rowIdx: number) {
    if (!canEdit || addExpense.isPending) return;
    const pendingIdx = rowIdx - (filteredExpenses?.length ?? 0);
    if (!validateEditValues()) return;
    addExpense.mutate(
      {
        tripId,
        title: editValues.title!.trim(),
        amount: Number(editValues.amount).toFixed(2),
        currency: editValues.currency ?? baseCurrency,
        category: (editValues.category ?? "other") as any,
        paidByName: editValues.paidByName,
        date: editValues.date ?? defaultExpenseDate(tripStart, tripEnd),
        notes: editValues.notes,
      },
      {
        onSuccess: () => {
          setPendingRows(prev => prev.filter((_, i) => i !== pendingIdx));
          setEditingCell(null);
          setEditValues({});
        },
      }
    );
  }

  function cancelNewRow(rowIdx: number) {
    const pendingIdx = rowIdx - (filteredExpenses?.length ?? 0);
    setPendingRows(prev => prev.filter((_, i) => i !== pendingIdx));
    setEditingCell(null);
    setEditValues({});
  }

  // ─── CSV import ──────────────────────────────────────────────────────────
  function handleParseCsv() {
    if (!csvText.trim()) {
      toast.error(lang === "zh" ? "請貼上數據" : "Please paste data first");
      return;
    }
    const rows = parseCsvText(csvText);
    if (rows.length === 0) {
      toast.error(lang === "zh" ? "無法解析數據" : "Could not parse data");
      return;
    }
    const parsed = rowsToExpenses(rows, csvHasHeader, baseCurrency);
    setParsedRows(parsed);
    setImportParsed(true);
  }

  function handleConfirmImport() {
    if (!canEdit || bulkAdd.isPending) return;
    const valid = parsedRows.filter(r => !r._error);
    if (valid.length === 0) {
      toast.error(
        lang === "zh" ? "沒有有效的費用記錄" : "No valid expense records found"
      );
      return;
    }
    if (valid.length > 500) {
      toast.error(
        lang === "zh"
          ? "每次最多匯入 500 筆"
          : "Import up to 500 rows at a time"
      );
      return;
    }
    bulkAdd.mutate({
      tripId,
      expenses: valid.map(r => ({
        title: r.title,
        amount: r.amount,
        currency: r.currency,
        category: r.category as any,
        paidByName: r.paidByName || undefined,
        date: r.date,
        notes: r.notes || undefined,
      })),
    });
  }

  // ─── Cell renderer ───────────────────────────────────────────────────────
  function renderCell(
    expense: any,
    col: string,
    rowIdx: number,
    isNew = false
  ) {
    const isEditing =
      editingCell?.rowIdx === rowIdx && editingCell?.col === col;
    const isRowEditing = editingCell?.rowIdx === rowIdx;
    const base = "px-2 py-1.5 text-sm align-middle";

    if (col === "actions") {
      if (!canEdit) return <td key="actions" className={base} />;
      if (isRowEditing) {
        return (
          <td key="actions" className={`${base} whitespace-nowrap`}>
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  isNew ? commitNewRow(rowIdx) : commitEdit(expense)
                }
                disabled={addExpense.isPending || updateExpense.isPending}
                className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600"
                title={lang === "zh" ? "儲存" : "Save"}
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => (isNew ? cancelNewRow(rowIdx) : cancelEdit())}
                disabled={addExpense.isPending || updateExpense.isPending}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                title={lang === "zh" ? "取消" : "Cancel"}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </td>
        );
      }
      return (
        <td
          key="actions"
          className={`${base} whitespace-nowrap opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity`}
        >
          <div className="flex items-center gap-1">
            <button
              onClick={() => startEdit(rowIdx, "title", expense)}
              className="p-1 rounded hover:bg-accent active:bg-accent text-muted-foreground"
              title={lang === "zh" ? "編輯" : "Edit"}
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() =>
                deleteExpense.mutate({ expenseId: expense.id, tripId })
              }
              disabled={deleteExpense.isPending}
              className="p-1 rounded hover:bg-destructive/10 active:bg-destructive/10 text-destructive"
              title={lang === "zh" ? "刪除" : "Delete"}
            >
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
      const displayDate = isRowEditing
        ? (editValues.date ?? "")
        : getDateStr(expense?.date);
      if (isEditing) {
        return (
          <td key="date" className={base}>
            <Input
              type="date"
              className="h-7 text-xs w-36 px-1.5"
              value={editValues.date ?? ""}
              onChange={e =>
                setEditValues(v => ({ ...v, date: e.target.value }))
              }
              onKeyDown={e => {
                if (e.key === "Enter") setEditingCell({ rowIdx, col: "title" });
                if (e.key === "Escape")
                  isNew ? cancelNewRow(rowIdx) : cancelEdit();
              }}
              autoFocus
            />
          </td>
        );
      }
      return (
        <td
          key="date"
          className={`${base} cursor-pointer hover:bg-accent/50 rounded`}
          onClick={startCellEdit}
        >
          <span className="text-muted-foreground">{displayDate}</span>
        </td>
      );
    }

    if (col === "title") {
      const displayTitle = isRowEditing
        ? (editValues.title ?? "")
        : expense?.title;
      if (isEditing) {
        return (
          <td key="title" className={base}>
            <Input
              className="h-7 text-xs min-w-[120px]"
              placeholder={lang === "zh" ? "費用名稱" : "Expense name"}
              value={editValues.title ?? ""}
              onChange={e =>
                setEditValues(v => ({ ...v, title: e.target.value }))
              }
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  setEditingCell({ rowIdx, col: "amount" });
                }
                if (e.key === "Escape")
                  isNew ? cancelNewRow(rowIdx) : cancelEdit();
              }}
              autoFocus
            />
          </td>
        );
      }
      return (
        <td
          key="title"
          className={`${base} cursor-pointer hover:bg-accent/50 rounded`}
          onClick={startCellEdit}
        >
          <span className="font-medium text-foreground">
            {displayTitle || (
              <span className="text-muted-foreground italic text-xs">
                {lang === "zh" ? "點擊輸入" : "Click to enter"}
              </span>
            )}
          </span>
        </td>
      );
    }

    if (col === "category") {
      const displayCat = isRowEditing
        ? (editValues.category ?? "other")
        : (expense?.category ?? "other");
      const cat = CATS.find(c => c.value === displayCat);
      if (isEditing) {
        return (
          <td key="category" className={base}>
            <Select
              value={editValues.category ?? "other"}
              onValueChange={v => {
                setEditValues(ev => ({ ...ev, category: v }));
                setEditingCell({ rowIdx, col: "currency" });
              }}
            >
              <SelectTrigger className="h-7 text-xs w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATS.map(c => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </td>
        );
      }
      return (
        <td
          key="category"
          className={`${base} cursor-pointer`}
          onClick={startCellEdit}
        >
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
            style={{ background: `${cat?.color}20`, color: cat?.color }}
          >
            {cat?.label ?? (lang === "zh" ? "其他" : "Other")}
          </span>
        </td>
      );
    }

    if (col === "currency") {
      const displayCurr = isRowEditing
        ? (editValues.currency ?? baseCurrency)
        : expense?.currency;
      if (isEditing) {
        return (
          <td key="currency" className={base}>
            <Select
              value={editValues.currency ?? baseCurrency}
              onValueChange={v => {
                setEditValues(ev => ({ ...ev, currency: v }));
                setEditingCell({ rowIdx, col: "amount" });
              }}
            >
              <SelectTrigger className="h-7 text-xs w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </td>
        );
      }
      return (
        <td
          key="currency"
          className={`${base} cursor-pointer hover:bg-accent/50 rounded`}
          onClick={startCellEdit}
        >
          <span className="text-muted-foreground text-xs">{displayCurr}</span>
        </td>
      );
    }

    if (col === "amount") {
      const rawAmt = validExpenseAmount(
        isRowEditing ? editValues.amount : expense?.amount,
        true
      );
      const display = isRowEditing ? null : getDisplayAmount(expense);
      if (isEditing) {
        return (
          <td key="amount" className={base}>
            <Input
              type="number"
              min="-99999999.99"
              step="0.01"
              max="99999999.99"
              className="h-7 text-xs w-28 text-right"
              placeholder="0.00"
              value={editValues.amount ?? ""}
              onChange={e =>
                setEditValues(v => ({ ...v, amount: e.target.value }))
              }
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  setEditingCell({ rowIdx, col: "paidByName" });
                }
                if (e.key === "Escape")
                  isNew ? cancelNewRow(rowIdx) : cancelEdit();
              }}
              autoFocus
            />
          </td>
        );
      }
      return (
        <td
          key="amount"
          className={`${base} text-right cursor-pointer hover:bg-accent/50 rounded`}
          onClick={startCellEdit}
        >
          {display && display.isConverted ? (
            <div>
              <span className="font-semibold text-foreground">
                {display.currency}{" "}
                {display.value === null
                  ? "—"
                  : formatAmount(display.value, display.currency)}
              </span>
              <div className="text-[10px] text-muted-foreground">
                {lang === "zh" ? "原幣" : "Original"} {expense.currency}{" "}
                {rawAmt === null ? "—" : formatAmount(rawAmt, expense.currency)}
              </div>
            </div>
          ) : (
            <div>
              <span className="font-semibold text-foreground">
                {display?.currency ?? expense?.currency}{" "}
                {rawAmt === null
                  ? "—"
                  : formatAmount(
                      display?.value ?? rawAmt,
                      display?.currency ?? expense?.currency ?? baseCurrency
                    )}
              </span>
              {display?.unavailable && (
                <p className="text-[10px] text-amber-700">
                  {lang === "zh"
                    ? "保留原幣 · 匯率未確認"
                    : "Original · rate unverified"}
                </p>
              )}
            </div>
          )}
        </td>
      );
    }

    if (col === "paidByName") {
      const displayPayer = isRowEditing
        ? (editValues.paidByName ?? "")
        : expense?.paidByName;
      if (isEditing) {
        return (
          <td key="paidByName" className={base}>
            <Input
              className="h-7 text-xs w-24"
              placeholder={lang === "zh" ? "付款人" : "Payer"}
              value={editValues.paidByName ?? ""}
              onChange={e =>
                setEditValues(v => ({ ...v, paidByName: e.target.value }))
              }
              onKeyDown={e => {
                if (e.key === "Enter")
                  isNew ? commitNewRow(rowIdx) : commitEdit(expense);
                if (e.key === "Escape")
                  isNew ? cancelNewRow(rowIdx) : cancelEdit();
              }}
              autoFocus
            />
          </td>
        );
      }
      return (
        <td
          key="paidByName"
          className={`${base} cursor-pointer hover:bg-accent/50 rounded`}
          onClick={startCellEdit}
        >
          <span className="text-muted-foreground text-xs">
            {displayPayer || "—"}
          </span>
        </td>
      );
    }

    return <td key={col} className={base} />;
  }

  if (isLoading || tripLoading)
    return (
      <div
        className="mx-auto max-w-5xl space-y-4 px-4 py-6"
        aria-busy="true"
        aria-label={lang === "zh" ? "載入開支中" : "Loading expenses"}
      >
        <div className="h-40 animate-pulse rounded-[28px] bg-primary/10" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(key => (
            <div
              key={key}
              className="h-28 animate-pulse rounded-2xl bg-muted"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );

  if (expensesError || tripError)
    return (
      <div className="voyage-panel mx-4 my-6 space-y-3" role="alert">
        <h2 className="font-semibold">
          {lang === "zh" ? "未能載入開支" : "Unable to load expenses"}
        </h2>
        <p className="break-words text-sm text-muted-foreground">
          {expensesError?.message ?? tripError?.message}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            refetch();
            utils.trips.get.invalidate({ tripId });
          }}
        >
          {lang === "zh" ? "重試" : "Retry"}
        </Button>
      </div>
    );

  const validImportCount = parsedRows.filter(r => !r._error).length;

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="voyage-hero mb-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
            {lang === "zh"
              ? "旅程帳簿 · 每一筆都有記錄"
              : "Travel ledger · every detail matters"}
          </p>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {lang === "zh" ? "開支與旅程節奏" : "Your journey, in numbers"}
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/75">
            {lang === "zh"
              ? "只記一次，串連行程活動與開支。已記帳支出與活動預算分開呈現，讓旅程花費一目了然。"
              : "Enter once, connect your itinerary and ledger. Recorded spending and activity estimates stay clearly separate."}
          </p>
          <p className="mt-3 text-xs text-white/60">
            {lang === "zh" ? "行程基本貨幣" : "Trip base currency"}{" "}
            {baseCurrency} · Asia/Hong_Kong UTC+8
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={addNewRow}
            disabled={addExpense.isPending || pendingRows.length > 0}
            className="shrink-0 gap-1.5 self-start bg-white text-primary hover:bg-white/90 sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            {lang === "zh" ? "記低一筆開支" : "Record an expense"}
          </Button>
        )}
      </div>
      <div className="mb-5"><TripBudgetPanel tripId={tripId} /></div>
      <div className="voyage-panel mb-5">
        <div className="mb-3 flex items-center gap-2">
          <p className="voyage-eyebrow">
            {lang === "zh" ? "帳簿工具" : "Ledger tools"}
          </p>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {lang === "zh"
              ? "原幣記錄 · 可選換算"
              : "Original currency · optional conversion"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 [&_button]:min-h-9">
          {/* Currency conversion toggle */}
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
              {displayCurrency
                ? displayCurrency
                : lang === "zh"
                  ? "換算"
                  : "Convert"}
              {conversionLoading && (
                <Loader2 className="w-3 h-3 animate-spin" />
              )}
            </button>
            {showCurrencyPicker && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-popover text-popover-foreground border border-border rounded-xl shadow-lg p-2 w-48">
                <div className="grid grid-cols-3 gap-1">
                  {displayCurrency && (
                    <button
                      onClick={() => {
                        setDisplayCurrency(null);
                        setShowCurrencyPicker(false);
                      }}
                      className="col-span-3 text-xs px-2 py-1.5 rounded-lg hover:bg-destructive/10 text-destructive text-center mb-1"
                    >
                      {lang === "zh" ? "取消換算" : "Clear"}
                    </button>
                  )}
                  {CURRENCIES.map(c => (
                    <button
                      key={c}
                      onClick={() => {
                        setDisplayCurrency(c);
                        setShowCurrencyPicker(false);
                      }}
                      className={`text-xs px-2 py-1.5 rounded-lg hover:bg-accent transition-colors ${displayCurrency === c ? "bg-primary text-primary-foreground" : "text-foreground"}`}
                    >
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
                isFiltered
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground"
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5" />
              {isFiltered
                ? lang === "zh"
                  ? "篩選中"
                  : "Filtered"
                : lang === "zh"
                  ? "日期"
                  : "Date"}
            </button>
            {showDateFilter && (
              <div className="fixed left-4 right-4 top-1/3 z-50 mx-auto max-w-xs bg-popover text-popover-foreground border border-border rounded-xl shadow-lg p-4">
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                  {lang === "zh" ? "日期範圍篩選" : "Date Range Filter"}
                </p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">
                      {lang === "zh" ? "開始日期" : "From"}
                    </Label>
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
                    <Label className="text-xs">
                      {lang === "zh" ? "結束日期" : "To"}
                    </Label>
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
                      onClick={() => {
                        setFilterStart("");
                        setFilterEnd("");
                        setShowDateFilter(false);
                      }}
                    >
                      {lang === "zh" ? "清除" : "Clear"}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => setShowDateFilter(false)}
                    >
                      {lang === "zh" ? "套用" : "Apply"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Split */}
          <button
            onClick={() => setShowSplit(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
              showSplit
                ? "bg-violet-600 text-white border-violet-600"
                : "bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground"
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            {lang === "zh" ? "分帳" : "Split"}
          </button>
          <ActivityExpenseImport
            key={tripId}
            tripId={tripId}
            activities={activitySources}
            baseCurrency={baseCurrency}
            canEdit={canEdit}
            isLoading={activitiesLoading}
            hasError={!!activitiesError}
          />
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
              showCharts
                ? "bg-primary text-primary-foreground border-primary"
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
              {exportingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileDown className="w-3.5 h-3.5" />
              )}
              {lang === "zh" ? "匯出 PDF" : "Export PDF"}
            </button>
          )}
          {filteredExpenses.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCsv}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              {lang === "zh" ? "匯出 CSV" : "Export CSV"}
            </Button>
          )}
          {/* Add row */}
          {canEdit && (
            <Button
              onClick={addNewRow}
              disabled={addExpense.isPending || pendingRows.length > 0}
              size="sm"
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {lang === "zh" ? "新增" : "Add"}
            </Button>
          )}
        </div>
      </div>

      {/* Split Summary Panel */}
      {showSplit && (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {lang === "zh"
              ? "分帳涵蓋整段行程，不套用以下日期篩選。"
              : "Split calculations cover the whole trip, not the date filter below."}
          </p>
          <SplitSummaryPanel
            key={tripId}
            tripId={tripId}
            baseCurrency={baseCurrency}
          />
        </>
      )}

      {/* Currency conversion notice */}
      {displayCurrency && (
        <div
          className={`mb-4 px-3 py-2 border rounded-lg flex items-start gap-2 text-xs ${
            hasFallback
              ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
              : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400"
          }`}
        >
          {hasFallback ? (
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          ) : (
            <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          )}
          <span>
            {conversionLoading
              ? lang === "zh"
                ? `正在查詢 ${displayCurrency} 歷史匯率…`
                : `Fetching ${displayCurrency} historical rates…`
              : unavailableConversionCount || conversionError || hasFallback
                ? lang === "zh"
                  ? `${unavailableConversionCount} 筆缺少已確認匯率，保留原幣小計及原幣分析；不使用靜態估算匯率。`
                  : `${unavailableConversionCount} expenses lack verified rates and remain in original currency subtotals and charts. Static estimates are not used.`
                : lang === "zh"
                  ? `已按付款日期換算為 ${displayCurrency}（Frankfurter 歷史收市匯率；換算金額不是原始付款額）。`
                  : `Converted to ${displayCurrency} using payment-date historical rates (Frankfurter); converted values are not original payments.`}
          </span>
        </div>
      )}

      {/* Recorded facts; these always follow the visible date filter. */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            icon: TrendingUp,
            label: lang === "zh" ? "已記帳開支" : "Recorded entries",
            value: filteredExpenses.length,
          },
          {
            icon: Users,
            label: lang === "zh" ? "已填付款人" : "Named payers",
            value: payerCount,
          },
          {
            icon: ImageIcon,
            label: lang === "zh" ? "已附收據" : "Receipts attached",
            value: filteredExpenses.filter(expense => expense.receiptUrl)
              .length,
          },
          {
            icon: CalendarRange,
            label: lang === "zh" ? "有記帳的日子" : "Days with entries",
            value: new Set(
              filteredExpenses
                .map(expense => getDateStr(expense.date))
                .filter(Boolean)
            ).size,
          },
        ].map(metric => (
          <div key={metric.label} className="voyage-metric min-w-0 p-4">
            <metric.icon className="mb-3 h-4 w-4 text-primary" />
            <p className="text-2xl font-bold tabular-nums">{metric.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.label}</p>
          </div>
        ))}
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="voyage-panel min-w-0 border-l-4 border-l-primary">
          <p className="voyage-eyebrow">
            {lang === "zh" ? "已記帳 · 非估算" : "Recorded · not estimated"}
          </p>
          <h3 className="voyage-section-title mt-1">
            {lang === "zh" ? "帳簿淨支出小計" : "Net ledger spending"}
          </h3>
          {conversionLoading && displayCurrency ? (
            <div className="my-4 h-8 w-3/4 animate-pulse rounded-lg bg-muted" />
          ) : (
            <div className="my-3 space-y-1.5">
              {Object.keys(stats.byCurrency).length ? (
                Object.entries(stats.byCurrency).map(([currency, amount]) => (
                  <p
                    key={currency}
                    className="break-words text-xl font-bold tabular-nums"
                  >
                    {currency} {formatAmount(amount, currency)}
                  </p>
                ))
              ) : (
                <p className="text-xl font-bold">—</p>
              )}
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {displayCurrency
              ? lang === "zh"
                ? "只換算有已確認匯率的記錄；其餘保留原幣。"
                : "Only verified rates are converted; other records retain original currency."
              : lang === "zh"
                ? "依原幣分開加總，不混合不同貨幣。"
                : "Original currency subtotals, never mixed."}
          </p>
          {stats.invalid > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              {lang === "zh"
                ? `${stats.invalid} 筆金額無效，未納入分析。`
                : `${stats.invalid} invalid amounts excluded from analysis.`}
            </p>
          )}
        </section>
        <section className="voyage-panel min-w-0 border-l-4 border-l-emerald-200">
          <p className="voyage-eyebrow">
            {lang === "zh"
              ? "活動價格 · 僅估算"
              : "Activity prices · estimates only"}
          </p>
          <h3 className="voyage-section-title mt-1">
            {lang === "zh" ? "行程活動預算" : "Itinerary cost estimates"}
          </h3>
          {activitiesLoading ? (
            <div className="my-4 h-8 w-3/4 animate-pulse rounded-lg bg-muted" />
          ) : activitiesError ? (
            <p className="my-3 text-sm text-amber-700">
              {lang === "zh"
                ? "未能載入活動估算"
                : "Unable to load activity estimates"}
            </p>
          ) : (
            <div className="my-3 space-y-1.5">
              {Object.keys(estimatedTotals).length ? (
                Object.entries(estimatedTotals).map(([currency, amount]) => (
                  <p
                    key={currency}
                    className="break-words text-xl font-bold tabular-nums"
                  >
                    {currency} {formatAmount(amount, currency)}
                  </p>
                ))
              ) : (
                <p className="text-xl font-bold">—</p>
              )}
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {activitiesLoading || activitiesError
              ? lang === "zh"
                ? "活動價格只供估算，不代表已付款，不會與帳簿支出相加。"
                : "Activity prices are estimates, not proof of payment, and are never added to ledger spending."
              : lang === "zh"
                ? `按 ${pricedActivities.length} 個有價格的活動計算（原幣）；不代表已付款，也不會與帳簿支出相加。匯入前請核實金額。`
                : `Based on ${pricedActivities.length} priced activities in original currency. Not proof of payment and never added to ledger spending. Verify prices before importing.`}
          </p>
          {!activitiesLoading &&
            !activitiesError &&
            filteredActivities.length > pricedActivities.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                {lang === "zh"
                  ? `${filteredActivities.length - pricedActivities.length} 個活動未有有效價格`
                  : `${filteredActivities.length - pricedActivities.length} activities lack a valid price`}
              </p>
            )}
        </section>
      </div>

      {showCharts && filteredExpenses.length > 0 && (
        <section className="voyage-panel mb-6 min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="voyage-eyebrow">
                {lang === "zh" ? "真實記帳數據" : "Real ledger data"}
              </p>
              <h3 className="voyage-section-title mt-1">
                {lang === "zh"
                  ? "每日花費與支出分佈"
                  : "Daily rhythm & spending mix"}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="expense-chart-currency"
                className="text-xs text-muted-foreground"
              >
                {lang === "zh" ? "分析貨幣" : "Chart currency"}
              </Label>
              <Select value={analysisCurrency} onValueChange={setChartCurrency}>
                <SelectTrigger
                  id="expense-chart-currency"
                  className="h-9 w-24 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(availableCurrencies.length
                    ? availableCurrencies
                    : [baseCurrency]
                  ).map(currency => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            {lang === "zh"
              ? `只分析 ${analysisCurrency} · ${stats.count} 筆開支（含已記錄退款）；不同貨幣不會合併。`
              : `Showing ${analysisCurrency} only · ${stats.count} entries, including recorded refunds. Different currencies are never combined.`}
          </p>
          {conversionLoading && displayCurrency ? (
            <div className="h-64 animate-pulse rounded-xl bg-muted" />
          ) : (
            <>
              <div className="mb-5 grid grid-cols-2 gap-3">
                <div className="min-w-0 rounded-xl bg-accent/40 p-3">
                  <p className="text-[11px] text-muted-foreground">
                    {lang === "zh"
                      ? "平均每日 · 只計有記帳的日子"
                      : "Average · recorded days only"}
                  </p>
                  <p className="mt-1 break-words text-base font-bold tabular-nums">
                    {stats.averageRecordedDay === null
                      ? "—"
                      : `${analysisCurrency} ${formatAmount(stats.averageRecordedDay, analysisCurrency)}`}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl bg-accent/40 p-3">
                  <p className="text-[11px] text-muted-foreground">
                    {lang === "zh" ? "最高支出日" : "Highest spending day"}
                  </p>
                  <p className="mt-1 break-words text-base font-bold tabular-nums">
                    {stats.peakDay
                      ? `${analysisCurrency} ${formatAmount(stats.peakDay.value, analysisCurrency)}`
                      : "—"}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {stats.peakDay?.date ?? "—"}
                  </p>
                </div>
              </div>
              <h4 className="mb-2 text-sm font-semibold">
                {lang === "zh" ? "每日已記帳支出" : "Recorded daily spending"}
              </h4>
              {stats.byDay.length ? (
                <div className="min-w-0">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={stats.byDay}
                      margin={{ left: 0, right: 4, top: 10, bottom: 5 }}
                    >
                      <XAxis
                        dataKey="date"
                        tickFormatter={date => String(date).slice(5)}
                        tick={{ fontSize: 10 }}
                        minTickGap={20}
                      />
                      <YAxis width={48} tick={{ fontSize: 10 }} />
                      <Tooltip
                        labelFormatter={date => String(date)}
                        formatter={value => [
                          `${analysisCurrency} ${formatAmount(Number(value), analysisCurrency)}`,
                          lang === "zh" ? "已記帳" : "Recorded",
                        ]}
                      />
                      <Bar
                        dataKey="value"
                        fill="var(--primary)"
                        radius={[5, 5, 0, 0]}
                        maxBarSize={42}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="rounded-xl bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                  {lang === "zh"
                    ? "此貨幣暫無有效日期的開支"
                    : "No dated expenses in this currency"}
                </p>
              )}
              <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-4">
                <h4 className="text-sm font-semibold">
                  {lang === "zh" ? "支出分佈" : "Spending distribution"}
                </h4>
                <div className="flex overflow-hidden rounded-lg border border-border text-xs">
                  <button
                    onClick={() => setChartView("category")}
                    className={`px-3 py-2 ${chartView === "category" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    {lang === "zh" ? "類別" : "Category"}
                  </button>
                  <button
                    onClick={() => setChartView("payer")}
                    className={`border-l border-border px-3 py-2 ${chartView === "payer" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    {lang === "zh" ? "付款人" : "Payer"}
                  </button>
                </div>
              </div>
              {stats.total > 0 &&
              !(
                chartView === "category" ? stats.byCategory : stats.byPayer
              ).some(entry => entry.value < 0) ? (
                <div className="mt-3 grid min-w-0 grid-cols-1 items-center gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={
                            chartView === "category"
                              ? stats.byCategory
                              : stats.byPayer
                          }
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                          stroke="none"
                        >
                          {(chartView === "category"
                            ? stats.byCategory
                            : stats.byPayer
                          ).map((entry, index) => (
                            <Cell
                              key={entry.name}
                              fill={
                                "color" in entry
                                  ? String(entry.color)
                                  : [
                                      "#0f766e",
                                      "#173d4c",
                                      "#8cbcb0",
                                      "#d5b985",
                                      "#748c94",
                                      "#b7cec5",
                                    ][index % 6]
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={value => [
                            `${analysisCurrency} ${formatAmount(Number(value), analysisCurrency)}`,
                            "",
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {(chartView === "category"
                      ? stats.byCategory
                      : stats.byPayer
                    ).map((entry, index) => (
                      <div
                        key={entry.name}
                        className="flex items-start gap-2 rounded-xl bg-muted/30 p-2.5 text-xs"
                      >
                        <span
                          className="mt-1 h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background:
                              "color" in entry
                                ? String(entry.color)
                                : [
                                    "#0f766e",
                                    "#173d4c",
                                    "#8cbcb0",
                                    "#d5b985",
                                    "#748c94",
                                    "#b7cec5",
                                  ][index % 6],
                          }}
                        />
                        <span className="min-w-0 flex-1 break-words">
                          {entry.name}
                        </span>
                        <div className="max-w-[55%] break-words text-right tabular-nums">
                          <p className="font-semibold">
                            {analysisCurrency}{" "}
                            {formatAmount(entry.value, analysisCurrency)}
                          </p>
                          <p className="mt-0.5 text-muted-foreground">
                            {((entry.value / stats.total) * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-muted/40 p-5 text-center text-sm text-muted-foreground">
                  {lang === "zh"
                    ? "此貨幣包含負數結餘或沒有正數支出，暫不顯示占比圖；退款仍包含在每日與總額分析。"
                    : "Negative balances or no positive spending: share chart withheld. Refunds remain included in daily and total analysis."}
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* Viewer read-only banner */}
      {!canEdit && trip && (
        <div className="mb-4 px-3 py-2 border rounded-lg flex items-center gap-2 text-xs bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>
            {lang === "zh"
              ? "只讀模式：您是此行程的檢視者，無法新增或編輯費用"
              : "Read-only: you are a viewer of this trip and cannot add or edit expenses"}
          </span>
        </div>
      )}

      {/* Active filter notice */}
      {isFiltered && (
        <div className="mb-4 px-3 py-2 border rounded-lg flex items-center gap-2 text-xs bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
          <CalendarRange className="w-3.5 h-3.5 shrink-0" />
          <span>
            {lang === "zh"
              ? `篩選中：${filterStart || "最早"} 至 ${filterEnd || "最新"} · 顯示 ${filteredExpenses.length} / ${expenses?.length ?? 0} 筆`
              : `Filtered: ${filterStart || "earliest"} to ${filterEnd || "latest"} · showing ${filteredExpenses.length} / ${expenses?.length ?? 0}`}
          </span>
          <button
            onClick={() => {
              setFilterStart("");
              setFilterEnd("");
            }}
            className="ml-auto hover:opacity-70"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="voyage-eyebrow">
            {lang === "zh" ? "每一筆旅程記錄" : "The details of your journey"}
          </p>
          <h3 className="voyage-section-title mt-1">
            {lang === "zh" ? "開支明細" : "Expense ledger"}
          </h3>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {lang === "zh"
            ? "表格可左右滑動 · 點選欄位編輯"
            : "Swipe table horizontally · tap a cell to edit"}
        </p>
      </div>
      {/* Inline-editable expense table */}
      {(!filteredExpenses || filteredExpenses.length === 0) &&
      pendingRows.length === 0 ? (
        <div className="voyage-panel text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <DollarSign className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">
            {lang === "zh" ? "還沒有費用記錄" : "No expenses yet"}
          </p>
          {canEdit && (
            <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
              <button
                onClick={addNewRow}
                className="text-primary hover:underline text-sm"
              >
                + {lang === "zh" ? "新增第一筆費用" : "Add first expense"}
              </button>
              <span className="text-muted-foreground text-xs">
                {lang === "zh" ? "或" : "or"}
              </span>
              <button
                onClick={() => setShowImport(true)}
                className="text-primary hover:underline text-sm flex items-center gap-1"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                {lang === "zh" ? "貼上 CSV 數據" : "Paste CSV data"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label={
              lang === "zh"
                ? "開支明細，可橫向捲動"
                : "Expense ledger, scroll horizontally"
            }
          >
            <table className="w-full min-w-[760px] text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {lang === "zh" ? "日期" : "Date"}
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                    {lang === "zh" ? "名稱" : "Name"}
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {lang === "zh" ? "類別" : "Category"}
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {lang === "zh" ? "貨幣" : "Currency"}
                  </th>
                  <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {lang === "zh" ? "金額" : "Amount"}
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {lang === "zh" ? "付款人" : "Payer"}
                  </th>
                  <th
                    className="px-2 py-2 text-center text-xs font-medium text-muted-foreground whitespace-nowrap w-10"
                    title={lang === "zh" ? "收據" : "Receipt"}
                  >
                    <ImageIcon className="w-3.5 h-3.5 mx-auto" />
                  </th>
                  <th className="px-2 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((expense, rowIdx) => (
                  <tr
                    key={expense.id}
                    className={`border-b border-border last:border-0 group transition-colors ${
                      editingCell?.rowIdx === rowIdx
                        ? "bg-accent/30"
                        : "hover:bg-muted/30"
                    }`}
                  >
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
                            <img
                              src={expense.receiptUrl}
                              alt={lang === "zh" ? "收據" : "Receipt"}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                              <ZoomIn className="w-3 h-3 text-white" />
                            </div>
                          </button>
                        ) : canEdit ? (
                          <button
                            onClick={() => {
                              pendingUploadExpenseId.current = expense.id;
                              fileInputRef.current?.click();
                            }}
                            disabled={
                              uploadingReceiptId !== null ||
                              analyzeReceipt.isPending
                            }
                            className="w-8 h-8 rounded border border-dashed border-border hover:border-primary hover:text-primary text-muted-foreground transition-colors inline-flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                            title={
                              lang === "zh" ? "上傳收據" : "Upload receipt"
                            }
                          >
                            {uploadingReceiptId === expense.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Camera className="w-3 h-3" />
                            )}
                          </button>
                        ) : null}
                        {/* AI analyzing spinner overlay */}
                        {analyzingReceiptId === expense.id && (
                          <div
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center"
                            title={
                              lang === "zh" ? "AI 辨識中…" : "AI analysing…"
                            }
                          >
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
                    <tr
                      key={`new-${pIdx}`}
                      className="border-b border-border last:border-0 bg-primary/5"
                    >
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
              <button
                onClick={addNewRow}
                disabled={addExpense.isPending || pendingRows.length > 0}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {lang === "zh" ? "新增一行" : "Add Row"}
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
              <span className="text-white/80 text-sm font-medium">
                {lang === "zh" ? "收據照片" : "Receipt"}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <Download className="w-3.5 h-3.5" />
                  {lang === "zh" ? "下載" : "Download"}
                </a>
                {canEdit && (
                  <button
                    disabled={removeReceipt.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-xs transition-colors"
                    onClick={() => {
                      const exp = filteredExpenses?.find(
                        e => e.receiptUrl === lightboxUrl
                      );
                      if (exp) {
                        removeReceipt.mutate({ expenseId: exp.id, tripId });
                        setLightboxUrl(null);
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {lang === "zh" ? "刪除收據" : "Remove Receipt"}
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
      <Dialog
        open={!!ocrDialog}
        onOpenChange={o => {
          if (!o) setOcrDialog(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />{" "}
              {lang === "zh" ? "AI 收據辨識結果" : "AI Receipt Analysis"}
            </DialogTitle>
          </DialogHeader>
          {ocrDialog && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {lang === "zh"
                  ? "AI 已從收據中擷取以下資訊，請確認或修改後點「套用」。"
                  : "AI extracted the following from your receipt. Review and edit before applying."}
                {ocrDialog.confidence < 0.6 && (
                  <span className="ml-1 text-amber-500">
                    {lang === "zh"
                      ? "（信心度較低，請仔細核對）"
                      : "(Low confidence — please verify)"}
                  </span>
                )}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">
                    {lang === "zh" ? "商家名稱" : "Merchant"}
                  </Label>
                  <Input
                    className="h-8 text-sm mt-1"
                    value={ocrDialog.title}
                    onChange={e =>
                      setOcrDialog(d =>
                        d ? { ...d, title: e.target.value } : d
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    {lang === "zh" ? "金額" : "Amount"}
                  </Label>
                  <Input
                    className="h-8 text-sm mt-1"
                    value={ocrDialog.amount}
                    onChange={e =>
                      setOcrDialog(d =>
                        d ? { ...d, amount: e.target.value } : d
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    {lang === "zh" ? "貨幣" : "Currency"}
                  </Label>
                  <Select
                    value={ocrDialog.currency || ""}
                    onValueChange={v =>
                      setOcrDialog(d => (d ? { ...d, currency: v } : d))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue
                        placeholder={
                          lang === "zh" ? "選擇貨幣" : "Select currency"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">
                    {lang === "zh" ? "日期" : "Date"}
                  </Label>
                  <Input
                    type="date"
                    className="h-8 text-sm mt-1"
                    value={ocrDialog.date}
                    onChange={e =>
                      setOcrDialog(d =>
                        d ? { ...d, date: e.target.value } : d
                      )
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">
                    {lang === "zh" ? "類別" : "Category"}
                  </Label>
                  <Select
                    value={ocrDialog.category}
                    onValueChange={v =>
                      setOcrDialog(d =>
                        d ? { ...d, category: v as typeof d.category } : d
                      )
                    }
                  >
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATS.map(c => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
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
                    if (!ocrDialog || updateExpense.isPending || !canEdit)
                      return;
                    if (
                      ocrDialog.amount &&
                      validExpenseAmount(ocrDialog.amount, true) === null
                    ) {
                      toast.error(
                        lang === "zh"
                          ? "請核實收據金額"
                          : "Check the receipt amount"
                      );
                      return;
                    }
                    if (ocrDialog.date && !normalizeDateOnly(ocrDialog.date)) {
                      toast.error(
                        lang === "zh"
                          ? "請核實收據日期"
                          : "Check the receipt date"
                      );
                      return;
                    }
                    const updates: Record<string, string> = {};
                    if (ocrDialog.title) updates.title = ocrDialog.title;
                    if (ocrDialog.amount) updates.amount = ocrDialog.amount;
                    if (ocrDialog.currency)
                      updates.currency = ocrDialog.currency;
                    if (ocrDialog.date) updates.date = ocrDialog.date;
                    if (ocrDialog.category)
                      updates.category = ocrDialog.category;
                    updateExpense.mutate(
                      {
                        expenseId: ocrDialog.expenseId,
                        tripId,
                        ...updates,
                      } as any,
                      {
                        onSuccess: () => {
                          setOcrDialog(null);
                          toast.success(
                            lang === "zh" ? "資訊已套用" : "Information applied"
                          );
                        },
                      }
                    );
                  }}
                >
                  {updateExpense.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : lang === "zh" ? (
                    "套用"
                  ) : (
                    "Apply"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Click outside overlays */}
      {showCurrencyPicker && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowCurrencyPicker(false)}
        />
      )}
      {showDateFilter && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDateFilter(false)}
        />
      )}

      {/* CSV Import Dialog */}
      <Dialog
        open={showImport}
        onOpenChange={o => {
          if (bulkAdd.isPending) return;
          if (!o) {
            setShowImport(false);
            setImportParsed(false);
            setCsvText("");
            setParsedRows([]);
          }
        }}
      >
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
                <p className="font-medium text-foreground">
                  {lang === "zh" ? "支援格式：" : "Supported formats:"}
                </p>
                <p>
                  •{" "}
                  {lang === "zh"
                    ? "從 Excel / Google Sheets 直接複製貼上（Tab 分隔）"
                    : "Copy-paste from Excel / Google Sheets (tab-separated)"}
                </p>
                <p>
                  •{" "}
                  {lang === "zh"
                    ? "CSV 格式（逗號分隔）"
                    : "CSV format (comma-separated)"}
                </p>
                <p>
                  •{" "}
                  {lang === "zh"
                    ? "欄位順序：日期、名稱、金額、貨幣、類別、付款人、備注"
                    : "Column order: date, name, amount, currency, category, payer, notes"}
                </p>
                <p>
                  •{" "}
                  {lang === "zh"
                    ? "如有標題行，系統會自動識別欄位"
                    : "Header row is auto-detected"}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={csvHasHeader}
                  onChange={e => setCsvHasHeader(e.target.checked)}
                  className="rounded"
                />
                {lang === "zh" ? "第一行是標題行" : "First row is header"}
              </label>
              <Textarea
                placeholder={
                  lang === "zh"
                    ? "貼上試算表數據，例如：\n2025-01-15\t午餐\t250\tHKD\t餐飲\t張三\n2025-01-16\t地鐵\t50\tHKD\t交通\t李四"
                    : "Paste spreadsheet data, e.g.:\n2025-01-15\tLunch\t250\tHKD\tFood\tAlice\n2025-01-16\tMTR\t50\tHKD\tTransport\tBob"
                }
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowImport(false)}
                >
                  {lang === "zh" ? "取消" : "Cancel"}
                </Button>
                <Button className="flex-1" onClick={handleParseCsv}>
                  {lang === "zh" ? "解析預覽" : "Preview"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <div
                className={`px-3 py-2 rounded-lg text-xs ${
                  validImportCount > 0
                    ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                    : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
                }`}
              >
                {lang === "zh"
                  ? `解析完成：${validImportCount} 筆有效 · ${parsedRows.length - validImportCount} 筆錯誤`
                  : `Parsed: ${validImportCount} valid · ${parsedRows.length - validImportCount} errors`}
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                        {lang === "zh" ? "狀態" : "Status"}
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                        {lang === "zh" ? "日期" : "Date"}
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                        {lang === "zh" ? "名稱" : "Name"}
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                        {lang === "zh" ? "類別" : "Category"}
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                        {lang === "zh" ? "金額" : "Amount"}
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                        {lang === "zh" ? "付款人" : "Payer"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, i) => {
                      const cat = CATS.find(c => c.value === row.category);
                      return (
                        <tr
                          key={i}
                          className={`border-b border-border last:border-0 ${row._error ? "bg-red-50/50 dark:bg-red-950/20" : ""}`}
                        >
                          <td className="px-2 py-1.5">
                            {row._error ? (
                              <span className="text-red-500 text-[10px]">
                                {row._error === "title"
                                  ? lang === "zh"
                                    ? "缺少名稱"
                                    : "Missing name"
                                  : row._error === "amount"
                                    ? lang === "zh"
                                      ? "金額無效"
                                      : "Invalid amount"
                                    : row._error === "currency"
                                      ? lang === "zh"
                                        ? "貨幣無效"
                                        : "Invalid currency"
                                      : lang === "zh"
                                        ? "日期無效"
                                        : "Invalid date"}
                              </span>
                            ) : (
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">
                            {row.date}
                          </td>
                          <td className="px-2 py-1.5 font-medium text-foreground">
                            {row.title || "—"}
                          </td>
                          <td className="px-2 py-1.5">
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                background: `${cat?.color}20`,
                                color: cat?.color,
                              }}
                            >
                              {cat?.label ?? (lang === "zh" ? "其他" : "Other")}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold">
                            {row.currency} {row.amount}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">
                            {row.paidByName || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={bulkAdd.isPending}
                  onClick={() => setImportParsed(false)}
                >
                  {lang === "zh" ? "返回修改" : "Back"}
                </Button>
                <Button
                  className="flex-1"
                  disabled={validImportCount === 0 || bulkAdd.isPending}
                  onClick={handleConfirmImport}
                >
                  {bulkAdd.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      {lang === "zh" ? "匯入中…" : "Importing…"}
                    </>
                  ) : lang === "zh" ? (
                    `確認匯入 ${validImportCount} 筆`
                  ) : (
                    `Import ${validImportCount} rows`
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
