import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { decodeBookingImage, type BookingImageMime } from "./bookingImage";
import { bookingImportRouter } from "./bookingImportRouter";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import type { TrpcContext } from "./_core/context";
import {
  BOOKING_IMAGE_MIMES,
  BOOKING_MAX_BYTES,
  BOOKING_MAX_IMAGE_EDGE,
  BOOKING_MAX_IMAGE_PIXELS,
  bookingAnalyzeInput,
  bookingFlightSchema,
} from "../shared/bookingImport";

vi.mock("./db");
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
const mock = vi.mocked(db);
const llm = vi.mocked(invokeLLM);
const originalCookieSecret = ENV.cookieSecret;
const fixtures = new Map<BookingImageMime, Buffer>();
// Only coloured geometry: no text, real booking documents or personal data.
function geometry(width = 12, height = 8): Buffer {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      pixels[offset] = x < width / 2 ? 240 : 20;
      pixels[offset + 1] = y < height / 2 ? 40 : 220;
      pixels[offset + 2] = (x + y) % 2 ? 100 : 160;
    }
  }
  return pixels;
}
function rawGeometry() {
  return sharp(geometry(), { raw: { width: 12, height: 8, channels: 3 } });
}
function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++)
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  result.write(type, 4, 4, "ascii");
  data.copy(result, 8);
  result.writeUInt32BE(
    crc32(result.subarray(4, result.length - 4)),
    result.length - 4
  );
  return result;
}
function pngChunks(bytes: Buffer): { type: string; data: Buffer }[] {
  const result = [];
  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    result.push({
      type: bytes.toString("ascii", offset + 4, offset + 8),
      data: bytes.subarray(offset + 8, offset + 8 + length),
    });
    offset += length + 12;
  }
  return result;
}
function mapPng(
  bytes: Buffer,
  work: (chunk: { type: string; data: Buffer }) => Buffer
): Buffer {
  return Buffer.concat([bytes.subarray(0, 8), ...pngChunks(bytes).map(work)]);
}
const png = () => fixtures.get("image/png")!;
const imageInput = (
  content = png().toString("base64"),
  mimeType: BookingImageMime = "image/png"
) => ({ tripId: 10, kind: "image" as const, content, mimeType });
function context(userId: number | null = 7): TrpcContext {
  return {
    user:
      userId === null
        ? null
        : {
            id: userId,
            openId: "test",
            email: "test@example.com",
            name: "Test",
            loginMethod: "test",
            role: "user",
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date(),
          },
    req: { headers: {} } as any,
    res: {} as any,
  };
}
const caller = (userId: number | null = 7) =>
  bookingImportRouter.createCaller(context(userId));
function output(
  value: unknown = { flights: [], hotels: [], warnings: [] },
  finishReason = "stop"
) {
  llm.mockResolvedValue({
    choices: [
      {
        message: {
          role: "assistant",
          content: typeof value === "string" ? value : JSON.stringify(value),
        },
        finish_reason: finishReason,
      },
    ],
  } as any);
}
let role: string;
let rows: any[];
beforeAll(async () => {
  fixtures.set("image/png", await rawGeometry().png().toBuffer());
  fixtures.set("image/jpeg", await rawGeometry().jpeg().toBuffer());
  fixtures.set(
    "image/webp",
    await rawGeometry().webp({ lossless: true }).toBuffer()
  );
});
beforeEach(() => {
  vi.resetAllMocks();
  ENV.cookieSecret = "booking-image-unit-tests-only-secret";
  role = "editor";
  rows = [];
  mock.getDb.mockResolvedValue({} as any);
  mock.getUserMembership.mockImplementation(
    async (tripId, userId) => ({ id: 1, tripId, userId, role }) as any
  );
  mock.getTripById.mockResolvedValue({ id: 10 } as any);
  mock.getTripFlights.mockImplementation(async () => structuredClone(rows));
  mock.getTripAccommodations.mockResolvedValue([]);
  mock.addFlight.mockImplementation(async value => {
    rows.push({ ...value, id: rows.length + 1 });
    return rows.length;
  });
  output();
});
afterEach(() => {
  ENV.cookieSecret = originalCookieSecret;
  vi.restoreAllMocks();
});

describe("booking image canonical raster validation", () => {
  it.each(BOOKING_IMAGE_MIMES)(
    "fully decodes and sanitizes real %s, preserving every edge",
    async mime => {
      const bytes = fixtures.get(mime)!;
      for (const content of [
        bytes.toString("base64"),
        `data:${mime};base64,${bytes.toString("base64")}`,
      ]) {
        const result = await decodeBookingImage(content, mime);
        expect(result).toMatchObject({ mimeType: mime, width: 12, height: 8 });
        expect(result.bytes.length).toBeLessThanOrEqual(BOOKING_MAX_BYTES);
        const metadata = await sharp(result.bytes).metadata();
        expect(metadata.format).toBe(
          { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" }[
            mime
          ]
        );
        expect(metadata).toMatchObject({
          width: 12,
          height: 8,
          hasProfile: false,
        });
        expect(metadata.exif).toBeUndefined();
        expect(metadata.icc).toBeUndefined();
      }
    }
  );
  it("keeps exact PNG pixel geometry without a crop or resize", async () => {
    const result = await decodeBookingImage(
      png().toString("base64"),
      "image/png"
    );
    expect(await sharp(result.bytes).raw().toBuffer()).toEqual(geometry());
  });
  it.each([
    "",
    "https://example.test/booking.png",
    "file:///etc/passwd",
    "not base64!",
    "data:text/plain;base64,YWJj",
    "data:image/jpeg;base64,YWJj",
    "data:image/png;BASE64,YWJj",
    "data:image/png;charset=utf-8;base64,YWJj",
    "data:image/png;base64,",
    "YQ==\n",
    "YR==",
    "YWJ=",
    "YWJj=",
    "a===",
    "YWJj-_==",
  ])("rejects noncanonical or URL image input %s", async content => {
    await expect(
      decodeBookingImage(content, "image/png")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects whitespace and missing padding on otherwise real image input", async () => {
    const base64 = png().toString("base64");
    await expect(
      decodeBookingImage(base64 + " ", "image/png")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const withPadding = Buffer.concat([png(), Buffer.from([0])]).toString(
      "base64"
    );
    await expect(
      decodeBookingImage(withPadding.replace(/=+$/, ""), "image/png")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it.each([
    "image/gif",
    "image/svg+xml",
    "image/heic",
    "image/avif",
    "application/octet-stream",
    "IMAGE/PNG",
    "image/png; charset=utf-8",
    "",
  ])("rejects an arbitrary MIME %s before decoding", async mime => {
    await expect(
      decodeBookingImage(png().toString("base64"), mime)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it.each(BOOKING_IMAGE_MIMES)("rejects bytes mislabeled as %s", async mime => {
    for (const [realMime, bytes] of fixtures) {
      if (realMime !== mime)
        await expect(
          decodeBookingImage(bytes.toString("base64"), mime)
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });
  it("never renders SVG, even when its contents or MIME claim PNG", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"><rect width="12" height="8" fill="blue"/></svg>'
    );
    await expect(
      decodeBookingImage(svg.toString("base64"), "image/png")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      decodeBookingImage(svg.toString("base64"), "image/svg+xml")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it.each(["gif", "tiff", "avif"] as const)(
    "rejects real unsupported %s bytes",
    async format => {
      const bytes = await rawGeometry()[format]().toBuffer();
      await expect(
        decodeBookingImage(bytes.toString("base64"), "image/png")
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  );
  it.each(BOOKING_IMAGE_MIMES)(
    "rejects truncated %s and extra trailing payload",
    async mime => {
      const bytes = fixtures.get(mime)!;
      await expect(
        decodeBookingImage(
          bytes.subarray(0, bytes.length - 10).toString("base64"),
          mime
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        decodeBookingImage(
          Buffer.concat([bytes, Buffer.from("trailing payload")]).toString(
            "base64"
          ),
          mime
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  );
  it("fully decodes PNG pixel data, not just valid image headers", async () => {
    const corrupted = mapPng(png(), ({ type, data }) =>
      pngChunk(type, type === "IDAT" ? Buffer.alloc(data.length, 0) : data)
    );
    expect((await sharp(corrupted).metadata()).width).toBe(12);
    await expect(
      decodeBookingImage(corrupted.toString("base64"), "image/png")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects a forged pixel bomb with tiny compressed input", async () => {
    const bomb = mapPng(png(), ({ type, data }) => {
      if (type !== "IHDR") return pngChunk(type, data);
      const header = Buffer.from(data);
      header.writeUInt32BE(8000, 0);
      header.writeUInt32BE(8000, 4);
      return pngChunk(type, header);
    });
    expect(bomb.length).toBeLessThan(1000);
    await expect(
      decodeBookingImage(bomb.toString("base64"), "image/png")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects real over-limit pixel images before full decoding", async () => {
    const bytes = await sharp({
      create: { width: 8000, height: 4001, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    expect((await sharp(bytes).metadata()).width * 4001).toBeGreaterThan(
      BOOKING_MAX_IMAGE_PIXELS
    );
    expect(bytes.length).toBeLessThan(BOOKING_MAX_BYTES);
    await expect(
      decodeBookingImage(bytes.toString("base64"), "image/png")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }, 20000);
  it("rejects a real overlong edge even below the pixel cap", async () => {
    const bytes = await sharp({
      create: {
        width: BOOKING_MAX_IMAGE_EDGE + 1,
        height: 1,
        channels: 3,
        background: "blue",
      },
    })
      .png()
      .toBuffer();
    await expect(
      decodeBookingImage(bytes.toString("base64"), "image/png")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("accepts the byte limit without regex recursion and rejects one extra decoded byte", async () => {
    const chunks = pngChunks(png());
    const insertAt = png().length - 12;
    const overhead = Buffer.byteLength("Fixture\0") + 12;
    const padding = Buffer.alloc(
      BOOKING_MAX_BYTES - png().length - overhead,
      65
    );
    const padded = Buffer.concat([
      png().subarray(0, insertAt),
      pngChunk("tEXt", Buffer.concat([Buffer.from("Fixture\0"), padding])),
      png().subarray(insertAt),
    ]);
    expect(chunks.at(-1)?.type).toBe("IEND");
    expect(padded.length).toBe(BOOKING_MAX_BYTES);
    const result = await decodeBookingImage(
      padded.toString("base64"),
      "image/png"
    );
    expect(result.bytes.length).toBeLessThan(1000);
    await expect(
      decodeBookingImage(
        Buffer.concat([padded, Buffer.from([0])]).toString("base64"),
        "image/png"
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects sanitized output beyond the limit without cropping or returning original metadata", async () => {
    // High-entropy geometry models incompressible pixels; compressed JPEG fits
    // input cap but high-quality metadata-free output may not. No source text.
    const width = 2800,
      height = 2200;
    const pixels = Buffer.alloc(width * height * 3);
    let state = 123456;
    for (let i = 0; i < pixels.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      pixels[i] = state & 255;
    }
    const bytes = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 40 })
      .toBuffer();
    expect(bytes.length).toBeLessThan(BOOKING_MAX_BYTES);
    const reencoded = await sharp(bytes)
      .rotate()
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer();
    expect(reencoded.length).toBeGreaterThan(BOOKING_MAX_BYTES);
    await expect(
      decodeBookingImage(bytes.toString("base64"), "image/jpeg")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }, 20000);
});

describe("single image and metadata safety", () => {
  it("rejects real animated WebP instead of passing its first frame", async () => {
    const bytes = await sharp(geometry(8, 16), {
      raw: { width: 8, height: 16, channels: 3, pageHeight: 8 },
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(bytes).metadata()).pages).toBe(2);
    await expect(
      decodeBookingImage(bytes.toString("base64"), "image/webp")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it.each(["acTL", "fcTL", "fdAT"])(
    "rejects PNG %s animation chunks even if decoder sees a static PNG",
    async type => {
      const extra = pngChunk(
        type,
        type === "acTL"
          ? Buffer.from([0, 0, 0, 1, 0, 0, 0, 0])
          : Buffer.alloc(26)
      );
      const bytes = Buffer.concat([
        png().subarray(0, 33),
        extra,
        png().subarray(33),
      ]);
      await expect(
        decodeBookingImage(bytes.toString("base64"), "image/png")
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  );
  it("rejects a WebP animation flag even without multiple frames", async () => {
    const bytes = await rawGeometry().withMetadata().webp().toBuffer();
    expect(bytes.toString("ascii", 12, 16)).toBe("VP8X");
    bytes[20] |= 2;
    await expect(
      decodeBookingImage(bytes.toString("base64"), "image/webp")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects JPEG MPO markers and concatenated pages", async () => {
    const jpeg = fixtures.get("image/jpeg")!;
    const app2 = Buffer.from([0xff, 0xe2, 0, 6, 0x4d, 0x50, 0x46, 0]);
    const mpo = Buffer.concat([jpeg.subarray(0, 2), app2, jpeg.subarray(2)]);
    await expect(
      decodeBookingImage(mpo.toString("base64"), "image/jpeg")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      decodeBookingImage(
        Buffer.concat([jpeg, jpeg]).toString("base64"),
        "image/jpeg"
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("accepts progressive JPEG with multiple scans, not multiple pages", async () => {
    const bytes = await rawGeometry().jpeg({ progressive: true }).toBuffer();
    const result = await decodeBookingImage(
      bytes.toString("base64"),
      "image/jpeg"
    );
    expect(result).toMatchObject({ width: 12, height: 8 });
  });
  it.each(BOOKING_IMAGE_MIMES)(
    "strips EXIF, ICC and XMP from %s and auto-orients",
    async mime => {
      const withMetadata = rawGeometry()
        .withMetadata({ orientation: 6 })
        .withExifMerge({ IFD0: { Artist: "Metadata fixture" } })
        .withXmp(
          '<x:xmpmeta xmlns:x="adobe:ns:meta/">Fixture metadata</x:xmpmeta>'
        );
      const bytes = await (
        mime === "image/png"
          ? withMetadata.png()
          : mime === "image/jpeg"
            ? withMetadata.jpeg()
            : withMetadata.webp()
      ).toBuffer();
      const original = await sharp(bytes).metadata();
      expect(original.exif).toBeDefined();
      expect(original.icc).toBeDefined();
      const result = await decodeBookingImage(bytes.toString("base64"), mime);
      const cleaned = await sharp(result.bytes).metadata();
      expect(result).toMatchObject({ width: 8, height: 12 });
      for (const field of [
        "orientation",
        "exif",
        "icc",
        "iptc",
        "xmp",
        "comments",
      ] as const)
        expect(cleaned[field]).toBeUndefined();
      expect(cleaned.hasProfile).toBe(false);
      expect(result.bytes.includes(Buffer.from("Metadata fixture"))).toBe(
        false
      );
    }
  );
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    "preserves orientation %s including mirrored geometry exactly",
    async orientation => {
      const bytes = await rawGeometry()
        .withMetadata({ orientation })
        .png()
        .toBuffer();
      const result = await decodeBookingImage(
        bytes.toString("base64"),
        "image/png"
      );
      const expected = await sharp(bytes)
        .rotate()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const actual = await sharp(result.bytes)
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(actual.data).toEqual(expected.data);
      expect(actual.info.width).toBe(expected.info.width);
      expect(actual.info.height).toBe(expected.info.height);
    }
  );
  it("preserves PNG transparency", async () => {
    const bytes = await sharp({
      create: {
        width: 12,
        height: 8,
        channels: 4,
        background: { r: 30, g: 100, b: 180, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const result = await decodeBookingImage(
      bytes.toString("base64"),
      "image/png"
    );
    expect(await sharp(result.bytes).raw().toBuffer()).toEqual(
      await sharp(bytes).raw().toBuffer()
    );
  });
  it("does not cache sensitive libvips operations", () => {
    expect(sharp.cache()).toMatchObject({
      memory: { max: 0 },
      files: { max: 0 },
      items: { max: 0 },
    });
  });
});

describe("authorized native vision booking preview", () => {
  it("requires authentication before decoding or DB access", async () => {
    await expect(
      caller(null).analyze(imageInput("bad image"))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mock.getDb).not.toHaveBeenCalled();
    expect(llm).not.toHaveBeenCalled();
  });
  it.each(["viewer", "guest", "unknown"])(
    "denies %s before full image validation or AI",
    async value => {
      role = value;
      await expect(
        caller().analyze(imageInput("bad image"))
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(llm).not.toHaveBeenCalled();
    }
  );
  it("requires matching membership and accessible trip before validation", async () => {
    mock.getUserMembership.mockResolvedValue({
      tripId: 11,
      userId: 7,
      role: "editor",
    } as any);
    await expect(
      caller().analyze(imageInput("bad image"))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    mock.getUserMembership.mockResolvedValue({
      tripId: 10,
      userId: 7,
      role: "editor",
    } as any);
    mock.getTripById.mockResolvedValue({ id: 11 } as any);
    await expect(
      caller().analyze(imageInput("bad image"))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(llm).not.toHaveBeenCalled();
  });
  it("rejects invalid authorized images before any AI call or writes with a safe error", async () => {
    await expect(
      caller().analyze(
        imageInput(Buffer.from("PRIVATE SOURCE PAYLOAD").toString("base64"))
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().analyze(imageInput("PRIVATE SOURCE PAYLOAD"))
    ).rejects.not.toThrow("PRIVATE SOURCE PAYLOAD");
    expect(llm).not.toHaveBeenCalled();
    expect(mock.addFlight).not.toHaveBeenCalled();
    expect(mock.addAccommodation).not.toHaveBeenCalled();
  });
  it.each(BOOKING_IMAGE_MIMES)(
    "sends sanitized %s as native high-detail inline image, never OCR text/file input",
    async mime => {
      const bytes = fixtures.get(mime)!;
      const expected = await decodeBookingImage(bytes.toString("base64"), mime);
      const draft = await caller().analyze({
        ...imageInput(bytes.toString("base64"), mime),
        filename: "private-filename.png",
      });
      const request = llm.mock.calls[0][0];
      expect(request).toMatchObject({
        model: "gemini-3.8-flash",
        reasoning: { effort: "low" },
        max_tokens: 8192,
        timeoutMs: 90000,
        response_format: {
          type: "json_schema",
          json_schema: {
            strict: true,
            schema: {
              additionalProperties: false,
              required: ["flights", "hotels", "warnings"],
            },
          },
        },
      });
      expect(request.tools).toBeUndefined();
      expect(request.messages[1].content).toEqual([
        {
          type: "text",
          text: expect.stringContaining("MUST remain unknown (empty strings)"),
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${mime};base64,${expected.bytes.toString("base64")}`,
            detail: "high",
          },
        },
      ]);
      expect(request.messages[0].content).toContain("UNTRUSTED");
      expect(JSON.stringify(request)).not.toContain("private-filename");
      expect(draft.warnings.join(" ")).toContain("Cropped, blurry");
      expect(draft).not.toHaveProperty("content");
      expect(draft).not.toHaveProperty("image");
      expect(mock.addFlight).not.toHaveBeenCalled();
      expect(mock.addAccommodation).not.toHaveBeenCalled();
      expect(mock.addExpense).not.toHaveBeenCalled();
    }
  );
  it("has deterministic, scoped sanitized source fingerprints across data URI/filename variants", async () => {
    const base64 = png().toString("base64");
    const first = await caller().analyze({
      ...imageInput(base64),
      filename: "first.png",
    });
    const second = await caller().analyze({
      ...imageInput(`data:image/png;base64,${base64}`),
      filename: "second.png",
    });
    expect(second.sourceHash).toBe(first.sourceHash);
    const sanitized = await decodeBookingImage(base64, "image/png");
    const sha = (value: Buffer | string) =>
      createHash("sha256").update(value).digest("hex");
    expect(first.sourceHash).toBe(sha(`10:7:image:${sha(sanitized.bytes)}`));
    expect((await caller(8).analyze(imageInput(base64))).sourceHash).not.toBe(
      first.sourceHash
    );
  });
  it("keeps signed preview edits and deduplication without storing the image", async () => {
    output({
      flights: [{ airline: "Fixture Airline" }],
      hotels: [],
      warnings: ["PRIVATE WARNING SHOULD NOT RETURN"],
    });
    const draft = await caller().analyze(imageInput());
    expect(draft.flights[0]).toMatchObject({
      airline: "Fixture Airline",
      date: "",
      fromCode: "",
      toCode: "",
    });
    expect(draft.warnings.join(" ")).not.toContain("PRIVATE WARNING");
    expect(draft.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(draft.previewToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    const proof = JSON.parse(
      Buffer.from(draft.previewToken.split(".")[0], "base64url").toString(
        "utf8"
      )
    );
    expect(Object.keys(proof).sort()).toEqual([
      "expires",
      "issuedAt",
      "sourceHash",
      "tripId",
      "userId",
    ]);
    const selection = {
      tripId: 10,
      sourceHash: draft.sourceHash,
      previewToken: draft.previewToken,
      flights: draft.flights,
      hotels: [],
    };
    await expect(caller().import(selection)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mock.addFlight).not.toHaveBeenCalled();
    const edited = bookingFlightSchema.parse({
      ...draft.flights[0],
      date: "2026-11-12",
      fromCode: "HKG",
      toCode: "NRT",
      flightNumber: "TEST12",
    });
    const confirmed = { ...selection, flights: [edited] };
    expect(await caller().import(confirmed)).toEqual({
      flightsCreated: 1,
      hotelsCreated: 0,
      skipped: 0,
    });
    expect(await caller().import(confirmed)).toEqual({
      flightsCreated: 0,
      hotelsCreated: 0,
      skipped: 1,
    });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(png().toString("base64"));
    expect(rows[0].notes).toContain(
      `[voyageai:booking:v1:trip:10:${draft.sourceHash}:flight:`
    );
    expect(mock.addExpense).not.toHaveBeenCalled();
    expect(mock.updateFlight).not.toHaveBeenCalled();
  });
  it.each([
    "not JSON",
    { flights: [], hotels: [], warnings: [], extra: "unsafe" },
    { flights: [{ airline: 1 }], hotels: [], warnings: [] },
    { flights: [{ unknown: "unsafe" }], hotels: [], warnings: [] },
  ])(
    "rejects unsafe vision output with strict editable preview schema",
    async value => {
      output(value);
      await expect(caller().analyze(imageInput())).rejects.toMatchObject({
        code: "BAD_GATEWAY",
      });
      expect(mock.addFlight).not.toHaveBeenCalled();
    }
  );
  it("rejects model truncation/tool calls and hides provider/image bytes without logs", async () => {
    output(undefined, "length");
    await expect(caller().analyze(imageInput())).rejects.toMatchObject({
      code: "BAD_GATEWAY",
    });
    output();
    llm.mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify({ flights: [], hotels: [], warnings: [] }),
            tool_calls: [{ id: "bad" }],
          },
          finish_reason: "stop",
        },
      ],
    } as any);
    await expect(caller().analyze(imageInput())).rejects.toMatchObject({
      code: "BAD_GATEWAY",
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    llm.mockRejectedValue(
      new Error(`PRIVATE PROVIDER BODY ${png().toString("base64")}`)
    );
    await expect(caller().analyze(imageInput())).rejects.not.toThrow(
      "PRIVATE PROVIDER BODY"
    );
    expect(errorLog).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
  it("requires image-only MIME and rejects unknown keys at the shared contract", () => {
    expect(bookingAnalyzeInput.safeParse(imageInput()).success).toBe(true);
    expect(
      bookingAnalyzeInput.safeParse({
        tripId: 10,
        kind: "image",
        content: "YWJj",
      }).success
    ).toBe(false);
    expect(
      bookingAnalyzeInput.safeParse({
        ...imageInput(),
        mimeType: "image/svg+xml",
      }).success
    ).toBe(false);
    expect(
      bookingAnalyzeInput.safeParse({
        ...imageInput(),
        url: "https://example.test",
      }).success
    ).toBe(false);
    expect(
      bookingAnalyzeInput.safeParse({ ...imageInput(), kind: "email" }).success
    ).toBe(false);
  });
});
