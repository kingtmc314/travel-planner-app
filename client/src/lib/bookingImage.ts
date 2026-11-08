import {
  BOOKING_IMAGE_MIMES,
  BOOKING_MAX_BYTES,
  BOOKING_MAX_IMAGE_EDGE,
  BOOKING_MAX_IMAGE_INPUT_BYTES,
  BOOKING_MAX_IMAGE_PIXELS,
} from "@shared/bookingImport";

export type BookingImageMime = (typeof BOOKING_IMAGE_MIMES)[number];
export type BookingImageErrorCode =
  | "format"
  | "size"
  | "dimensions"
  | "broken"
  | "animated"
  | "compression";
export class BookingImageError extends Error {
  constructor(public readonly code: BookingImageErrorCode) {
    super(code);
    this.name = "BookingImageError";
  }
}
export type BookingImageHeader = {
  mimeType: BookingImageMime;
  width: number;
  height: number;
};
export type PreparedBookingImage = BookingImageHeader & {
  blob: Blob;
  base64: string;
  originalSize: number;
  originalWidth: number;
  originalHeight: number;
  compressed: boolean;
  resized: boolean;
};
export function isBookingImageMime(value: string): value is BookingImageMime {
  return BOOKING_IMAGE_MIMES.some(mime => mime === value);
}
export function validateBookingImageDimensions(width: number, height: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > BOOKING_MAX_IMAGE_EDGE ||
    height > BOOKING_MAX_IMAGE_EDGE ||
    width * height > BOOKING_MAX_IMAGE_PIXELS
  )
    throw new BookingImageError("dimensions");
}

/** Bounded header/chunk inspection BEFORE the browser allocates decoded pixels.
 * This is not a full image validator: browser decode and server validation follow.
 * MIME is determined from bytes, never from a filename or a clipboard claim.
 */
export function inspectBookingImage(bytes: Uint8Array): BookingImageHeader {
  const broken = (): never => {
    throw new BookingImageError("broken");
  };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...Array.from(bytes.subarray(offset, offset + length)));
  const result = (
    mimeType: BookingImageMime,
    width: number,
    height: number
  ) => {
    validateBookingImageDimensions(width, height);
    return { mimeType, width, height };
  };
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
  ) {
    if (
      bytes.length < 33 ||
      view.getUint32(8) !== 13 ||
      ascii(12, 4) !== "IHDR"
    )
      broken();
    const header = result("image/png", view.getUint32(16), view.getUint32(20));
    // Walk length-delimited chunks, without inflating IDAT or trusting dimensions.
    let offset = 8,
      hasData = false,
      ended = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      if (length > bytes.length - offset - 12) broken();
      const type = ascii(offset + 4, 4);
      if (type === "acTL" || type === "fcTL" || type === "fdAT")
        throw new BookingImageError("animated");
      if (type === "IDAT") hasData = true;
      offset += length + 12;
      if (type === "IEND") {
        ended = length === 0 && offset === bytes.length;
        break;
      }
    }
    if (!hasData || !ended) broken();
    return header;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    let header: BookingImageHeader | undefined;
    const frames = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
      0xcf,
    ]);
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) broken();
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0 || marker === 0xd9) broken();
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) broken();
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) broken();
      if (frames.has(marker)) {
        if (length < 8) broken();
        header = result(
          "image/jpeg",
          view.getUint16(offset + 5),
          view.getUint16(offset + 3)
        );
      }
      if (marker === 0xda) {
        if (
          !header ||
          bytes[bytes.length - 2] !== 0xff ||
          bytes[bytes.length - 1] !== 0xd9
        )
          broken();
        return header!;
      }
      offset += length;
    }
    return broken();
  }
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    if (view.getUint32(4, true) + 8 !== bytes.length) broken();
    const uint24 = (offset: number) =>
      bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
    let offset = 12,
      header: BookingImageHeader | undefined,
      hasImage = false;
    while (offset + 8 <= bytes.length) {
      const type = ascii(offset, 4),
        length = view.getUint32(offset + 4, true),
        start = offset + 8;
      if (length > bytes.length - start) broken();
      if (type === "ANIM" || type === "ANMF")
        throw new BookingImageError("animated");
      if (type === "VP8X") {
        if (length !== 10) broken();
        if (bytes[start] & 2) throw new BookingImageError("animated");
        header = result(
          "image/webp",
          uint24(start + 4) + 1,
          uint24(start + 7) + 1
        );
      } else if (type === "VP8 ") {
        if (length < 10 || ascii(start + 3, 3) !== "\x9d\x01\x2a") broken();
        const frame = result(
          "image/webp",
          view.getUint16(start + 6, true) & 0x3fff,
          view.getUint16(start + 8, true) & 0x3fff
        );
        if (
          header &&
          (header.width !== frame.width || header.height !== frame.height)
        )
          broken();
        header = frame;
        hasImage = true;
      } else if (type === "VP8L") {
        if (length < 5 || bytes[start] !== 0x2f) broken();
        const packed = view.getUint32(start + 1, true);
        if (packed >>> 29) broken();
        const frame = result(
          "image/webp",
          (packed & 0x3fff) + 1,
          ((packed >>> 14) & 0x3fff) + 1
        );
        if (
          header &&
          (header.width !== frame.width || header.height !== frame.height)
        )
          broken();
        header = frame;
        hasImage = true;
      }
      offset = start + length + (length % 2);
    }
    if (!header || !hasImage || offset !== bytes.length) broken();
    return header!;
  }
  throw new BookingImageError("format");
}

export function bookingBlobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new BookingImageError("broken"));
    reader.onabort = () => reject(new BookingImageError("broken"));
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.includes(",")) {
        reject(new BookingImageError("broken"));
        return;
      }
      resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const done = () => {
      URL.revokeObjectURL(url);
      image.onload = null;
      image.onerror = null;
    };
    image.onload = () => {
      done();
      resolve(image);
    };
    image.onerror = () => {
      done();
      reject(new BookingImageError("broken"));
    };
    image.src = url;
  });
}
function encodeCanvas(
  canvas: HTMLCanvasElement,
  mimeType: BookingImageMime,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob =>
        blob ? resolve(blob) : reject(new BookingImageError("compression")),
      mimeType,
      quality
    );
  });
}

/** Entirely local. Preserve valid <=3 MiB originals; larger images are re-encoded
 * with bounded canvas dimensions, quality and attempts. Never crop or upscale.
 * PNG/WebP use WebP to preserve transparency; browsers without a WebP encoder
 * can return PNG, but we never label fallback bytes as WebP or flatten content.
 */
export async function prepareBookingImage(
  file: Blob
): Promise<PreparedBookingImage> {
  if (!file.size || file.size > BOOKING_MAX_IMAGE_INPUT_BYTES)
    throw new BookingImageError("size");
  if (file.type && !isBookingImageMime(file.type))
    throw new BookingImageError("format");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = inspectBookingImage(bytes);
  if (file.type && file.type !== header.mimeType)
    throw new BookingImageError("format");
  const original = new Blob([bytes], { type: header.mimeType });
  const image = await decodeImage(original);
  const width = image.naturalWidth,
    height = image.naturalHeight;
  validateBookingImageDimensions(width, height);
  // Native JPEG decoding can apply EXIF orientation (swap the two axes).
  if (
    !(
      (width === header.width && height === header.height) ||
      (header.mimeType === "image/jpeg" &&
        width === header.height &&
        height === header.width)
    )
  )
    throw new BookingImageError("broken");
  const finish = async (
    blob: Blob,
    outputWidth: number,
    outputHeight: number
  ): Promise<PreparedBookingImage> => {
    if (blob.size > BOOKING_MAX_BYTES || !isBookingImageMime(blob.type))
      throw new BookingImageError("compression");
    const output = inspectBookingImage(
      new Uint8Array(await blob.arrayBuffer())
    );
    if (
      output.mimeType !== blob.type ||
      !(
        (output.width === outputWidth && output.height === outputHeight) ||
        (blob === original &&
          header.mimeType === "image/jpeg" &&
          output.width === outputHeight &&
          output.height === outputWidth)
      )
    )
      throw new BookingImageError("compression");
    return {
      ...output,
      blob,
      base64: await bookingBlobBase64(blob),
      originalSize: file.size,
      originalWidth: width,
      originalHeight: height,
      compressed: blob !== original,
      resized: outputWidth !== width || outputHeight !== height,
    };
  };
  if (original.size <= BOOKING_MAX_BYTES) {
    try {
      return await finish(original, width, height);
    } finally {
      image.src = "";
    }
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new BookingImageError("compression");
  const targetMime: BookingImageMime =
    header.mimeType === "image/jpeg" ? "image/jpeg" : "image/webp";
  const initialScale = Math.min(
    1,
    4096 / Math.max(width, height),
    Math.sqrt(16000000 / (width * height))
  );
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = initialScale * Math.pow(0.8, attempt);
      canvas.width = Math.max(1, Math.floor(width * scale));
      canvas.height = Math.max(1, Math.floor(height * scale));
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.92, 0.82, 0.7]) {
        const encoded = await encodeCanvas(canvas, targetMime, quality);
        if (encoded.size > 0 && encoded.size <= BOOKING_MAX_BYTES)
          return await finish(encoded, canvas.width, canvas.height);
      }
    }
    throw new BookingImageError("compression");
  } catch (error) {
    if (error instanceof BookingImageError) throw error;
    throw new BookingImageError("compression");
  } finally {
    canvas.width = canvas.height = 0;
    image.src = "";
  }
}
