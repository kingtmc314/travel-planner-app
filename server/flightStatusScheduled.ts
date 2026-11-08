import type { Request, Response } from "express";
import type {
  FlightStatusRequest,
  FlightStatusResult,
} from "../shared/flightStatus";
import { sdk } from "./_core/sdk";
import { getHkiaFlightStatus } from "./hkiaFlightStatus";
import {
  commitFlightWatchCheck,
  disableFlightWatch,
  getFlightStatusScheduleByTaskUid,
  isFlightStatusScheduleActive,
  listFlightWatches,
  loadAuthorizedFlightSource,
  withinFlightPollingWindow,
} from "./flightStatusPersistence";

/** Per-request deadline only: this creates no scheduler or persistent timer. */
export async function getBoundedFlightStatus(
  request: FlightStatusRequest,
  timeoutMs = 15000
): Promise<FlightStatusResult> {
  const deadline = AbortSignal.timeout(Math.max(1, timeoutMs));
  let onAbort: () => void = () => {};
  try {
    return await Promise.race([
      getHkiaFlightStatus(request),
      new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error("flight-provider-timeout"));
        deadline.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    deadline.removeEventListener("abort", onAbort);
  }
}

/** Foreground is caller-only (25); background is a bounded oldest-first batch (50).
 * Network failure/stale/missing records update check time, not a fabricated event.
 * Both paths revalidate the source before fetch AND atomically before notification.
 */
export async function checkFlightWatches(options: {
  userId?: number;
  taskUid?: string;
  maxDurationMs?: number;
}): Promise<{
  checked: number;
  notificationsCreated: number;
  scheduleActive: boolean;
}> {
  const started = Date.now();
  const deadline =
    started + Math.min(110000, Math.max(1, options.maxDurationMs ?? 110000));
  const watches = await listFlightWatches(
    options.userId,
    options.userId === undefined ? 50 : 25
  );
  let checked = 0,
    notificationsCreated = 0;
  for (const watch of watches) {
    if (Date.now() >= deadline) break;
    // Paused/replaced configurations stop an already-running callback too.
    if (
      options.taskUid &&
      !(await getFlightStatusScheduleByTaskUid(options.taskUid))
    )
      break;
    const reference = { kind: watch.sourceKind, id: watch.sourceId };
    const source = await loadAuthorizedFlightSource(watch.userId, reference);
    if (!source || !source.request) {
      await disableFlightWatch(watch.userId, reference);
      continue;
    }
    let result: FlightStatusResult | null = null;
    if (withinFlightPollingWindow(source.request.date)) {
      try {
        result = await getBoundedFlightStatus(
          source.request,
          Math.min(15000, deadline - Date.now())
        );
      } catch {
        // No provider details, URLs, tokens or private source data are logged/returned.
      }
    }
    const outcome = await commitFlightWatchCheck(watch, source.request, result);
    checked += 1;
    notificationsCreated += outcome.notificationsCreated;
  }
  // A global config may only inform a caller who has an active own watch.
  const ownsActiveWatch =
    options.userId === undefined ||
    (await listFlightWatches(options.userId, 1)).length > 0;
  return {
    checked,
    notificationsCreated,
    scheduleActive: ownsActiveWatch && (await isFlightStatusScheduleActive()),
  };
}

/** Parent mounts POST /api/scheduled/flight-status. Never read req.body; scheduling
 * is explicitly not created here, and must wait for deployment confirmation.
 */
export async function handleFlightStatusScheduled(
  req: Request,
  res: Response
): Promise<void> {
  try {
    let caller: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      caller = await sdk.authenticateRequest(req);
    } catch {
      res.status(403).json({ ok: false, error: "cron-only" });
      return;
    }
    if (
      caller.isCron !== true ||
      typeof caller.taskUid !== "string" ||
      !caller.taskUid ||
      caller.taskUid.length > 65
    ) {
      res.status(403).json({ ok: false, error: "cron-only" });
      return;
    }
    if (!(await getFlightStatusScheduleByTaskUid(caller.taskUid))) {
      res.json({ ok: true, skipped: "inactive-or-orphan" });
      return;
    }
    const result = await checkFlightWatches({ taskUid: caller.taskUid });
    res.json({ ok: true, ...result });
  } catch {
    // Platform investigation surfaces this JSON verbatim: deliberately omit stack,
    // request body, identity, source values, task UID and authentication headers.
    res.status(500).json({ ok: false, error: "flight-status-check-failed" });
  }
}
