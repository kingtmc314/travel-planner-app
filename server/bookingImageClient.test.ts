import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  BookingImageError,
  inspectBookingImage,
  isBookingImageMime,
  prepareBookingImage,
  validateBookingImageDimensions,
} from "../client/src/lib/bookingImage";
import {
  BOOKING_MAX_BYTES,
  BOOKING_MAX_IMAGE_INPUT_BYTES,
  BOOKING_MAX_IMAGE_PIXELS,
  BOOKING_MAX_IMAGE_EDGE,
  bookingAnalyzeInput,
} from "../shared/bookingImport";

const ui = vi.hoisted(() => ({
  lang: "zh",
  mutateAsync: vi.fn(),
  invalidate: vi.fn(),
  reset: vi.fn(),
  pending: false,
}));
// No jsdom dependency: exercise event handlers with a small hook state driver,
// while retaining real React for SSR and element creation outside these tests.
const hookDriver = vi.hoisted(() => ({ current: null as any }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: any) =>
      hookDriver.current
        ? hookDriver.current.state(initial)
        : actual.useState(initial),
    useRef: (initial: any) =>
      hookDriver.current
        ? hookDriver.current.ref(initial)
        : actual.useRef(initial),
    useEffect: (effect: any, deps: any) =>
      hookDriver.current
        ? hookDriver.current.effect(effect, deps)
        : actual.useEffect(effect, deps),
  };
});
vi.mock("@/hooks/useI18n", () => ({ useI18n: () => ({ lang: ui.lang }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ invalidate: ui.invalidate }),
    bookingImport: {
      analyze: {
        useMutation: () => ({
          mutateAsync: ui.mutateAsync,
          isPending: ui.pending,
          reset: ui.reset,
        }),
      },
      import: {
        useMutation: () => ({
          mutateAsync: ui.mutateAsync,
          isPending: ui.pending,
          reset: ui.reset,
        }),
      },
    },
  },
}));
vi.mock("@/components/ui/dialog", () => {
  const div = ({ children }: any) => createElement("div", null, children);
  return {
    Dialog: div,
    DialogContent: div,
    DialogHeader: div,
    DialogTitle: div,
    DialogDescription: div,
  };
});
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, variant, size, ...props }: any) =>
    createElement("button", props, children),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => createElement("input", props),
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) =>
    createElement("label", props, children),
}));
import BookingImportDialog from "../client/src/components/BookingImportDialog";

// These synthetic containers test only header boundaries, not real codecs.
// Real sharp fixtures below also cover each supported file format.
function png(width: number, height: number, padding = 0) {
  const chunk = (name: string, data: Uint8Array) => {
    const output = Buffer.alloc(data.length + 12);
    output.writeUInt32BE(data.length);
    output.write(name, 4, 4, "ascii");
    output.set(data, 8);
    return output;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    ...(padding ? [chunk("tEXt", Buffer.alloc(padding))] : []),
    chunk("IDAT", Buffer.from([1])),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function jpeg(width: number, height: number) {
  const output = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0, 8, 8, 0, 0, 0, 0, 1, 0xff, 0xda, 0, 2, 1, 0xff,
    0xd9,
  ]);
  output.writeUInt16BE(height, 7);
  output.writeUInt16BE(width, 9);
  return output;
}
function webp(width: number, height: number) {
  const output = Buffer.alloc(26);
  output.write("RIFF");
  output.writeUInt32LE(18, 4);
  output.write("WEBPVP8L", 8);
  output.writeUInt32LE(5, 16);
  output[20] = 0x2f;
  output.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return output;
}
function blob(bytes: Uint8Array, type = "image/png") {
  return new Blob([new Uint8Array(bytes)], { type });
}
async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    name: "BookingImageError",
    code,
  });
}

let objectBlobs: Map<string, Blob>;
let createUrl: ReturnType<typeof vi.fn>, revokeUrl: ReturnType<typeof vi.fn>;
let decodeFails: boolean, encodeFails: boolean, alwaysTooLarge: boolean;
let encoderType: string | undefined;
let drawn: Array<{ width: number; height: number; args: unknown[] }>;
let qualities: number[];
let canvases: Array<{ width: number; height: number }>;
function browserMocks() {
  objectBlobs = new Map();
  let sequence = 0;
  createUrl = vi.fn((value: Blob) => {
    const url = `blob:test-${++sequence}`;
    objectBlobs.set(url, value);
    return url;
  });
  revokeUrl = vi.fn((url: string) => objectBlobs.delete(url));
  vi.stubGlobal("URL", {
    createObjectURL: createUrl,
    revokeObjectURL: revokeUrl,
  });
  class FakeImage {
    naturalWidth = 0;
    naturalHeight = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(url: string) {
      if (!url) return;
      const value = objectBlobs.get(url)!;
      void value.arrayBuffer().then(bytes => {
        if (decodeFails) {
          this.onerror?.();
          return;
        }
        const header = inspectBookingImage(new Uint8Array(bytes));
        this.naturalWidth = header.width;
        this.naturalHeight = header.height;
        this.onload?.();
      });
    }
  }
  vi.stubGlobal("Image", FakeImage);
  class FakeReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    readAsDataURL(value: Blob) {
      void value.arrayBuffer().then(bytes => {
        this.result = `data:${value.type};base64,${Buffer.from(bytes).toString("base64")}`;
        this.onload?.();
      });
    }
  }
  vi.stubGlobal("FileReader", FakeReader);
  vi.stubGlobal("document", {
    createElement: vi.fn((name: string) => {
      expect(name).toBe("canvas");
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          imageSmoothingEnabled: false,
          imageSmoothingQuality: "low",
          drawImage: (...args: unknown[]) =>
            drawn.push({ width: canvas.width, height: canvas.height, args }),
        }),
        toBlob: (
          callback: (value: Blob | null) => void,
          requestedType: string,
          quality: number
        ) => {
          qualities.push(quality);
          if (encodeFails) {
            callback(null);
            return;
          }
          const type = encoderType ?? requestedType;
          const data =
            type === "image/jpeg"
              ? jpeg(canvas.width, canvas.height)
              : type === "image/webp"
                ? webp(canvas.width, canvas.height)
                : png(canvas.width, canvas.height);
          callback(
            blob(
              alwaysTooLarge
                ? png(canvas.width, canvas.height, BOOKING_MAX_BYTES)
                : data,
              type
            )
          );
        },
      };
      canvases.push(canvas);
      return canvas;
    }),
  });
}
beforeEach(() => {
  ui.lang = "zh";
  ui.pending = false;
  ui.mutateAsync.mockReset();
  ui.invalidate.mockReset();
  ui.reset.mockReset();
  hookDriver.current = null;
  decodeFails = false;
  encodeFails = false;
  alwaysTooLarge = false;
  encoderType = undefined;
  drawn = [];
  qualities = [];
  canvases = [];
  browserMocks();
});
afterEach(() => {
  hookDriver.current = null;
  vi.unstubAllGlobals();
});

describe("booking screenshot safe header inspection", () => {
  it("accepts only the exact three MIME types", () => {
    expect(
      ["image/png", "image/jpeg", "image/webp"].map(isBookingImageMime)
    ).toEqual([true, true, true]);
    for (const type of [
      "image/jpg",
      "image/svg+xml",
      "image/gif",
      "image/heic",
      "image/avif",
      "IMAGE/PNG",
      "text/plain",
      "",
    ])
      expect(isBookingImageMime(type)).toBe(false);
  });
  it.each(["png", "jpeg", "webp"] as const)(
    "recognizes a real %s with exact dimensions",
    async format => {
      const bytes = await sharp({
        create: { width: 40, height: 20, channels: 4, background: "#89aabc" },
      })
        [format]()
        .toBuffer();
      expect(inspectBookingImage(bytes)).toEqual({
        mimeType: `image/${format}`,
        width: 40,
        height: 20,
      });
    }
  );
  it("does not trust filenames, claimed MIME or broken bytes", async () => {
    await expectCode(
      prepareBookingImage(blob(png(40, 20), "image/jpeg")),
      "format"
    );
    await expectCode(
      prepareBookingImage(blob(Buffer.from("not an image"))),
      "format"
    );
    await expectCode(
      prepareBookingImage(blob(png(40, 20), "image/svg+xml")),
      "format"
    );
    expect(() => inspectBookingImage(png(40, 20).subarray(0, 25))).toThrow(
      BookingImageError
    );
    expect(() => inspectBookingImage(jpeg(40, 20).subarray(0, 16))).toThrow(
      BookingImageError
    );
    expect(() => inspectBookingImage(webp(40, 20).subarray(0, 23))).toThrow(
      BookingImageError
    );
  });
  it("guards pixel and edge limits before any decode or canvas allocation", async () => {
    for (const [width, height] of [
      [8000, 4001],
      [BOOKING_MAX_IMAGE_EDGE + 1, 1],
      [0, 1],
    ]) {
      await expectCode(
        prepareBookingImage(blob(png(width, height))),
        "dimensions"
      );
    }
    expect(createUrl).not.toHaveBeenCalled();
    expect(document.createElement).not.toHaveBeenCalled();
    expect(() => validateBookingImageDimensions(8000, 4000)).not.toThrow();
    expect(() =>
      validateBookingImageDimensions(BOOKING_MAX_IMAGE_EDGE, 1)
    ).not.toThrow();
    for (const value of [NaN, Infinity, 0, -1, 1.5])
      expect(() => validateBookingImageDimensions(value, 1)).toThrow();
    expect(BOOKING_MAX_IMAGE_PIXELS).toBe(32_000_000);
  });
  it("rejects huge or empty raw input before allocating its bytes", async () => {
    const arrayBuffer = vi.fn();
    await expectCode(
      prepareBookingImage({
        size: BOOKING_MAX_IMAGE_INPUT_BYTES + 1,
        type: "image/png",
        arrayBuffer,
      } as any),
      "size"
    );
    await expectCode(prepareBookingImage(blob(new Uint8Array())), "size");
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();
  });
  it("rejects APNG and animated WebP rather than hiding other frames", () => {
    const source = png(40, 20),
      actl = Buffer.alloc(20);
    actl.writeUInt32BE(8);
    actl.write("acTL", 4);
    expect(() =>
      inspectBookingImage(
        Buffer.concat([source.subarray(0, 33), actl, source.subarray(33)])
      )
    ).toThrow(expect.objectContaining({ code: "animated" }));
    const animated = Buffer.alloc(30);
    animated.write("RIFF");
    animated.writeUInt32LE(22, 4);
    animated.write("WEBPVP8X", 8);
    animated.writeUInt32LE(10, 16);
    animated[20] = 2;
    expect(() => inspectBookingImage(animated)).toThrow(
      expect.objectContaining({ code: "animated" })
    );
  });
  it("checks PNG chunk and WebP RIFF bounds without inflating any data", () => {
    const source = png(40, 20);
    source.writeUInt32BE(0xffffffff, 33);
    expect(() => inspectBookingImage(source)).toThrow(
      expect.objectContaining({ code: "broken" })
    );
    const sourceWebp = webp(40, 20);
    sourceWebp.writeUInt32LE(0xffffffff, 16);
    expect(() => inspectBookingImage(sourceWebp)).toThrow(
      expect.objectContaining({ code: "broken" })
    );
  });
});

describe("local browser preparation", () => {
  it.each(["png", "jpeg", "webp"] as const)(
    "preserves small original %s bytes and sends plain base64 only",
    async format => {
      const bytes = await sharp({
        create: { width: 40, height: 20, channels: 3, background: "white" },
      })
        [format]()
        .toBuffer();
      const prepared = await prepareBookingImage(
        blob(bytes, `image/${format}`)
      );
      expect(prepared.compressed).toBe(false);
      expect(prepared.resized).toBe(false);
      expect(Buffer.from(prepared.base64, "base64")).toEqual(bytes);
      expect(prepared.base64).not.toContain("data:");
      expect(document.createElement).not.toHaveBeenCalled();
      expect(createUrl).toHaveBeenCalledOnce();
      expect(revokeUrl).toHaveBeenCalledOnce();
      expect(objectBlobs.size).toBe(0);
      expect(
        bookingAnalyzeInput.safeParse({
          tripId: 1,
          kind: "image",
          mimeType: prepared.mimeType,
          content: prepared.base64,
        }).success
      ).toBe(true);
    }
  );
  it("infers genuine bytes when the OS supplies no MIME type", async () => {
    const prepared = await prepareBookingImage(blob(png(40, 20), ""));
    expect(prepared.mimeType).toBe("image/png");
  });
  it("handles browser decode errors with safe URL cleanup", async () => {
    decodeFails = true;
    await expectCode(prepareBookingImage(blob(png(40, 20))), "broken");
    expect(createUrl).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledOnce();
    expect(document.createElement).not.toHaveBeenCalled();
  });
  it("proportionally shrinks a large image, without cropping, and cleans canvas memory", async () => {
    const prepared = await prepareBookingImage(
      blob(png(8000, 4000, BOOKING_MAX_BYTES))
    );
    expect(prepared.compressed).toBe(true);
    expect(prepared.resized).toBe(true);
    expect(prepared.width).toBe(4096);
    expect(prepared.height).toBe(2048);
    expect(prepared.mimeType).toBe("image/webp");
    expect(prepared.blob.size).toBeLessThanOrEqual(BOOKING_MAX_BYTES);
    expect(drawn[0].args).toHaveLength(5); // full image draw, not the 9-argument crop form
    expect(drawn[0].args.slice(1)).toEqual([0, 0, 4096, 2048]);
    expect(qualities).toEqual([0.92]);
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
  });
  it("compresses without upscaling when the original already has small dimensions", async () => {
    const prepared = await prepareBookingImage(
      blob(png(400, 200, BOOKING_MAX_BYTES))
    );
    expect(prepared.width).toBe(400);
    expect(prepared.height).toBe(200);
    expect(prepared.resized).toBe(false);
    expect(prepared.compressed).toBe(true);
  });
  it("uses the browser's real encoder fallback MIME without lying or flattening alpha", async () => {
    encoderType = "image/png";
    const prepared = await prepareBookingImage(
      blob(png(400, 200, BOOKING_MAX_BYTES))
    );
    expect(prepared.mimeType).toBe("image/png");
    expect(
      inspectBookingImage(Buffer.from(prepared.base64, "base64")).mimeType
    ).toBe("image/png");
  });
  it("rejects failed encoders and clears allocations", async () => {
    encodeFails = true;
    await expectCode(
      prepareBookingImage(blob(png(400, 200, BOOKING_MAX_BYTES))),
      "compression"
    );
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
    expect(objectBlobs.size).toBe(0);
  });
  it("bounds attempts and rejects an image that never meets the upload limit", async () => {
    alwaysTooLarge = true;
    await expectCode(
      prepareBookingImage(blob(png(400, 200, BOOKING_MAX_BYTES))),
      "compression"
    );
    expect(qualities).toHaveLength(18);
    expect(drawn).toHaveLength(6);
    for (const frame of drawn) {
      expect(frame.width).toBeLessThanOrEqual(400);
      expect(frame.height).toBeLessThanOrEqual(200);
      expect(Math.abs(frame.width / frame.height - 2)).toBeLessThan(0.03);
    }
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
  });
  it("requires image MIME only for image requests; PDF/email behavior stays unchanged", () => {
    expect(
      bookingAnalyzeInput.safeParse({
        tripId: 1,
        kind: "image",
        content: "abc",
      }).success
    ).toBe(false);
    expect(
      bookingAnalyzeInput.safeParse({
        tripId: 1,
        kind: "pdf",
        mimeType: "image/png",
        content: "abc",
      }).success
    ).toBe(false);
    expect(
      bookingAnalyzeInput.safeParse({ tripId: 1, kind: "pdf", content: "abc" })
        .success
    ).toBe(true);
    expect(
      bookingAnalyzeInput.safeParse({
        tripId: 1,
        kind: "email",
        content: "Booking confirmation with enough source text.",
      }).success
    ).toBe(true);
  });
});

describe("booking import UI safety and responsive wording", () => {
  const render = (canEdit = true) =>
    renderToStaticMarkup(
      createElement(BookingImportDialog, {
        tripId: 1,
        open: true,
        canEdit,
        onOpenChange: vi.fn(),
      })
    );
  it("advertises the prominent third mode in Chinese without automatic parse or clipboard read", () => {
    const read = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { read } });
    const html = render();
    expect(html).toContain("截圖／相片");
    expect(html).toContain("貼上電郵");
    expect(html).toContain("選擇檔案");
    expect(html).toContain("flex flex-wrap gap-2");
    expect(html).toContain("min-h-10 whitespace-normal");
    expect(html).toContain("只有點擊「解析預訂」");
    expect(html).toContain("不會公開上傳");
    expect(html).toContain("關閉會清除本地預覽");
    expect(ui.mutateAsync).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it("keeps the third mode readable in English and restricts read-only/pending dialogs", () => {
    ui.lang = "en";
    expect(render()).toContain("Screenshot / photo");
    expect(render(false)).toContain("Read-only:");
    expect(render(false)).toContain('<fieldset disabled=""');
    ui.pending = true;
    expect(render()).toContain('<fieldset disabled=""');
    expect(ui.mutateAsync).not.toHaveBeenCalled();
  });
});

function dialogDriver() {
  const slots: any[] = [];
  let index = 0,
    queued: Array<() => void> = [];
  const sameDeps = (before: any[], after: any[]) =>
    before &&
    after &&
    before.length === after.length &&
    before.every((value, i) => Object.is(value, after[i]));
  const driver = {
    state(initial: any) {
      const slot = index++;
      if (!(slot in slots))
        slots[slot] = {
          value: typeof initial === "function" ? initial() : initial,
        };
      return [
        slots[slot].value,
        (next: any) => {
          slots[slot].value =
            typeof next === "function" ? next(slots[slot].value) : next;
        },
      ];
    },
    ref(initial: any) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    effect(effect: () => (() => void) | void, deps: any[]) {
      const slot = index++;
      if (!slots[slot] || !sameDeps(slots[slot].deps, deps)) {
        const before = slots[slot];
        queued.push(() => {
          before?.cleanup?.();
          slots[slot] = { deps, cleanup: effect() };
        });
      }
    },
  };
  let props = { tripId: 1, open: true, canEdit: true, onOpenChange: vi.fn() };
  const render = (changes: Partial<typeof props> = {}) => {
    props = { ...props, ...changes };
    index = 0;
    queued = [];
    hookDriver.current = driver;
    const tree = BookingImportDialog(props);
    hookDriver.current = null;
    for (const effect of queued) effect();
    return tree;
  };
  return { render, onOpenChange: props.onOpenChange };
}
function elements(tree: any, predicate: (element: any) => boolean): any[] {
  if (Array.isArray(tree))
    return tree.flatMap(value => elements(value, predicate));
  if (!React.isValidElement(tree)) return [];
  return [
    ...(predicate(tree) ? [tree] : []),
    ...elements((tree.props as any).children, predicate),
  ];
}
function textOf(value: any): string {
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (React.isValidElement(value)) return textOf((value.props as any).children);
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
function button(tree: any, text: string) {
  const found = elements(
    tree,
    element =>
      typeof element.props.onClick === "function" && textOf(element) === text
  )[0];
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}
function imagePicker(tree: any) {
  return elements(tree, element => element.props.id === "booking-image")[0];
}
const flushAsync = () => new Promise(resolve => setImmediate(resolve));
const fileFrom = (
  bytes = png(400, 200),
  name = "booking.png",
  type = "image/png"
) => Object.assign(blob(bytes, type), { name }) as File;

describe("booking image user interaction without browser DOM", () => {
  it("offers a photo picker with only three formats and no forced camera capture", () => {
    const dialog = dialogDriver();
    let tree = dialog.render();
    button(tree, "截圖／相片").props.onClick();
    tree = dialog.render();
    const input = imagePicker(tree);
    expect(input.props.accept).toBe(
      ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
    );
    expect(input.props.capture).toBeUndefined();
    expect(textOf(tree)).toContain("不裁切、不放大");
    expect(textOf(tree)).toContain("剪貼簿只會在你貼上或按下按鈕時讀取");
  });
  it("prepares and previews a chosen image but sends nothing until Parse booking", async () => {
    const dialog = dialogDriver();
    let tree = dialog.render();
    button(tree, "截圖／相片").props.onClick();
    tree = dialog.render();
    imagePicker(tree).props.onChange({
      target: { files: [fileFrom()], value: "source" },
    });
    await flushAsync();
    tree = dialog.render();
    tree = dialog.render();
    expect(textOf(tree)).toContain("保留原圖");
    expect(elements(tree, element => element.type === "img")).toHaveLength(1);
    expect(ui.mutateAsync).not.toHaveBeenCalled();
    ui.mutateAsync.mockResolvedValue({
      flights: [],
      hotels: [],
      warnings: [],
      sourceHash: "a".repeat(64),
      previewToken: "test",
    });
    button(tree, "解析預訂").props.onClick();
    await flushAsync();
    tree = dialog.render();
    const request = ui.mutateAsync.mock.calls[0][0];
    expect(request).toMatchObject({
      tripId: 1,
      kind: "image",
      mimeType: "image/png",
      filename: "booking.png",
    });
    expect(request.content).not.toContain("data:");
    expect(request).not.toHaveProperty("blob");
    expect(textOf(tree)).toContain("所有項目預設不選取");
    expect(textOf(tree)).toContain("已選 0 項");
  });
  it("paste events read only the user-provided image file, never the clipboard API", async () => {
    const read = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { read } });
    const dialog = dialogDriver();
    let tree = dialog.render();
    const preventDefault = vi.fn();
    const content = elements(
      tree,
      element => typeof element.props.onPaste === "function"
    )[0];
    content.props.onPaste({
      clipboardData: {
        items: [
          { kind: "file", type: "image/png", getAsFile: () => fileFrom() },
        ],
      },
      preventDefault,
    });
    await flushAsync();
    tree = dialog.render();
    tree = dialog.render();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
    expect(elements(tree, element => element.type === "img")).toHaveLength(1);
    expect(ui.mutateAsync).not.toHaveBeenCalled();
  });
  it("falls back gracefully on unavailable or denied clipboard and does not read autonomously", async () => {
    const dialog = dialogDriver();
    let tree = dialog.render();
    button(tree, "截圖／相片").props.onClick();
    tree = dialog.render();
    const click = vi.fn();
    imagePicker(tree).props.ref.current = { click };
    vi.stubGlobal("navigator", {});
    button(tree, "貼上剪貼簿圖片").props.onClick();
    await flushAsync();
    tree = dialog.render();
    expect(click).toHaveBeenCalledOnce();
    expect(textOf(tree)).toContain("不支援讀取圖片剪貼簿");
    const read = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    vi.stubGlobal("navigator", { clipboard: { read } });
    expect(read).not.toHaveBeenCalled();
    button(tree, "貼上剪貼簿圖片").props.onClick();
    await flushAsync();
    tree = dialog.render();
    expect(read).toHaveBeenCalledOnce();
    expect(textOf(tree)).toContain("Safari／權限限制");
    expect(ui.mutateAsync).not.toHaveBeenCalled();
  });
  it("locks close/modes while reading and ignores image results after an external close", async () => {
    const dialog = dialogDriver();
    let tree = dialog.render();
    button(tree, "截圖／相片").props.onClick();
    tree = dialog.render();
    const source = fileFrom();
    let resolveRead!: (bytes: ArrayBuffer) => void;
    source.arrayBuffer = () =>
      new Promise(resolve => {
        resolveRead = resolve;
      });
    imagePicker(tree).props.onChange({
      target: { files: [source], value: "" },
    });
    button(tree, "關閉").props.onClick();
    expect(dialog.onOpenChange).not.toHaveBeenCalled();
    button(tree, "貼上電郵").props.onClick();
    tree = dialog.render();
    expect(imagePicker(tree)).toBeTruthy();
    tree = dialog.render({ open: false });
    resolveRead(new Uint8Array(png(400, 200)).buffer);
    await flushAsync();
    tree = dialog.render({ open: true });
    tree = dialog.render();
    expect(elements(tree, element => element.type === "img")).toHaveLength(0);
    expect(button(tree, "解析預訂").props.disabled).toBe(true);
    expect(ui.reset).toHaveBeenCalled();
  });
  it("clears selected image and local object URL on mode changes", async () => {
    const dialog = dialogDriver();
    let tree = dialog.render();
    button(tree, "截圖／相片").props.onClick();
    tree = dialog.render();
    imagePicker(tree).props.onChange({
      target: { files: [fileFrom()], value: "" },
    });
    await flushAsync();
    tree = dialog.render();
    tree = dialog.render();
    expect(objectBlobs.size).toBe(1);
    button(tree, "貼上電郵").props.onClick();
    tree = dialog.render();
    tree = dialog.render();
    expect(objectBlobs.size).toBe(0);
    expect(button(tree, "解析預訂").props.disabled).toBe(true);
    expect(
      elements(tree, element => element.props.id === "booking-source")[0].props
        .value
    ).toBe("");
  });
  it("ignores parse results after the trip changes and leaves all selections empty", async () => {
    const dialog = dialogDriver();
    let tree = dialog.render();
    const input = elements(
      tree,
      element => element.props.id === "booking-source"
    )[0];
    input.props.onChange({
      target: { value: "Booking confirmation: HKG to NRT on 2026-11-12" },
    });
    tree = dialog.render();
    let resolveParse!: (result: any) => void;
    ui.mutateAsync.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveParse = resolve;
        })
    );
    button(tree, "解析預訂").props.onClick();
    tree = dialog.render({ tripId: 2 });
    tree = dialog.render();
    resolveParse({
      flights: [],
      hotels: [],
      warnings: ["stale warning"],
      sourceHash: "a".repeat(64),
      previewToken: "stale",
    });
    await flushAsync();
    tree = dialog.render();
    expect(textOf(tree)).not.toContain("stale warning");
    expect(textOf(tree)).not.toContain("已選");
    expect(button(tree, "解析預訂").props.disabled).toBe(true);
  });
});
