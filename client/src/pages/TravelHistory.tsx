import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Plus, Trash2, Loader2, MapPin, CheckCircle, Heart, Calendar, Edit2 } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

// Comprehensive list of countries with ISO codes and regions
const COUNTRIES = [
  { code: "AF", name: "Afghanistan", region: "Asia" },
  { code: "AL", name: "Albania", region: "Europe" },
  { code: "DZ", name: "Algeria", region: "Africa" },
  { code: "AD", name: "Andorra", region: "Europe" },
  { code: "AO", name: "Angola", region: "Africa" },
  { code: "AR", name: "Argentina", region: "South America" },
  { code: "AM", name: "Armenia", region: "Asia" },
  { code: "AU", name: "Australia", region: "Oceania" },
  { code: "AT", name: "Austria", region: "Europe" },
  { code: "AZ", name: "Azerbaijan", region: "Asia" },
  { code: "BS", name: "Bahamas", region: "North America" },
  { code: "BH", name: "Bahrain", region: "Asia" },
  { code: "BD", name: "Bangladesh", region: "Asia" },
  { code: "BY", name: "Belarus", region: "Europe" },
  { code: "BE", name: "Belgium", region: "Europe" },
  { code: "BZ", name: "Belize", region: "North America" },
  { code: "BJ", name: "Benin", region: "Africa" },
  { code: "BT", name: "Bhutan", region: "Asia" },
  { code: "BO", name: "Bolivia", region: "South America" },
  { code: "BA", name: "Bosnia and Herzegovina", region: "Europe" },
  { code: "BW", name: "Botswana", region: "Africa" },
  { code: "BR", name: "Brazil", region: "South America" },
  { code: "BN", name: "Brunei", region: "Asia" },
  { code: "BG", name: "Bulgaria", region: "Europe" },
  { code: "BF", name: "Burkina Faso", region: "Africa" },
  { code: "BI", name: "Burundi", region: "Africa" },
  { code: "KH", name: "Cambodia", region: "Asia" },
  { code: "CM", name: "Cameroon", region: "Africa" },
  { code: "CA", name: "Canada", region: "North America" },
  { code: "CV", name: "Cape Verde", region: "Africa" },
  { code: "CF", name: "Central African Republic", region: "Africa" },
  { code: "TD", name: "Chad", region: "Africa" },
  { code: "CL", name: "Chile", region: "South America" },
  { code: "CN", name: "China", region: "Asia" },
  { code: "CO", name: "Colombia", region: "South America" },
  { code: "KM", name: "Comoros", region: "Africa" },
  { code: "CG", name: "Congo", region: "Africa" },
  { code: "CR", name: "Costa Rica", region: "North America" },
  { code: "HR", name: "Croatia", region: "Europe" },
  { code: "CU", name: "Cuba", region: "North America" },
  { code: "CY", name: "Cyprus", region: "Europe" },
  { code: "CZ", name: "Czech Republic", region: "Europe" },
  { code: "DK", name: "Denmark", region: "Europe" },
  { code: "DJ", name: "Djibouti", region: "Africa" },
  { code: "DO", name: "Dominican Republic", region: "North America" },
  { code: "EC", name: "Ecuador", region: "South America" },
  { code: "EG", name: "Egypt", region: "Africa" },
  { code: "SV", name: "El Salvador", region: "North America" },
  { code: "GQ", name: "Equatorial Guinea", region: "Africa" },
  { code: "ER", name: "Eritrea", region: "Africa" },
  { code: "EE", name: "Estonia", region: "Europe" },
  { code: "ET", name: "Ethiopia", region: "Africa" },
  { code: "FJ", name: "Fiji", region: "Oceania" },
  { code: "FI", name: "Finland", region: "Europe" },
  { code: "FR", name: "France", region: "Europe" },
  { code: "GA", name: "Gabon", region: "Africa" },
  { code: "GM", name: "Gambia", region: "Africa" },
  { code: "GE", name: "Georgia", region: "Asia" },
  { code: "DE", name: "Germany", region: "Europe" },
  { code: "GH", name: "Ghana", region: "Africa" },
  { code: "GR", name: "Greece", region: "Europe" },
  { code: "GT", name: "Guatemala", region: "North America" },
  { code: "GN", name: "Guinea", region: "Africa" },
  { code: "GW", name: "Guinea-Bissau", region: "Africa" },
  { code: "GY", name: "Guyana", region: "South America" },
  { code: "HT", name: "Haiti", region: "North America" },
  { code: "HN", name: "Honduras", region: "North America" },
  { code: "HU", name: "Hungary", region: "Europe" },
  { code: "IS", name: "Iceland", region: "Europe" },
  { code: "IN", name: "India", region: "Asia" },
  { code: "ID", name: "Indonesia", region: "Asia" },
  { code: "IR", name: "Iran", region: "Asia" },
  { code: "IQ", name: "Iraq", region: "Asia" },
  { code: "IE", name: "Ireland", region: "Europe" },
  { code: "IL", name: "Israel", region: "Asia" },
  { code: "IT", name: "Italy", region: "Europe" },
  { code: "JM", name: "Jamaica", region: "North America" },
  { code: "JP", name: "Japan", region: "Asia" },
  { code: "JO", name: "Jordan", region: "Asia" },
  { code: "KZ", name: "Kazakhstan", region: "Asia" },
  { code: "KE", name: "Kenya", region: "Africa" },
  { code: "KP", name: "North Korea", region: "Asia" },
  { code: "KR", name: "South Korea", region: "Asia" },
  { code: "KW", name: "Kuwait", region: "Asia" },
  { code: "KG", name: "Kyrgyzstan", region: "Asia" },
  { code: "LA", name: "Laos", region: "Asia" },
  { code: "LV", name: "Latvia", region: "Europe" },
  { code: "LB", name: "Lebanon", region: "Asia" },
  { code: "LS", name: "Lesotho", region: "Africa" },
  { code: "LR", name: "Liberia", region: "Africa" },
  { code: "LY", name: "Libya", region: "Africa" },
  { code: "LI", name: "Liechtenstein", region: "Europe" },
  { code: "LT", name: "Lithuania", region: "Europe" },
  { code: "LU", name: "Luxembourg", region: "Europe" },
  { code: "MG", name: "Madagascar", region: "Africa" },
  { code: "MW", name: "Malawi", region: "Africa" },
  { code: "MY", name: "Malaysia", region: "Asia" },
  { code: "MV", name: "Maldives", region: "Asia" },
  { code: "ML", name: "Mali", region: "Africa" },
  { code: "MT", name: "Malta", region: "Europe" },
  { code: "MR", name: "Mauritania", region: "Africa" },
  { code: "MU", name: "Mauritius", region: "Africa" },
  { code: "MX", name: "Mexico", region: "North America" },
  { code: "MD", name: "Moldova", region: "Europe" },
  { code: "MC", name: "Monaco", region: "Europe" },
  { code: "MN", name: "Mongolia", region: "Asia" },
  { code: "ME", name: "Montenegro", region: "Europe" },
  { code: "MA", name: "Morocco", region: "Africa" },
  { code: "MZ", name: "Mozambique", region: "Africa" },
  { code: "MM", name: "Myanmar", region: "Asia" },
  { code: "NA", name: "Namibia", region: "Africa" },
  { code: "NP", name: "Nepal", region: "Asia" },
  { code: "NL", name: "Netherlands", region: "Europe" },
  { code: "NZ", name: "New Zealand", region: "Oceania" },
  { code: "NI", name: "Nicaragua", region: "North America" },
  { code: "NE", name: "Niger", region: "Africa" },
  { code: "NG", name: "Nigeria", region: "Africa" },
  { code: "MK", name: "North Macedonia", region: "Europe" },
  { code: "NO", name: "Norway", region: "Europe" },
  { code: "OM", name: "Oman", region: "Asia" },
  { code: "PK", name: "Pakistan", region: "Asia" },
  { code: "PA", name: "Panama", region: "North America" },
  { code: "PG", name: "Papua New Guinea", region: "Oceania" },
  { code: "PY", name: "Paraguay", region: "South America" },
  { code: "PE", name: "Peru", region: "South America" },
  { code: "PH", name: "Philippines", region: "Asia" },
  { code: "PL", name: "Poland", region: "Europe" },
  { code: "PT", name: "Portugal", region: "Europe" },
  { code: "QA", name: "Qatar", region: "Asia" },
  { code: "RO", name: "Romania", region: "Europe" },
  { code: "RU", name: "Russia", region: "Europe" },
  { code: "RW", name: "Rwanda", region: "Africa" },
  { code: "SA", name: "Saudi Arabia", region: "Asia" },
  { code: "SN", name: "Senegal", region: "Africa" },
  { code: "RS", name: "Serbia", region: "Europe" },
  { code: "SL", name: "Sierra Leone", region: "Africa" },
  { code: "SG", name: "Singapore", region: "Asia" },
  { code: "SK", name: "Slovakia", region: "Europe" },
  { code: "SI", name: "Slovenia", region: "Europe" },
  { code: "SO", name: "Somalia", region: "Africa" },
  { code: "ZA", name: "South Africa", region: "Africa" },
  { code: "SS", name: "South Sudan", region: "Africa" },
  { code: "ES", name: "Spain", region: "Europe" },
  { code: "LK", name: "Sri Lanka", region: "Asia" },
  { code: "SD", name: "Sudan", region: "Africa" },
  { code: "SR", name: "Suriname", region: "South America" },
  { code: "SZ", name: "Swaziland", region: "Africa" },
  { code: "SE", name: "Sweden", region: "Europe" },
  { code: "CH", name: "Switzerland", region: "Europe" },
  { code: "SY", name: "Syria", region: "Asia" },
  { code: "TW", name: "Taiwan", region: "Asia" },
  { code: "TJ", name: "Tajikistan", region: "Asia" },
  { code: "TZ", name: "Tanzania", region: "Africa" },
  { code: "TH", name: "Thailand", region: "Asia" },
  { code: "TL", name: "Timor-Leste", region: "Asia" },
  { code: "TG", name: "Togo", region: "Africa" },
  { code: "TT", name: "Trinidad and Tobago", region: "North America" },
  { code: "TN", name: "Tunisia", region: "Africa" },
  { code: "TR", name: "Turkey", region: "Asia" },
  { code: "TM", name: "Turkmenistan", region: "Asia" },
  { code: "UG", name: "Uganda", region: "Africa" },
  { code: "UA", name: "Ukraine", region: "Europe" },
  { code: "AE", name: "United Arab Emirates", region: "Asia" },
  { code: "GB", name: "United Kingdom", region: "Europe" },
  { code: "US", name: "United States", region: "North America" },
  { code: "UY", name: "Uruguay", region: "South America" },
  { code: "UZ", name: "Uzbekistan", region: "Asia" },
  { code: "VE", name: "Venezuela", region: "South America" },
  { code: "VN", name: "Vietnam", region: "Asia" },
  { code: "YE", name: "Yemen", region: "Asia" },
  { code: "ZM", name: "Zambia", region: "Africa" },
  { code: "ZW", name: "Zimbabwe", region: "Africa" },
  { code: "HK", name: "Hong Kong", region: "Asia" },
  { code: "MO", name: "Macau", region: "Asia" },
];

const STATUS_CONFIG = {
  visited: { label: "已到訪", color: "bg-indigo-500", textColor: "text-indigo-600", icon: CheckCircle, mapColor: "#6366f1" },
  planned: { label: "計劃前往", color: "bg-violet-400", textColor: "text-violet-600", icon: Calendar, mapColor: "#a78bfa" },
  wishlist: { label: "心願清單", color: "bg-pink-400", textColor: "text-pink-600", icon: Heart, mapColor: "#f472b6" },
};

const REGIONS = ["全部", "Asia", "Europe", "Africa", "North America", "South America", "Oceania"];

const TOTAL_COUNTRIES = 203;

export default function TravelHistory() {
  const { data: countries, refetch, isLoading } = trpc.travelHistory.getCountries.useQuery();
  const upsertCountry = trpc.travelHistory.upsertCountry.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("已新增"); } });
  const removeCountry = trpc.travelHistory.removeCountry.useMutation({ onSuccess: () => { refetch(); toast.success("已移除"); } });
  const updateStatus = trpc.travelHistory.upsertCountry.useMutation({ onSuccess: () => { refetch(); toast.success("已更新"); } });

  const [showAdd, setShowAdd] = useState(false);
  const [editingCountry, setEditingCountry] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ status: "visited" as "visited" | "planned" | "wishlist", visitedYear: "", notes: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "visited" | "planned" | "wishlist">("all");
  const [filterRegion, setFilterRegion] = useState("全部");
  const [addForm, setAddForm] = useState({ countryCode: "", countryName: "", status: "visited" as "visited" | "planned" | "wishlist", visitedYear: "" });
  const [activeTab, setActiveTab] = useState<"map" | "list">("map");

  const countryMap = useMemo(() => {
    const m: Record<string, { status: string; visitedYear?: number | null }> = {};
    countries?.forEach(c => { m[c.countryCode] = { status: c.status, visitedYear: c.visitedAt ? new Date(c.visitedAt).getFullYear() : null }; });
    return m;
  }, [countries]);

  const visitedCount = countries?.filter(c => c.status === "visited").length ?? 0;
  const plannedCount = countries?.filter(c => c.status === "planned").length ?? 0;
  const wishlistCount = countries?.filter(c => c.status === "wishlist").length ?? 0;

  const filteredCountries = useMemo(() => {
    return (countries ?? []).filter(c => {
      const matchStatus = filterStatus === "all" || c.status === filterStatus;
      const country = COUNTRIES.find(x => x.code === c.countryCode);
      const matchRegion = filterRegion === "全部" || country?.region === filterRegion;
      const matchSearch = !search || c.countryName.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchRegion && matchSearch;
    });
  }, [countries, filterStatus, filterRegion, search]);

  const availableToAdd = COUNTRIES.filter(c => !countryMap[c.code]);

  const openEditCountry = (c: any) => {
    setEditingCountry(c);
    setEditForm({
      status: c.status,
      visitedYear: c.visitedAt ? String(new Date(c.visitedAt as Date).getFullYear()) : "",
      notes: c.notes ?? "",
    });
  };

  const handleEditCountry = () => {
    if (!editingCountry) return;
    updateStatus.mutate({
      countryCode: editingCountry.countryCode,
      countryName: editingCountry.countryName,
      status: editForm.status,
      visitedAt: editForm.visitedYear ? `${editForm.visitedYear}-01-01` : undefined,
      notes: editForm.notes || undefined,
    }, { onSuccess: () => { setEditingCountry(null); refetch(); toast.success("已更新"); } });
  };

  const handleAdd = () => {
    if (!addForm.countryCode) { toast.error("請選擇國家"); return; }
    const country = COUNTRIES.find(c => c.code === addForm.countryCode);
    upsertCountry.mutate({
      countryCode: addForm.countryCode,
      countryName: country?.name ?? addForm.countryCode,
      status: addForm.status,
      visitedAt: addForm.visitedYear ? `${addForm.visitedYear}-01-01` : undefined,
    });
  };

  return (
    <AppLayout>
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-foreground text-lg leading-tight">旅遊足跡</h1>
              <p className="text-muted-foreground text-xs">{visitedCount}/{TOTAL_COUNTRIES} 個國家</p>
            </div>
          </div>
          <Button onClick={() => setShowAdd(true)} size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4" />
            新增
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {(Object.entries(STATUS_CONFIG) as [string, typeof STATUS_CONFIG["visited"]][]).map(([key, cfg]) => {
            const count = key === "visited" ? visitedCount : key === "planned" ? plannedCount : wishlistCount;
            const Icon = cfg.icon;
            return (
              <button
                key={key}
                onClick={() => setFilterStatus(filterStatus === key ? "all" : key as any)}
                className={`bg-card rounded-2xl border p-4 text-left transition-all ${filterStatus === key ? "border-indigo-300 shadow-md" : "border-border hover:border-indigo-200"}`}
              >
                <div className={`w-8 h-8 rounded-full ${cfg.color} flex items-center justify-center mb-2`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <p className="text-2xl font-bold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{cfg.label}</p>
              </button>
            );
          })}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="mb-6">
          <TabsList>
            <TabsTrigger value="map" className="gap-2"><Globe className="w-4 h-4" />地圖</TabsTrigger>
            <TabsTrigger value="list" className="gap-2"><MapPin className="w-4 h-4" />清單</TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === "map" ? (
          /* World Map View */
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">世界地圖</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {(Object.entries(STATUS_CONFIG) as [string, typeof STATUS_CONFIG["visited"]][]).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cfg.mapColor }} />
                    <span>{cfg.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
                  <span>未到訪</span>
                </div>
              </div>
            </div>
            <WorldMapSVG countryMap={countryMap} />
          </div>
        ) : (
          /* List View */
          <div>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Input
                placeholder="搜尋國家..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1"
              />
              <Select value={filterRegion} onValueChange={setFilterRegion}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : filteredCountries.length === 0 ? (
              <div className="text-center py-20">
                <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">還沒有記錄</p>
                <button onClick={() => setShowAdd(true)} className="text-indigo-600 hover:underline mt-2 text-sm">+ 新增第一個國家</button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCountries.map(c => {
                  const cfg = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG];
                  const Icon = cfg?.icon ?? CheckCircle;
                  const country = COUNTRIES.find(x => x.code === c.countryCode);
                  return (
                    <div key={c.id} className="bg-card rounded-xl border border-border p-3 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${cfg?.color ?? "bg-muted"} flex items-center justify-center shrink-0`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground text-sm">{c.countryName}</p>
                          {c.visitedAt && <span className="text-xs text-muted-foreground">{new Date(c.visitedAt as Date).getFullYear()}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{country?.region ?? ""}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={c.status}
                          onValueChange={v => updateStatus.mutate({ countryCode: c.countryCode, countryName: c.countryName, status: v as any })}
                        >
                          <SelectTrigger className={`h-7 text-xs px-2 border-0 ${cfg?.color ?? "bg-muted"} text-white`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => openEditCountry(c)}
                          className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => removeCountry.mutate({ countryCode: c.countryCode })}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Country Dialog */}
      <Dialog open={!!editingCountry} onOpenChange={(o) => !o && setEditingCountry(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>修改 {editingCountry?.countryName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-foreground">狀態</label>
              <Select value={editForm.status} onValueChange={v => setEditForm({ ...editForm, status: v as any })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">到訪年份（選填）</label>
              <Input className="mt-1.5" type="number" placeholder="例：2024" value={editForm.visitedYear} onChange={e => setEditForm({ ...editForm, visitedYear: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">備注（選填）</label>
              <Input className="mt-1.5" placeholder="備注..." value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleEditCountry} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              儲存變更
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Country Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增國家</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-foreground">國家 *</label>
              <Select value={addForm.countryCode} onValueChange={v => setAddForm({ ...addForm, countryCode: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="選擇國家" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {availableToAdd.map(c => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name} ({c.region})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">狀態</label>
              <Select value={addForm.status} onValueChange={v => setAddForm({ ...addForm, status: v as any })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {addForm.status === "visited" && (
              <div>
                <label className="text-sm font-medium text-foreground">到訪年份（選填）</label>
                <Input
                  className="mt-1.5"
                  type="number"
                  placeholder="例：2024"
                  value={addForm.visitedYear}
                  onChange={e => setAddForm({ ...addForm, visitedYear: e.target.value })}
                />
              </div>
            )}
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleAdd} disabled={upsertCountry.isPending}>
              {upsertCountry.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              新增
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </AppLayout>
  );
}

// Simplified World Map SVG Component
function WorldMapSVG({ countryMap }: { countryMap: Record<string, { status: string }> }) {
  const getColor = (code: string) => {
    const entry = countryMap[code];
    if (!entry) return "#e5e7eb";
    return STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG]?.mapColor ?? "#e5e7eb";
  };

  // Simplified rectangular world map using country blocks
  const regions = [
    {
      name: "North America",
      countries: ["US", "CA", "MX", "GT", "BZ", "HN", "SV", "NI", "CR", "PA", "CU", "JM", "HT", "DO", "TT", "BS"],
      x: 30, y: 80, w: 160, h: 120
    },
    {
      name: "South America",
      countries: ["BR", "AR", "CL", "PE", "CO", "VE", "EC", "BO", "PY", "UY", "GY", "SR"],
      x: 90, y: 210, w: 120, h: 130
    },
    {
      name: "Europe",
      countries: ["GB", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "CH", "AT", "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "SE", "NO", "DK", "FI", "IE", "HR", "RS", "BA", "SI", "ME", "MK", "AL", "LT", "LV", "EE", "BY", "UA", "MD", "LU", "IS", "MT", "CY", "LI", "MC", "AD"],
      x: 240, y: 50, w: 130, h: 100
    },
    {
      name: "Africa",
      countries: ["NG", "EG", "ZA", "KE", "ET", "TZ", "GH", "CM", "CI", "SN", "MZ", "MG", "AO", "ZM", "ZW", "RW", "UG", "SD", "LY", "TN", "MA", "DZ", "ML", "NE", "BF", "TD", "SO", "ER", "DJ", "BJ", "TG", "GN", "SL", "LR", "GM", "GW", "CV", "MR", "CF", "CG", "GA", "GQ", "BI", "MW", "LS", "SZ", "BW", "NA", "SS"],
      x: 240, y: 160, w: 130, h: 160
    },
    {
      name: "Asia",
      countries: ["CN", "IN", "JP", "KR", "TH", "VN", "MY", "ID", "PH", "SG", "TW", "HK", "MO", "BD", "PK", "AF", "IR", "IQ", "SA", "AE", "TR", "RU", "KZ", "UZ", "TM", "TJ", "KG", "MN", "KP", "LA", "KH", "MM", "BT", "NP", "LK", "MV", "BN", "TL", "AZ", "AM", "GE", "IL", "JO", "LB", "SY", "YE", "OM", "KW", "QA", "BH"],
      x: 380, y: 50, w: 200, h: 170
    },
    {
      name: "Oceania",
      countries: ["AU", "NZ", "FJ", "PG"],
      x: 460, y: 230, w: 120, h: 80
    },
  ];

  return (
    <div className="p-4 overflow-x-auto">
      <svg viewBox="0 0 600 360" className="w-full" style={{ minWidth: 320 }}>
        {/* Background */}
        <rect width="600" height="360" fill="#f0f4f8" rx="12" />

        {/* Ocean */}
        <rect x="10" y="10" width="580" height="340" fill="#dbeafe" rx="10" />

        {regions.map(region => {
          // Calculate dominant color for region
          const regionCountries = region.countries;
          const visitedInRegion = regionCountries.filter(c => countryMap[c]?.status === "visited").length;
          const plannedInRegion = regionCountries.filter(c => countryMap[c]?.status === "planned").length;
          const wishlistInRegion = regionCountries.filter(c => countryMap[c]?.status === "wishlist").length;

          // Draw individual country cells within region
          const cols = Math.ceil(Math.sqrt(regionCountries.length));
          const rows = Math.ceil(regionCountries.length / cols);
          const cellW = region.w / cols;
          const cellH = region.h / rows;

          return (
            <g key={region.name}>
              {/* Region border */}
              <rect x={region.x} y={region.y} width={region.w} height={region.h} fill="none" stroke="#94a3b8" strokeWidth="1" rx="4" />

              {/* Country cells */}
              {regionCountries.map((code, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const cx = region.x + col * cellW;
                const cy = region.y + row * cellH;
                const color = getColor(code);
                return (
                  <rect
                    key={code}
                    x={cx + 0.5}
                    y={cy + 0.5}
                    width={cellW - 1}
                    height={cellH - 1}
                    fill={color}
                    rx="2"
                  />
                );
              })}

              {/* Region label */}
              <text
                x={region.x + region.w / 2}
                y={region.y + region.h + 12}
                textAnchor="middle"
                fontSize="8"
                fill="#64748b"
                fontFamily="sans-serif"
              >
                {region.name}
              </text>

              {/* Stats badge */}
              {(visitedInRegion + plannedInRegion + wishlistInRegion) > 0 && (
                <g>
                  <rect x={region.x + region.w - 22} y={region.y - 8} width={22} height={14} fill="#6366f1" rx="7" />
                  <text x={region.x + region.w - 11} y={region.y + 1} textAnchor="middle" fontSize="7" fill="white" fontFamily="sans-serif" fontWeight="bold">
                    {visitedInRegion + plannedInRegion + wishlistInRegion}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Title */}
        <text x="300" y="350" textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="sans-serif">
          World Map — {Object.keys(countryMap).length} countries tracked
        </text>
      </svg>
    </div>
  );
}
