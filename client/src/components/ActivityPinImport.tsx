import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/hooks/useI18n";
import { formatDateOnlyInHongKong } from "@/lib/hongKongDate";
import {
  connectedCoordinates,
  connectedSourceMarker,
  connectedText,
  hasConnectedSource,
} from "@shared/connected";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  Loader2,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

const isSystemNote = (line: string) =>
  /^\[voyageai:connected:[^\r\n]*\]$/.test(line.trim());
export function mapNotesForDisplay(notes: string | null | undefined): string {
  return (notes ?? "")
    .split(/\r?\n/)
    .filter(line => !isSystemNote(line))
    .join("\n")
    .trim();
}
export function preserveMapNoteProvenance(
  editedNotes: string,
  originalNotes: string | null | undefined
): string {
  const provenance = (originalNotes ?? "").split(/\r?\n/).filter(isSystemNote);
  return [mapNotesForDisplay(editedNotes), ...provenance]
    .filter(Boolean)
    .join("\n");
}

type ActivityPinCandidate = {
  id: number;
  title: string;
  lat: unknown;
  lng: unknown;
  notes?: string | null;
  location?: string | null;
};

export function buildActivityPinPreview<T extends ActivityPinCandidate>(
  activities: readonly T[]
) {
  const valid = activities.filter(
    activity =>
      connectedCoordinates(activity.lat, activity.lng) && activity.title.trim()
  );
  const validIds = new Set(valid.map(activity => activity.id));
  const excluded = activities.filter(activity => !validIds.has(activity.id));
  return {
    valid,
    excluded,
    linkedExcluded: excluded.filter(activity =>
      /\[voyageai:connected:/.test(activity.notes ?? "")
    ),
  };
}

/** A place description is not a coordinate; missing places stay out of the denominator. */
export function summarizeItineraryLocations<T extends ActivityPinCandidate>(
  activities: readonly T[]
) {
  const valid = activities.filter(activity =>
    connectedCoordinates(activity.lat, activity.lng)
  );
  const validIds = new Set(valid.map(activity => activity.id));
  const locations = activities.filter(
    activity => activity.location?.trim() || validIds.has(activity.id)
  );
  return {
    total: locations.length,
    mapped: valid.length,
    unmapped: locations.length - valid.length,
    noLocation: activities.length - locations.length,
    first: valid[0],
  };
}

/** Explicit, coordinate-only import. Opening the preview never writes or geocodes. */
export default function ActivityPinImport({
  tripId,
  disabled = false,
  onPendingChange,
}: {
  tripId: number;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { lang } = useI18n();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const daysQuery = trpc.itinerary.getDays.useQuery({ tripId });
  const pinsQuery = trpc.map.getPins.useQuery({ tripId });
  const preview = useMemo(() => {
    const activities = (daysQuery.data ?? []).flatMap(day =>
      day.activities.map(activity => ({
        ...activity,
        dayNumber: day.dayNumber,
        date: day.date,
      }))
    );
    return buildActivityPinPreview(activities);
  }, [daysQuery.data]);
  const selected = preview.valid.filter(activity =>
    selectedIds.includes(activity.id)
  );
  const importPins = trpc.connected.importActivityPins.useMutation({
    onSuccess: async result => {
      toast.success(
        lang === "zh"
          ? `已匯入 ${result.created} 個地點 · ${result.skipped} 個已存在／略過 · ${result.invalid} 個無效`
          : `${result.created} places imported · ${result.skipped} existing/skipped · ${result.invalid} invalid`
      );
      setOpen(false);
      setSelectedIds([]);
      await utils.invalidate();
    },
    onError: error =>
      toast.error(
        error.message ||
          (lang === "zh"
            ? "匯入失敗，請再試一次"
            : "Import failed. Please try again.")
      ),
    onSettled: () => onPendingChange?.(false),
  });
  const busy = disabled || importPins.isPending;
  const loading = daysQuery.isLoading || pinsQuery.isLoading;
  const failed = daysQuery.isError || pinsQuery.isError;

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (importPins.isPending) return;
        setOpen(next);
        if (next) setSelectedIds([]);
      }}
    >
      <Button
        variant="outline"
        className="gap-2 bg-card text-card-foreground"
        disabled={busy}
        onClick={() => {
          setSelectedIds([]);
          setOpen(true);
        }}
      >
        <ArrowDownToLine className="h-4 w-4" />
        {lang === "zh" ? "由行程匯入" : "Import from itinerary"}
      </Button>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {lang === "zh"
              ? "一次輸入，行程地點隨行"
              : "Enter once. Bring your itinerary to the map."}
          </DialogTitle>
          <DialogDescription>
            {lang === "zh"
              ? "預覽並選擇要新增的活動。只會使用行程已儲存的有效座標，不會自動搜尋或猜測地點；已存在的記錄由系統略過。"
              : "Preview and choose activities to add. Only valid coordinates already saved in your itinerary are used—no automatic search or guessed locations. Existing records are skipped."}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div role="status" className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              {lang === "zh"
                ? "正在讀取行程地點…"
                : "Loading itinerary locations…"}
            </p>
            {[1, 2, 3].map(row => (
              <div
                key={row}
                className="h-16 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : failed ? (
          <div
            className="rounded-xl border border-destructive/20 p-4 text-sm"
            role="alert"
          >
            <p>
              {lang === "zh"
                ? "未能載入匯入預覽，暫時不能匯入。"
                : "Could not load the preview. Import is unavailable."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                void daysQuery.refetch();
                void pinsQuery.refetch();
              }}
            >
              {lang === "zh" ? "重新載入" : "Retry"}
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-accent/60 p-3 text-sm text-accent-foreground">
              <p className="font-medium">
                {lang === "zh"
                  ? `${preview.valid.length} 個有有效座標 · ${preview.excluded.length} 個因缺少／無效座標而排除`
                  : `${preview.valid.length} with valid coordinates · ${preview.excluded.length} excluded (missing/invalid coordinates)`}
              </p>
              {preview.linkedExcluded.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {lang === "zh"
                    ? `包括 ${preview.linkedExcluded.length} 個已連接活動；沒有有效座標仍不會猜測或自動定位。`
                    : `Includes ${preview.linkedExcluded.length} linked activities. Missing coordinates are never guessed or automatically geocoded.`}
                </p>
              )}
              {preview.excluded.length > 0 && (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    {lang === "zh"
                      ? "查看未能匯入的活動"
                      : "View excluded activities"}
                  </summary>
                  <ul className="mt-2 space-y-1 pl-4">
                    {preview.excluded.map(activity => (
                      <li key={activity.id}>
                        {lang === "zh"
                          ? `第 ${activity.dayNumber} 天`
                          : `Day ${activity.dayNumber}`}{" "}
                        · {activity.title}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    {lang === "zh"
                      ? "這些活動尚未有可用座標；可保留行程記錄，並使用「新增地點」手動搜尋及儲存。"
                      : "These activities have no usable coordinates. Keep the itinerary records and use Add place to search and save manually."}
                  </p>
                </details>
              )}
            </div>
            {preview.valid.length > 0 ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {lang === "zh"
                      ? `已選 ${selected.length} 個`
                      : `${selected.length} selected`}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        setSelectedIds(
                          preview.valid.map(activity => activity.id)
                        )
                      }
                    >
                      {lang === "zh" ? "全選" : "Select all"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy || !selectedIds.length}
                      onClick={() => setSelectedIds([])}
                    >
                      {lang === "zh" ? "清除" : "Clear"}
                    </Button>
                  </div>
                </div>
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {preview.valid.map(activity => {
                    const coordinates = connectedCoordinates(
                      activity.lat,
                      activity.lng
                    )!;
                    const existing = pinsQuery.data?.some(pin => {
                      if (
                        hasConnectedSource(
                          pin.notes,
                          connectedSourceMarker("pin", tripId, activity.id)
                        )
                      )
                        return true;
                      const pinCoordinates = connectedCoordinates(
                        pin.lat,
                        pin.lng
                      );
                      return (
                        connectedText(pin.title) ===
                          connectedText(activity.title) &&
                        pinCoordinates?.lat === coordinates.lat &&
                        pinCoordinates?.lng === coordinates.lng
                      );
                    });
                    return (
                      <label
                        key={activity.id}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-accent/30"
                      >
                        <Checkbox
                          className="mt-1"
                          checked={selectedIds.includes(activity.id)}
                          disabled={busy}
                          onCheckedChange={checked =>
                            setSelectedIds(previous =>
                              checked === true
                                ? Array.from(
                                    new Set([...previous, activity.id])
                                  )
                                : previous.filter(id => id !== activity.id)
                            )
                          }
                          aria-label={
                            lang === "zh"
                              ? `選擇 ${activity.title}`
                              : `Select ${activity.title}`
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-semibold">
                            {activity.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {lang === "zh"
                              ? `第 ${activity.dayNumber} 天`
                              : `Day ${activity.dayNumber}`}{" "}
                            ·{" "}
                            {formatDateOnlyInHongKong(activity.date, lang) ||
                              "—"}
                          </p>
                          {activity.location && (
                            <p className="mt-1 break-words text-xs text-muted-foreground">
                              {activity.location}
                            </p>
                          )}
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {Number(activity.lat).toFixed(5)},{" "}
                            {Number(activity.lng).toFixed(5)}
                          </p>
                          {existing && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                              <Check className="h-3 w-3" />
                              {lang === "zh"
                                ? "已匯入／已有相同地點，再次匯入會略過"
                                : "Already imported or matching place saved; skipped on reimport"}
                            </p>
                          )}
                        </div>
                        <MapPin className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      </label>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex items-start gap-3 py-5 text-sm text-muted-foreground">
                <AlertCircle className="h-5 w-5 shrink-0" />
                {lang === "zh"
                  ? "目前沒有可匯入的活動座標。你仍可手動新增地點。"
                  : "No itinerary activities have importable coordinates yet. You can still add places manually."}
              </div>
            )}
            {selected.length > 1000 && (
              <p role="alert" className="text-xs text-destructive">
                {lang === "zh"
                  ? "每次最多匯入 1,000 個活動，請減少所選數量。"
                  : "Import up to 1,000 activities at a time. Reduce the selection."}
              </p>
            )}
            <Button
              className="w-full gap-2"
              disabled={busy || !selected.length || selected.length > 1000}
              onClick={() => {
                if (busy || !selected.length || selected.length > 1000) return;
                onPendingChange?.(true);
                importPins.mutate({
                  tripId,
                  activityIds: selected.map(activity => activity.id),
                });
              }}
            >
              {importPins.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowDownToLine className="h-4 w-4" />
              )}
              {lang === "zh"
                ? `匯入所選 ${selected.length} 個地點`
                : `Import ${selected.length} selected places`}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
