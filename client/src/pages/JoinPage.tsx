import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useI18n } from "@/hooks/useI18n";
import { Loader2, CheckCircle2, XCircle, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function JoinPage() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "joining" | "success" | "error" | "already">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [tripId, setTripId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tk = params.get("token");
    setToken(tk);
  }, []);

  const joinMutation = trpc.members.joinViaInvite.useMutation({
    onSuccess: (data) => {
      setTripId(data.tripId);
      setStatus(data.alreadyMember ? "already" : "success");
    },
    onError: (e) => {
      setErrorMsg(e.message || t("joinFailed"));
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
            <h1 className="text-2xl font-bold text-foreground">{t("joinInviteTitle")}</h1>
            <p className="text-muted-foreground mt-2">{t("joinInviteDesc")}</p>
          </div>
          <Button
            className="w-full"
            onClick={() => { window.location.href = getLoginUrl(); }}
          >
            {t("joinLoginBtn")}
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
          <h1 className="text-xl font-bold text-foreground">{t("joinInvalidLink")}</h1>
          <Button variant="outline" onClick={() => setLocation("/")}>{t("backHome")}</Button>
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
            <p className="text-foreground font-medium">{t("joiningTrip")}</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <div>
              <h1 className="text-xl font-bold text-foreground">{t("joinSuccess")}</h1>
              <p className="text-muted-foreground mt-1">{t("joinSuccessDesc")}</p>
            </div>
            <Button className="w-full" onClick={() => setLocation(tripId ? `/trips/${tripId}/itinerary` : "/")}>
              {t("goToTrip")}
            </Button>
          </>
        )}
        {status === "already" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-blue-500 mx-auto" />
            <div>
              <h1 className="text-xl font-bold text-foreground">{t("alreadyMember")}</h1>
              <p className="text-muted-foreground mt-1">{t("alreadyMemberDesc")}</p>
            </div>
            <Button className="w-full" onClick={() => setLocation(tripId ? `/trips/${tripId}/itinerary` : "/")}>
              {t("goToTrip")}
            </Button>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-12 h-12 text-destructive mx-auto" />
            <div>
              <h1 className="text-xl font-bold text-foreground">{t("joinFailed")}</h1>
              <p className="text-muted-foreground mt-1">{errorMsg}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setLocation("/")}>{t("backHome")}</Button>
          </>
        )}
      </div>
    </div>
  );
}
