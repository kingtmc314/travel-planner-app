import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightStatusRequest } from "../shared/flightStatus";

const NOW = Date.parse("2026-11-09T00:05:00+08:00");
const REQUEST: FlightStatusRequest = {
  flightNumber: " cx 255 ",
  date: "2026-11-09",
  fromCode: " hkg ",
  toCode: "lhr",
};
let getStatus: typeof import("./hkiaFlightStatus").getHkiaFlightStatus;
let network: ReturnType<typeof vi.fn>;

function row(overrides: Record<string, unknown> = {}) {
  return {
    time: "00:10",
    flight: [
      { no: "CX 255", airline: "CPA" },
      { no: "BA 4555", airline: "BAW" },
    ],
    destination: ["LHR"],
    status: "Dep 00:30",
    gate: "23",
    terminal: "1",
    aisle: "B",
    baggage: "7",
    statusCode: "irrelevant",
    privateExtra: "must not escape",
    ...overrides,
  };
}
function envelope(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-11-09",
    arrival: false,
    cargo: false,
    lastUpdatedTime: "2026-11-09T00:04:00+08:00",
    list: [row()],
    ...overrides,
  };
}
function json(value: unknown = [envelope()], init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      ...init.headers,
    },
  });
}
function request(overrides: Partial<FlightStatusRequest> = {}) {
  return getStatus({ ...REQUEST, ...overrides });
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  network = vi.fn().mockImplementation(async () => json());
  vi.stubGlobal("fetch", network);
  ({ getHkiaFlightStatus: getStatus } = await import("./hkiaFlightStatus"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("official-source contract and exact identity", () => {
  it("uses only the fixed HTTPS public GET with safe headers and no credentials or redirects", async () => {
    const result = await request();
    expect(network).toHaveBeenCalledOnce();
    const [url, options] = network.mock.calls[0];
    expect(url).toBe(
      "https://www.hongkongairport.com/flightinfo-rest/rest/flights/past?date=2026-11-09&arrival=false&cargo=false&lang=en"
    );
    expect(options).toEqual({
      method: "GET",
      redirect: "error",
      credentials: "omit",
      signal: expect.any(AbortSignal),
      headers: { Accept: "application/json" },
    });
    expect(result).toMatchObject({
      outcome: "available",
      sourceUrl: url,
      experimentalRecentData: true,
      checkedAt: NOW,
      observation: {
        id: "hkia:2026-11-09:departure:CX255:HKG:LHR",
        provider: "hkia",
        date: REQUEST.date,
        flightNumber: "CX255",
        fromCode: "HKG",
        toCode: "LHR",
        direction: "departure",
        scheduledTime: "00:10",
        status: "departed",
        statusText: "Dep 00:30",
        gate: "23",
        terminal: "1",
        checkInAisle: "B",
        baggageBelt: "7",
        sourceUpdatedAt: NOW - 60_000,
        fetchedAt: NOW,
      },
    });
    expect(result.message).toContain("Experimental");
    expect(Object.keys(result.observation!).sort()).toEqual(
      [
        "id",
        "provider",
        "date",
        "flightNumber",
        "fromCode",
        "toCode",
        "direction",
        "scheduledTime",
        "status",
        "statusText",
        "gate",
        "terminal",
        "checkInAisle",
        "baggageBelt",
        "sourceUpdatedAt",
        "fetchedAt",
      ].sort()
    );
    expect(JSON.stringify(result)).not.toMatch(
      /privateExtra|must not escape|statusCode|scheduledDeparture|ETA/
    );
  });

  it.each([
    { flightNumber: "https://attacker.test" },
    { flightNumber: "CX255?evil=1" },
    { date: "2026-11-09&cargo=true" },
    { date: "2026-02-30" },
    { date: "2026-11-09T00:00:00Z" },
    { fromCode: "LHR", toCode: "JFK" },
    { fromCode: "HKG", toCode: "HKG" },
    { toCode: "https://attacker.test" },
    { toCode: "HK1" },
    { flightNumber: null },
    { fromCode: null },
  ])(
    "rejects unsafe or unsupported input before networking %j",
    async overrides => {
      expect(
        (await request(overrides as Partial<FlightStatusRequest>)).outcome
      ).toBe("unsupported");
      expect(network).not.toHaveBeenCalled();
    }
  );

  it("matches only the exact returned date/direction/passenger envelope, even with multiple nearby dates", async () => {
    network.mockResolvedValue(
      json([
        envelope({ date: "2026-11-08", list: [row({ status: "Cancelled" })] }),
        envelope({ arrival: true, list: [row({ status: "Arr 00:01" })] }),
        envelope({ cargo: true, list: [row({ status: "Cancelled" })] }),
        envelope(),
        envelope({ date: "2026-11-10", list: [row({ status: "Cancelled" })] }),
      ])
    );
    expect((await request()).observation?.statusText).toBe("Dep 00:30");
  });

  it.each([
    {
      data: [
        envelope({ date: "2026-11-08" }),
        envelope({ date: "2026-11-10" }),
      ],
    },
    { data: [envelope({ arrival: true })] },
    { data: [envelope({ cargo: true })] },
    { data: [] },
  ])(
    "does not attach out-of-date, other-direction, or cargo data %j",
    async ({ data }) => {
      network.mockResolvedValue(json(data));
      expect(await request()).toMatchObject({
        outcome: "not_found",
        observation: null,
      });
      expect(network).toHaveBeenCalledOnce();
    }
  );

  it("uses the queried exact codeshare number, not operator metadata or airline aliases", async () => {
    expect(
      (await request({ flightNumber: "ba4555" })).observation?.flightNumber
    ).toBe("BA4555");
    expect((await request({ flightNumber: "CPA255" })).outcome).toBe(
      "not_found"
    );
    expect((await request({ flightNumber: "CX0255" })).outcome).toBe(
      "not_found"
    );
    expect(network).toHaveBeenCalledOnce();
  });

  it("matches an exact arrival origin and retains its airport clock without ETA parsing", async () => {
    network.mockResolvedValue(
      json([
        envelope({
          arrival: true,
          list: [
            row({
              origin: ["LHR"],
              destination: undefined,
              status: "Arr 00:01",
              time: "23:55",
            }),
          ],
        }),
      ])
    );
    const result = await request({ fromCode: "LHR", toCode: "HKG" });
    expect(network.mock.calls[0][0]).toContain("arrival=true");
    expect(result.observation).toMatchObject({
      direction: "arrival",
      status: "arrived",
      scheduledTime: "23:55",
    });
  });

  it.each([
    { destination: ["LHR", "CDG"] },
    { destination: ["LHR", "LHR"] },
    { destination: [] },
    { destination: ["lhr"] },
    { destination: ["London Heathrow"] },
    { destination: ["LH1"] },
    { destination: null },
  ])(
    "does not pick a first, last, city, invalid, or multiple remote airport %j",
    async ({ destination }) => {
      network.mockResolvedValue(
        json([envelope({ list: [row({ destination })] })])
      );
      expect(await request()).toMatchObject({
        outcome: "ambiguous",
        observation: null,
      });
    }
  );

  it("requires exact single remote airport equality, not any other leg", async () => {
    network.mockResolvedValue(
      json([envelope({ list: [row({ destination: ["CDG"] })] })])
    );
    expect((await request()).outcome).toBe("not_found");
  });

  it("does not choose between duplicated/conflicting exact flight observations", async () => {
    network.mockResolvedValue(
      json([envelope({ list: [row(), row({ gate: "99" })] })])
    );
    expect(await request()).toMatchObject({
      outcome: "ambiguous",
      observation: null,
    });
  });
});

describe("strict timestamps, Hong Kong calendar, and conservative statuses", () => {
  it.each([
    ["2026-11-09T00:04:00+08:00", NOW - 60_000],
    ["2026-11-08T16:04:00Z", NOW - 60_000],
    ["2026-11-08T11:04:00-05:00", NOW - 60_000],
    ["2026-11-09T00:04:00.123+08:00", NOW - 60_000 + 123],
  ])(
    "parses the actual explicit offset into UTC epoch: %s",
    async (timestamp, expected) => {
      network.mockResolvedValue(
        json([envelope({ lastUpdatedTime: timestamp })])
      );
      expect((await request()).observation?.sourceUpdatedAt).toBe(expected);
    }
  );

  it.each([
    undefined,
    null,
    "",
    123,
    "2026-11-09 00:04:00",
    "2026-11-09T00:04:00",
    "2026-02-30T00:04:00+08:00",
    "2026-11-09T24:00:00+08:00",
    "2026-11-09T00:04:60+08:00",
    "2026-11-09T00:04:00+14:01",
    "2026-11-09T00:04:00+15:00",
    "2026-11-09T00:04:00+08:60",
    "2026-11-09T00:04:00-00:00",
    "0000-11-09T00:04:00+08:00",
  ])(
    "does not repair or locally interpret invalid source timestamp %s",
    async timestamp => {
      network.mockResolvedValue(
        json([envelope({ lastUpdatedTime: timestamp })])
      );
      expect(await request()).toMatchObject({
        outcome: "stale",
        observation: { sourceUpdatedAt: null },
      });
    }
  );

  it.each([
    [NOW - 900_000, "available"],
    [NOW - 900_001, "stale"],
    [NOW + 120_000, "available"],
    [NOW + 120_001, "stale"],
  ])(
    "enforces inclusive 15-minute age and two-minute future tolerance (%s)",
    async (epoch, outcome) => {
      network.mockResolvedValue(
        json([envelope({ lastUpdatedTime: new Date(epoch).toISOString() })])
      );
      expect((await request()).outcome).toBe(outcome);
    }
  );

  it("labels previous Hong Kong calendar records historical even if recently republished", async () => {
    network.mockResolvedValue(json([envelope({ date: "2026-11-08" })]));
    const result = await request({ date: "2026-11-08" });
    expect(result.outcome).toBe("stale");
    expect(result.message).toContain("Historical");
    expect(result.experimentalRecentData).toBe(false);
    expect(result.observation?.date).toBe("2026-11-08");
  });

  it("classifies future calendar rows only when explicitly returned with a fresh timestamp", async () => {
    network.mockResolvedValue(
      json([
        envelope({ date: "2026-11-10", list: [row({ status: "Scheduled" })] }),
      ])
    );
    expect(await request({ date: "2026-11-10" })).toMatchObject({
      outcome: "available",
      experimentalRecentData: true,
      observation: { status: "scheduled" },
    });
  });

  it("rechecks Hong Kong midnight on a cache hit, regardless of the UTC calendar", async () => {
    vi.setSystemTime(Date.parse("2026-11-08T23:59:00+08:00"));
    network.mockResolvedValue(
      json([
        envelope({
          date: "2026-11-08",
          lastUpdatedTime: "2026-11-08T23:58:30+08:00",
        }),
      ])
    );
    const initial = await request({ date: "2026-11-08" });
    expect(initial.outcome).toBe("available");
    await vi.advanceTimersByTimeAsync(90_000);
    const afterMidnight = await request({ date: "2026-11-08" });
    expect(afterMidnight.outcome).toBe("stale");
    expect(afterMidnight.message).toContain("Historical");
    expect(afterMidnight.experimentalRecentData).toBe(false);
    expect(afterMidnight.checkedAt).toBe(
      Date.parse("2026-11-09T00:00:30+08:00")
    );
    expect(afterMidnight.observation?.fetchedAt).toBe(
      initial.observation?.fetchedAt
    );
    expect(network).toHaveBeenCalledOnce();
  });

  it.each([
    ["Scheduled", "scheduled"],
    ["Boarding", "boarding"],
    ["Cancelled", "cancelled"],
    ["Canceled", "cancelled"],
    ["Delayed", "delayed"],
    ["Dep 00:30", "departed"],
    ["Departed", "departed"],
    ["", "unknown"],
    ["On time", "unknown"],
    ["Est 00:45", "unknown"],
    ["Estimated 00:45", "unknown"],
    ["Gate Closed", "unknown"],
    ["Dep 24:00", "unknown"],
    ["Dep 00:30 (2026-11-10)", "unknown"],
    ["Not departed", "unknown"],
    ["Arr 00:30", "unknown"],
    ["Delayed - Est 00:45", "unknown"],
    ["<b>Dep 00:30</b>", "unknown"],
  ])(
    "only classifies unequivocal departure text and preserves raw %s",
    async (statusText, status) => {
      network.mockResolvedValue(
        json([
          envelope({
            list: [row({ status: statusText, statusCode: "ARRIVED" })],
          }),
        ])
      );
      expect((await request()).observation).toMatchObject({
        status,
        statusText,
      });
    }
  );

  it.each(["Arr 00:01", "Arrived", "Landed 00:01"])(
    "only explicit arrival text establishes arrived: %s",
    async status => {
      network.mockResolvedValue(
        json([
          envelope({ arrival: true, list: [row({ origin: ["LHR"], status })] }),
        ])
      );
      expect(
        (await request({ fromCode: "LHR", toCode: "HKG" })).observation?.status
      ).toBe("arrived");
    }
  );

  it("retains unknown raw data without deriving schedule, terminal, status or event time", async () => {
    network.mockResolvedValue(
      json([
        envelope({
          list: [
            row({
              time: "Est 00:45",
              status: "Await advice",
              gate: 23,
              terminal: null,
              aisle: "",
              baggage: {},
              scheduledDeparture: "03:00",
              eta: "02:00",
            }),
          ],
        }),
      ])
    );
    expect(await request()).toMatchObject({
      outcome: "available",
      observation: {
        scheduledTime: null,
        status: "unknown",
        statusText: "Await advice",
        gate: null,
        terminal: null,
        checkInAisle: null,
        baggageBelt: null,
      },
    });
  });
});

describe("bounded HTTP and response safety", () => {
  it.each([301, 302, 401, 403, 404, 429, 500, 503])(
    "does not convert HTTP %s failure to not_found",
    async status => {
      network.mockResolvedValue(json([], { status }));
      expect(await request()).toMatchObject({
        outcome: "unavailable",
        observation: null,
      });
      expect(network).toHaveBeenCalledOnce();
    }
  );

  it("does not leak exception messages or retry/fallback on network errors", async () => {
    network.mockRejectedValue(new Error("secret provider error"));
    const result = await request();
    expect(result.outcome).toBe("unavailable");
    expect(result.message).not.toContain("secret");
    expect(network).toHaveBeenCalledOnce();
  });

  it.each([
    undefined,
    "text/html",
    "text/plain",
    "application/jsonp",
    "application/jsonX",
  ])("rejects absent or non-JSON content type %s", async contentType => {
    const headers: Record<string, string> = contentType
      ? { "Content-Type": contentType }
      : {};
    network.mockResolvedValue(
      new Response(new TextEncoder().encode("[]"), { headers })
    );
    expect((await request()).outcome).toBe("unavailable");
  });

  it("accepts a valid structured JSON content type", async () => {
    network.mockResolvedValue(
      json([envelope()], {
        headers: { "Content-Type": "application/vnd.hkia+json" },
      })
    );
    expect((await request()).outcome).toBe("available");
  });

  it.each(["2097153", "900719925474099999999", "-1", "abc"])(
    "rejects oversized/malformed content length %s",
    async length => {
      network.mockResolvedValue(
        json([envelope()], { headers: { "Content-Length": length } })
      );
      expect((await request()).outcome).toBe("unavailable");
    }
  );

  it("bounds the actual streamed body even with a misleading small content-length", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
        controller.enqueue(new Uint8Array(1024 * 1024 + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    network.mockResolvedValue(
      new Response(body, {
        headers: { "Content-Type": "application/json", "Content-Length": "1" },
      })
    );
    expect((await request()).outcome).toBe("unavailable");
    expect(cancelled).toBe(true);
  });

  it("accepts exactly 2 MiB of valid streamed JSON without needing a length header", async () => {
    const payload = JSON.stringify([envelope()]);
    network.mockResolvedValue(
      new Response(payload + " ".repeat(2 * 1024 * 1024 - payload.length), {
        headers: { "Content-Type": "application/json" },
      })
    );
    expect((await request()).outcome).toBe("available");
  });

  it.each(
    [
      {},
      null,
      { list: [] },
      [{ date: "2026-11-09", arrival: "false", cargo: false, list: [] }],
      [envelope({ cargo: "false" })],
      [envelope({ date: "2026-02-30" })],
      [envelope({ list: {} })],
      [envelope({ list: [null] })],
      [envelope({ list: [row({ flight: "CX255" })] })],
      [envelope({ list: [row({ flight: [] })] })],
      [envelope({ list: [row({ flight: [{ no: 255 }] })] })],
    ].map(data => ({ data }))
  )(
    "validates source JSON shape rather than assuming data %j",
    async ({ data }) => {
      network.mockResolvedValue(json(data));
      expect((await request()).outcome).toBe("unavailable");
    }
  );

  it("rejects malformed JSON and invalid UTF-8", async () => {
    network.mockResolvedValueOnce(
      new Response("{not JSON", {
        headers: { "Content-Type": "application/json" },
      })
    );
    expect((await request()).outcome).toBe("unavailable");
    await vi.advanceTimersByTimeAsync(15_000);
    network.mockResolvedValueOnce(
      new Response(new Uint8Array([0xff, 0xfe]), {
        headers: { "Content-Type": "application/json" },
      })
    );
    expect((await request()).outcome).toBe("unavailable");
  });

  it.each(["redirected", "wrong-url"])(
    "rejects unexpected response transport metadata %s",
    async kind => {
      const response = json();
      if (kind === "redirected")
        Object.defineProperty(response, "redirected", { value: true });
      else
        Object.defineProperty(response, "url", {
          value: "https://attacker.test/",
        });
      network.mockResolvedValue(response);
      expect((await request()).outcome).toBe("unavailable");
    }
  );

  it("times out a stalled fetch after 10 seconds and aborts the signal", async () => {
    network.mockImplementation(() => new Promise(() => {}));
    const pending = request();
    await vi.advanceTimersByTimeAsync(9999);
    expect(network.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({
      outcome: "unavailable",
      observation: null,
    });
    expect(network.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("times out and cancels a stalled body even when its implementation ignores abort", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    network.mockResolvedValue(
      new Response(body, { headers: { "Content-Type": "application/json" } })
    );
    const pending = request();
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).outcome).toBe("unavailable");
    expect(cancelled).toBe(true);
  });

  it("turns a stream read failure into unavailable", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("broken stream"));
      },
    });
    network.mockResolvedValue(
      new Response(body, { headers: { "Content-Type": "application/json" } })
    );
    expect((await request()).outcome).toBe("unavailable");
  });
});

describe("public per-date/direction cache and request bounds", () => {
  it("coalesces simultaneous requests and caches an entire public date/direction rather than one number", async () => {
    let resolve!: (response: Response) => void;
    network.mockImplementation(
      () =>
        new Promise<Response>(done => {
          resolve = done;
        })
    );
    const pending = Array.from({ length: 25 }, (_, i) =>
      request({ flightNumber: i % 2 ? "BA4555" : "CX255" })
    );
    expect(network).toHaveBeenCalledOnce();
    resolve(json());
    const results = await Promise.all(pending);
    expect(results.every(result => result.outcome === "available")).toBe(true);
    expect((await request({ flightNumber: "AA999" })).outcome).toBe(
      "not_found"
    );
    expect(network).toHaveBeenCalledOnce();
  });

  it("uses separate cache keys for dates and directions", async () => {
    await request();
    await request({ fromCode: "LHR", toCode: "HKG" });
    await request({ date: "2026-11-08" });
    expect(network).toHaveBeenCalledTimes(3);
  });

  it("expires success at three minutes without extending TTL on hits and preserves actual fetchedAt", async () => {
    const first = await request();
    await vi.advanceTimersByTimeAsync(179_999);
    const hit = await request();
    expect(hit.observation?.fetchedAt).toBe(first.observation?.fetchedAt);
    expect(hit.checkedAt).toBe(NOW + 179_999);
    expect(network).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect((await request()).observation?.fetchedAt).toBe(NOW + 180_000);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("reevaluates freshness on cache hits instead of caching available forever", async () => {
    network.mockResolvedValue(
      json([
        envelope({
          lastUpdatedTime: new Date(NOW - 14 * 60_000).toISOString(),
        }),
      ])
    );
    expect((await request()).outcome).toBe("available");
    await vi.advanceTimersByTimeAsync(60_001);
    expect((await request()).outcome).toBe("stale");
    expect(network).toHaveBeenCalledOnce();
  });

  it("short-caches errors for 15 seconds, does not reuse expired successful data on outage, and can recover", async () => {
    expect((await request()).outcome).toBe("available");
    await vi.advanceTimersByTimeAsync(180_000);
    network.mockRejectedValue(new Error("outage"));
    expect((await request()).outcome).toBe("unavailable");
    await vi.advanceTimersByTimeAsync(14_999);
    expect((await request()).outcome).toBe("unavailable");
    expect(network).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    network.mockImplementation(async () => json());
    expect((await request()).outcome).toBe("available");
    expect(network).toHaveBeenCalledTimes(3);
  });

  it("keeps at most 50 date/direction entries with LRU eviction", async () => {
    const dates = Array.from({ length: 51 }, (_, i) =>
      new Date(Date.UTC(2026, 8, i + 1)).toISOString().slice(0, 10)
    );
    for (const date of dates.slice(0, 50)) await request({ date });
    expect(network).toHaveBeenCalledTimes(50);
    await request({ date: dates[0] }); // Make first the most recently used.
    await request({ date: dates[50] });
    await request({ date: dates[0] });
    expect(network).toHaveBeenCalledTimes(51);
    await request({ date: dates[1] });
    expect(network).toHaveBeenCalledTimes(52);
  });

  it("never evicts a pending key to defeat coalescing and caps simultaneous distinct fetches at 50", async () => {
    const resolvers: ((response: Response) => void)[] = [];
    network.mockImplementation(
      () =>
        new Promise<Response>(done => {
          resolvers.push(done);
        })
    );
    const dates = Array.from({ length: 51 }, (_, i) =>
      new Date(Date.UTC(2026, 8, i + 1)).toISOString().slice(0, 10)
    );
    const pending = dates.slice(0, 50).map(date => request({ date }));
    const samePending = request({ date: dates[0] });
    expect((await request({ date: dates[50] })).outcome).toBe("unavailable");
    expect(network).toHaveBeenCalledTimes(50);
    resolvers.forEach(resolve => resolve(json()));
    await Promise.all([...pending, samePending]);
    expect(network).toHaveBeenCalledTimes(50);
  });

  it("does not let callers mutate a cached observation for other users", async () => {
    const initial = await request();
    initial.observation!.statusText = "FAKE ARRIVAL";
    initial.observation!.gate = "FAKE";
    expect((await request()).observation).toMatchObject({
      statusText: "Dep 00:30",
      gate: "23",
    });
    expect(network).toHaveBeenCalledOnce();
  });
});
