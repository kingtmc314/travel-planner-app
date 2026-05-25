import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Loader2, CheckCircle2, XCircle, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function JoinPage() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "joining" | "success" | "error" | "already">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [tripId, setTripId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    setToken(t);
  }, []);

  const joinMutation = trpc.members.joinViaInvite.useMutation({
    onSuccess: (data) => {
      setTripId(data.tripId);
      setStatus(data.alreadyMember ? "already" : "success");
    },
    onError: (e) => {
      setErrorMsg(e.message || "加入失敗，請重試");
      setStatus("error");
    },
  });

  useEffect(() => {
    if (!authLoading && user && token && status === "idle") {
      setStatus("joining");
      joinMutation.mutate({ token });
    }
  }, [authLoading, user, token, status]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authLoading && !user && token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto">
            <Plane className="w-8 h-8 text-white rotate-45" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">你收到了行程邀請</h1>
            <p className="text-muted-foreground mt-2">請先登入以加入共享行程</p>
          </div>
          <Button
            className="w-full"
            onClick={() => {
              const returnPath = `/join?token=${token}`;
              window.location.href = getLoginUrl();
            }}
          >
            登入以加入行程
          </Button>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-4">
          <XCircle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold text-foreground">無效的邀請連結</h1>
          <Button variant="outline" onClick={() => setLocation("/")}>返回首頁</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-6">
        {status === "joining" && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <p className="text-foreground font-medium">正在加入行程...</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <div>
              <h1 className="text-xl font-bold text-foreground">成功加入行程！</h1>
              <p className="text-muted-foreground mt-1">你已成為行程成員，可以開始查看或編輯行程</p>
            </div>
            <Button className="w-full" onClick={() => setLocation(tripId ? `/trips/${tripId}/itinerary` : "/")}>
              前往行程
            </Button>
          </>
        )}
        {status === "already" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-blue-500 mx-auto" />
            <div>
              <h1 className="text-xl font-bold text-foreground">你已是行程成員</h1>
              <p className="text-muted-foreground mt-1">直接前往行程即可</p>
            </div>
            <Button className="w-full" onClick={() => setLocation(tripId ? `/trips/${tripId}/itinerary` : "/")}>
              前往行程
            </Button>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-12 h-12 text-destructive mx-auto" />
            <div>
              <h1 className="text-xl font-bold text-foreground">加入失敗</h1>
              <p className="text-muted-foreground mt-1">{errorMsg}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setLocation("/")}>返回首頁</Button>
          </>
        )}
      </div>
    </div>
  );
}
