import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/hooks/useI18n";
import {
  expenseDate,
  originalCurrencyTotals,
  validExpenseAmount,
} from "@/lib/expenseInsights";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowDownToLine, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type ActivityExpenseSource = {
  id: number;
  title: string;
  cost: string | null;
  currency: string | null;
  date: string;
  category?: string | null;
};

export default function ActivityExpenseImport({
  tripId,
  activities,
  baseCurrency,
  canEdit,
  isLoading = false,
  hasError = false,
}: {
  tripId: number;
  activities: ActivityExpenseSource[];
  baseCurrency: string;
  canEdit: boolean;
  isLoading?: boolean;
  hasError?: boolean;
}) {
  const { lang } = useI18n();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const eligible = useMemo(
    () =>
      activities.filter(activity => {
        const cost = validExpenseAmount(activity.cost);
        return cost !== null && cost > 0 && expenseDate(activity.date);
      }),
    [activities]
  );
  const selectedActivities = eligible.filter(activity =>
    selected.includes(activity.id)
  );
  const totals = originalCurrencyTotals(
    selectedActivities.map(activity => ({
      amount: activity.cost!,
      currency: activity.currency || baseCurrency,
    }))
  );
  const mutation = trpc.connected.importActivityExpenses.useMutation({
    onSuccess: async result => {
      await utils.invalidate();
      toast.success(
        lang === "zh"
          ? `已匯入 ${result.created} 筆 · 跳過 ${result.skipped} 筆重複或無效活動`
          : `Imported ${result.created} · skipped ${result.skipped} duplicate or invalid activities`
      );
      setOpen(false);
      setSelected([]);
    },
    onError: error =>
      toast.error(
        lang === "zh"
          ? `匯入失敗：${error.message}`
          : `Import failed: ${error.message}`
      ),
  });
  if (!canEdit) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={isLoading || hasError || mutation.isPending}
        onClick={() => {
          setSelected([]);
          setOpen(true);
        }}
      >
        {isLoading || mutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowDownToLine className="h-4 w-4" />
        )}
        {lang === "zh" ? "從活動匯入" : "Import activities"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!mutation.isPending) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {lang === "zh"
                ? "活動開支 · 預覽及選取"
                : "Activity expenses · preview & select"}
            </DialogTitle>
            <DialogDescription>
              {lang === "zh"
                ? "未有預選活動。勾選你已支付或希望記帳的活動後才會建立開支；活動價格是估算，不代表已付款。已匯入的活動會自動跳過，付款人為你的帳戶。"
                : "Nothing is preselected. Choose activities you have paid for or want to record. Activity prices are estimates, not proof of payment. Previously imported activities are skipped; your account is the payer."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {lang === "zh"
                ? `${eligible.length} 個有效價格活動 · 已選 ${selectedActivities.length}`
                : `${eligible.length} priced activities · ${selectedActivities.length} selected`}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={mutation.isPending || !eligible.length}
                onClick={() =>
                  setSelected(eligible.map(activity => activity.id))
                }
              >
                {lang === "zh" ? "全選有效活動" : "Select all eligible"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={mutation.isPending || !selected.length}
                onClick={() => setSelected([])}
              >
                {lang === "zh" ? "清除" : "Clear"}
              </Button>
            </div>
          </div>
          <div className="max-h-[42dvh] space-y-2 overflow-y-auto">
            {!eligible.length && (
              <p className="rounded-xl bg-muted/40 p-5 text-center text-sm text-muted-foreground">
                {lang === "zh"
                  ? "暫無可匯入的活動，請先在行程活動輸入有效價格及日期。"
                  : "No eligible activities. Add a valid price and date in your itinerary first."}
              </p>
            )}
            {eligible.map(activity => (
              <label
                key={activity.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-accent/40"
              >
                <Checkbox
                  className="mt-1"
                  disabled={mutation.isPending}
                  checked={selected.includes(activity.id)}
                  onCheckedChange={checked =>
                    setSelected(ids =>
                      checked === true
                        ? Array.from(new Set([...ids, activity.id]))
                        : ids.filter(id => id !== activity.id)
                    )
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold">
                    {activity.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {expenseDate(activity.date)} ·{" "}
                    {lang === "zh" ? "活動估算" : "Activity estimate"}
                  </p>
                </div>
                <span className="max-w-[40%] break-words text-right text-sm font-semibold tabular-nums">
                  {activity.currency || baseCurrency}{" "}
                  {Number(activity.cost).toLocaleString(
                    lang === "zh" ? "zh-HK" : "en-HK",
                    { maximumFractionDigits: 2 }
                  )}
                </span>
              </label>
            ))}
          </div>
          <div className="rounded-xl bg-accent/50 p-3 text-xs">
            <p className="mb-1 font-semibold">
              {lang === "zh"
                ? "所選原幣小計（不合併不同貨幣）"
                : "Selected subtotals (currencies kept separate)"}
            </p>
            {Object.keys(totals).length ? (
              Object.entries(totals).map(([currency, amount]) => (
                <p key={currency} className="tabular-nums">
                  {currency}{" "}
                  {amount.toLocaleString(lang === "zh" ? "zh-HK" : "en-HK", {
                    maximumFractionDigits: 2,
                  })}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setOpen(false)}
            >
              {lang === "zh" ? "取消" : "Cancel"}
            </Button>
            <Button
              disabled={mutation.isPending || !selectedActivities.length}
              onClick={() => {
                if (!mutation.isPending && selectedActivities.length)
                  mutation.mutate({
                    tripId,
                    activityIds: selectedActivities.map(
                      activity => activity.id
                    ),
                  });
              }}
            >
              {mutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {lang === "zh"
                ? `確認匯入 ${selectedActivities.length} 筆`
                : `Import ${selectedActivities.length}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
