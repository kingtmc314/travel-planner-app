import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Plus, Trash2, Loader2, DollarSign, TrendingUp, Users, Edit2 } from "lucide-react";
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
      date: expense.date instanceof Date
        ? expense.date.toISOString().split("T")[0]
        : String(expense.date ?? "").split("T")[0],
      notes: expense.notes ?? "",
    });
  };

  // Stats
  const stats = useMemo(() => {
    if (!expenses) return { total: 0, byCategory: [], byPayer: [] };
    const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount as string), 0);
    const byCat: Record<string, number> = {};
    const byPayer: Record<string, number> = {};
    expenses.forEach(e => {
      const cat = CATEGORIES.find(c => c.value === e.category);
      byCat[cat?.label ?? "其他"] = (byCat[cat?.label ?? "其他"] ?? 0) + parseFloat(e.amount as string);
      const payer = e.paidByName ?? "未知";
      byPayer[payer] = (byPayer[payer] ?? 0) + parseFloat(e.amount as string);
    });
    return {
      total,
      byCategory: Object.entries(byCat).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100, color: CATEGORIES.find(c => c.label === name)?.color ?? "#94a3b8" })),
      byPayer: Object.entries(byPayer).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })),
    };
  }, [expenses]);

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">費用記帳</h2>
          <p className="text-muted-foreground text-sm mt-0.5">基本貨幣：{trip?.baseCurrency}</p>
        </div>
        <Button onClick={() => { setShowAdd(true); setForm(emptyForm(trip?.baseCurrency ?? "HKD")); }} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />新增費用
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { icon: DollarSign, label: "總費用", value: `${trip?.baseCurrency} ${stats.total.toLocaleString()}`, color: "text-blue-500 bg-blue-50" },
          { icon: TrendingUp, label: "筆數", value: `${expenses?.length ?? 0} 筆`, color: "text-green-500 bg-green-50" },
          { icon: Users, label: "付款人", value: `${stats.byPayer.length} 人`, color: "text-purple-500 bg-purple-50" },
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
                <Tooltip formatter={(v: any) => [`${trip?.baseCurrency} ${v.toLocaleString()}`, ""]} />
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
                <Tooltip formatter={(v: any) => [`${trip?.baseCurrency} ${v.toLocaleString()}`, "支出"]} />
                <Bar dataKey="value" fill="oklch(0.42 0.12 255)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Expense list */}
      {!expenses || expenses.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <DollarSign className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">還沒有費用記錄</p>
          <button onClick={() => setShowAdd(true)} className="text-primary hover:underline mt-2 text-sm">+ 新增第一筆費用</button>
        </div>
      ) : (
        <div className="space-y-3">
          {expenses.map(expense => {
            const cat = CATEGORIES.find(c => c.value === expense.category);
            return (
              <div key={expense.id} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{background:`${cat?.color}20`, color: cat?.color}}>
                  <DollarSign className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground text-sm">{expense.title}</p>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{background:`${cat?.color}20`, color: cat?.color}}>{cat?.label}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span>{expense.date instanceof Date ? expense.date.toLocaleDateString() : String(expense.date)}</span>
                    {expense.paidByName && <><span>·</span><span>由 {expense.paidByName} 付款</span></>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-foreground">{expense.currency} {parseFloat(expense.amount as string).toLocaleString()}</p>
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
    </div>
  );
}
