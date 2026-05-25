// Shown after login when localStorage guest trips exist — prompts merge
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CloudUpload, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getGuestTrips } from "@/hooks/useGuestTrips";

interface Props {
  onDismiss: () => void;
  onMerged: () => void;
}

export default function GuestMergeBanner({ onDismiss, onMerged }: Props) {
  const guestTrips = getGuestTrips();
  const [merging, setMerging] = useState(false);
  const mergeGuestTrips = trpc.trips.mergeGuestTrips.useMutation();

  if (guestTrips.length === 0) return null;

  const handleMerge = async () => {
    setMerging(true);
    try {
      const payload = guestTrips.map(t => ({
        name: t.name,
        destination: t.destination,
        startDate: t.startDate,
        endDate: t.endDate,
        baseCurrency: t.baseCurrency ?? "HKD",
      }));
      const result = await mergeGuestTrips.mutateAsync({ trips: payload });
      // Clear localStorage after merge
      try { localStorage.removeItem("voyageai_guest_trips"); } catch {}
      toast.success(`已成功同步 ${result.merged} 個行程至帳號`);
      onMerged();
    } catch (e: any) {
      toast.error("同步失敗：" + (e.message ?? "請重試"));
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="mx-4 sm:mx-6 mt-4 rounded-2xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <CloudUpload className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 sm:mt-0" />
      <div className="flex-1">
        <p className="font-semibold text-blue-800 dark:text-blue-300 text-sm">
          發現 {guestTrips.length} 個本機行程
        </p>
        <p className="text-blue-700/70 dark:text-blue-400/70 text-xs mt-0.5">
          你在訪客模式下建立了行程，是否要同步至你的帳號？
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          onClick={handleMerge}
          disabled={merging}
          className="gap-1.5"
          style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)", color: "white" }}
        >
          <CloudUpload className="w-4 h-4" />
          {merging ? "同步中..." : "同步至帳號"}
        </Button>
        <button
          onClick={onDismiss}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
        >
          <X className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </button>
      </div>
    </div>
  );
}
