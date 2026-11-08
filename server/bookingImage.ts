import { TRPCError } from "@trpc/server";
import sharp from "sharp";
import {
  BOOKING_IMAGE_MIMES,
  BOOKING_MAX_BYTES,
  BOOKING_MAX_IMAGE_EDGE,
  BOOKING_MAX_IMAGE_PIXELS,
} from "../shared/bookingImport";

export type BookingImageMime = (typeof BOOKING_IMAGE_MIMES)[number];
export type BookingImage = {
  bytes: Buffer;
  mimeType: BookingImageMime;
  width: number;
  height: number;
};

// Booking screenshots are sensitive. Do not retain libvips operation/pixel caches.
sharp.cache(false);
const invalid = (): never => {
  // Decoder messages can contain source metadata. Never expose them or log input.
  throw new TRPCError({
    code: "BAD_REQUEST",
    message:
      "Invalid booking image. Use a complete, non-animated PNG, JPEG or WebP of at most 3 MB and 32 million pixels; compress the image without cropping and try again.",
  });
};

/** Reject animation/container extras that a first-frame decoder could ignore. */
function singleImageContainer(bytes: Buffer, mimeType: BookingImageMime): void {
  if (mimeType === "image/png") {
    if (
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return invalid();
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      const end = offset + 12 + length;
      if (end > bytes.length || ["acTL", "fcTL", "fdAT"].includes(type))
        return invalid();
      if (type === "IEND") {
        if (length !== 0 || end !== bytes.length) return invalid();
        return;
      }
      offset = end;
    }
    return invalid();
  }
  if (mimeType === "image/webp") {
    if (
      bytes.length < 12 ||
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP" ||
      bytes.readUInt32LE(4) + 8 !== bytes.length
    )
      return invalid();
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const type = bytes.toString("ascii", offset, offset + 4);
      const length = bytes.readUInt32LE(offset + 4);
      const end = offset + 8 + length + (length % 2);
      if (
        end > bytes.length ||
        type === "ANIM" ||
        type === "ANMF" ||
        (type === "VP8X" && (length < 10 || (bytes[offset + 8] & 0x02) !== 0))
      )
        return invalid();
      offset = end;
    }
    if (offset !== bytes.length) return invalid();
    return;
  }
  // JPEG marker traversal also rejects MPO (APP2 MPF) and concatenated images.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    return invalid();
  let offset = 2;
  let inScan = false;
  while (offset < bytes.length) {
    if (inScan && bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    if (bytes[offset++] !== 0xff) return invalid();
    while (bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return invalid();
    const marker = bytes[offset++];
    if (inScan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7)))
      continue;
    if (marker === 0xd9) {
      if (offset !== bytes.length) return invalid();
      return;
    }
    if (marker === 0xd8 || marker === 0) return invalid();
    if (marker === 0x01) continue;
    if (offset + 2 > bytes.length) return invalid();
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return invalid();
    if (
      marker === 0xe2 &&
      bytes.subarray(offset + 2, offset + 6).equals(Buffer.from("MPF\0"))
    )
      return invalid();
    offset += length;
    inScan = marker === 0xda;
  }
  return invalid();
}

/**
 * No URLs, files, SVG rendering, storage or OCR. Fully decode a single allowed
 * raster image, auto-orient and re-encode all pixels with metadata stripped.
 * The deterministic sanitized bytes can be used as the scoped source identity.
 */
export async function decodeBookingImage(
  content: string,
  mimeType: string
): Promise<BookingImage> {
  if (!BOOKING_IMAGE_MIMES.includes(mimeType as BookingImageMime))
    return invalid();
  const mime = mimeType as BookingImageMime;
  const prefix = `data:${mime};base64,`;
  const base64 = content.startsWith(prefix)
    ? content.slice(prefix.length)
    : content;
  if (
    !base64 ||
    base64.length > Math.ceil(BOOKING_MAX_BYTES / 3) * 4 ||
    base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  )
    return invalid();
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > BOOKING_MAX_BYTES || bytes.toString("base64") !== base64)
    return invalid();
  singleImageContainer(bytes, mime);
  try {
    const image = sharp(bytes, {
      failOn: "warning",
      limitInputPixels: BOOKING_MAX_IMAGE_PIXELS,
      unlimited: false,
    });
    const metadata = await image.metadata();
    const format = {
      "image/png": "png",
      "image/jpeg": "jpeg",
      "image/webp": "webp",
    }[mime];
    if (
      metadata.format !== format ||
      !Number.isSafeInteger(metadata.width) ||
      !Number.isSafeInteger(metadata.height) ||
      metadata.width < 1 ||
      metadata.height < 1 ||
      metadata.width > BOOKING_MAX_IMAGE_EDGE ||
      metadata.height > BOOKING_MAX_IMAGE_EDGE ||
      metadata.width * metadata.height > BOOKING_MAX_IMAGE_PIXELS ||
      (metadata.pages ?? 1) !== 1 ||
      metadata.pageHeight !== undefined ||
      metadata.loop !== undefined ||
      metadata.delay !== undefined
    )
      return invalid();
    // toBuffer, not metadata alone, forces complete pixel decoding. rotate()
    // applies EXIF orientation (including mirrors), never resizes or crops.
    const sanitized = image.rotate().timeout({ seconds: 20 });
    if (mime === "image/png")
      sanitized.png({ compressionLevel: 9, adaptiveFiltering: true });
    else if (mime === "image/jpeg")
      sanitized.jpeg({ quality: 90, chromaSubsampling: "4:4:4" });
    else sanitized.webp({ quality: 90, alphaQuality: 100 });
    // No keep/withMetadata/ICC calls: sharp strips all source metadata by default.
    const { data, info } = await sanitized.toBuffer({
      resolveWithObject: true,
    });
    const swapsEdges = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
    if (
      !data.length ||
      data.length > BOOKING_MAX_BYTES ||
      info.width !== (swapsEdges ? metadata.height : metadata.width) ||
      info.height !== (swapsEdges ? metadata.width : metadata.height)
    )
      return invalid();
    return {
      bytes: data,
      mimeType: mime,
      width: info.width,
      height: info.height,
    };
  } catch {
    return invalid();
  }
}
