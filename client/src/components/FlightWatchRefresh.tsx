import React, { useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

export const FLIGHT_REFRESH_INTERVAL = 5 * 60 * 1000;

/** Visibility listener only. React Query owns bounded refreshes; no process timers. */
export function useFlightDocumentVisible() {
  const [visible, setVisible] = useState(
    () =>
      typeof document !== "undefined" && document.visibilityState === "visible"
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

/** Per authenticated user and QueryClient, including StrictMode/concurrent mounts. */
export function createFlightCheckGate() {
  let inFlight = false;
  let lastDataUpdatedAt: number | null = null;
  let lastStartedAt: number | null = null;
  return {
    begin(dataUpdatedAt: number, now: number) {
      if (
        !dataUpdatedAt ||
        inFlight ||
        dataUpdatedAt === lastDataUpdatedAt ||
        (lastStartedAt !== null &&
          now - lastStartedAt < FLIGHT_REFRESH_INTERVAL)
      )
        return false;
      inFlight = true;
      lastDataUpdatedAt = dataUpdatedAt;
      lastStartedAt = now;
      return true;
    },
    finish() {
      inFlight = false;
    },
  };
}

const checkGates = new WeakMap<
  QueryClient,
  Map<number, ReturnType<typeof createFlightCheckGate>>
>();
function userCheckGate(client: QueryClient, userId: number) {
  let users = checkGates.get(client);
  if (!users) {
    users = new Map();
    checkGates.set(client, users);
  }
  let gate = users.get(userId);
  if (!gate) {
    gate = createFlightCheckGate();
    users.set(userId, gate);
  }
  return gate;
}

function AuthenticatedFlightWatchRefresh({ userId }: { userId: number }) {
  const visible = useFlightDocumentVisible();
  const utils = trpc.useUtils();
  const client = useQueryClient();
  const active = useRef(false);
  const watches = trpc.flightStatus.watches.useQuery(undefined, {
    enabled: visible,
    retry: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchInterval: visible ? FLIGHT_REFRESH_INTERVAL : false,
    staleTime: FLIGHT_REFRESH_INTERVAL,
  });
  const { mutateAsync } = trpc.flightStatus.checkWatched.useMutation({
    retry: false,
  });
  const hasWatches = Boolean(watches.data?.references.length);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      !visible ||
      typeof document === "undefined" ||
      document.visibilityState !== "visible" ||
      !hasWatches ||
      watches.isError ||
      watches.isFetching
    )
      return;
    const gate = userCheckGate(client, userId);
    if (!gate.begin(watches.dataUpdatedAt, Date.now())) return;
    void mutateAsync()
      .then(result => {
        // No enrollment, booking writes, or watch-list invalidation here.
        if (active.current && result.notificationsCreated > 0) {
          void utils.notifications.list.invalidate();
          void utils.notifications.unreadCount.invalidate();
        }
      })
      .catch(() => {
        // Keep the last known status and retry only at the next bounded query tick.
      })
      .finally(() => gate.finish());
  }, [
    visible,
    hasWatches,
    watches.dataUpdatedAt,
    watches.isError,
    watches.isFetching,
    client,
    userId,
    mutateAsync,
    utils,
  ]);
  return null;
}

/** Mount once inside App's tRPC / QueryClient providers; guests mount no watch RPC hooks. */
export default function FlightWatchRefresh() {
  const auth = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (!auth.data || auth.isError) return null;
  return (
    <AuthenticatedFlightWatchRefresh key={auth.data.id} userId={auth.data.id} />
  );
}
