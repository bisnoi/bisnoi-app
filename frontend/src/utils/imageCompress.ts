// Global client-side image compression.
// Any picked image that is larger than ~1MB is downscaled + re-encoded to JPEG so the
// upload/stored payload shrinks dramatically (typically 80-95% smaller). Images already
// under the threshold, non-image data URLs, and unsupported inputs are returned unchanged.
//
// Web  -> uses the browser Canvas API (no extra dependency).
// Native -> uses expo-image-manipulator if it is installed; otherwise returns the original
//           (the native picker is already invoked with a reduced quality).

import { Platform } from "react-native";

const ONE_MB = 1024 * 1024;

export type CompressOpts = {
  /** Only compress images larger than this many bytes. Default 1MB. */
  thresholdBytes?: number;
  /** Longest edge of the output image in px. Default 1600. */
  maxDim?: number;
  /** Try to bring the output under this many bytes. Default ~350KB. */
  targetBytes?: number;
  /** Lowest JPEG quality we will drop to. Default 0.42. */
  minQuality?: number;
};

const g: any = typeof globalThis !== "undefined" ? globalThis : {};

/** Approximate the decoded byte size of a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const idx = dataUrl.indexOf(",");
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

function isImageDataUrl(v?: string | null): v is string {
  return typeof v === "string" && v.startsWith("data:image/");
}

function compressWeb(dataUrl: string, maxDim: number, targetBytes: number, minQuality: number): Promise<string> {
  return new Promise((resolve) => {
    try {
      const ImageCtor = g.Image;
      const doc = g.document;
      if (!ImageCtor || !doc) return resolve(dataUrl);
      const img = new ImageCtor();
      img.onload = () => {
        try {
          let w = img.width || img.naturalWidth;
          let h = img.height || img.naturalHeight;
          if (!w || !h) return resolve(dataUrl);
          if (Math.max(w, h) > maxDim) {
            const s = maxDim / Math.max(w, h);
            w = Math.round(w * s);
            h = Math.round(h * s);
          }
          const canvas = doc.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(dataUrl);
          ctx.drawImage(img, 0, 0, w, h);
          let q = 0.72;
          let out = canvas.toDataURL("image/jpeg", q);
          while (dataUrlBytes(out) > targetBytes && q > minQuality) {
            q = Math.round((q - 0.1) * 100) / 100;
            out = canvas.toDataURL("image/jpeg", q);
          }
          // Only accept the result if it is actually smaller than the original.
          resolve(dataUrlBytes(out) < dataUrlBytes(dataUrl) ? out : dataUrl);
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
}

async function compressNative(dataUrl: string, maxDim: number): Promise<string> {
  try {
    // Optional dependency — only used when present, so web builds are unaffected.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ImageManipulator = require("expo-image-manipulator");
    const result = await ImageManipulator.manipulateAsync(
      dataUrl,
      [{ resize: { width: maxDim } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (result?.base64) return `data:image/jpeg;base64,${result.base64}`;
  } catch {
    // module not installed / manipulation failed -> fall back to original
  }
  return dataUrl;
}

function toJpegWeb(dataUrl: string, maxDim: number): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const ImageCtor = g.Image;
      const doc = g.document;
      if (!ImageCtor || !doc) return resolve(null);
      const img = new ImageCtor();
      img.onload = () => {
        try {
          let w = img.width || img.naturalWidth;
          let h = img.height || img.naturalHeight;
          if (!w || !h) return resolve(null);
          if (Math.max(w, h) > maxDim) {
            const s = maxDim / Math.max(w, h);
            w = Math.round(w * s);
            h = Math.round(h * s);
          }
          const canvas = doc.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        } catch {
          resolve(null);
        }
      };
      // Safari decodes HEIC natively; Chrome/Firefox do not and land here.
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch {
      resolve(null);
    }
  });
}

async function toJpegNative(dataUrl: string, maxDim: number): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ImageManipulator = require("expo-image-manipulator");
    const result = await ImageManipulator.manipulateAsync(
      dataUrl,
      [{ resize: { width: maxDim } }],
      { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    return result?.base64 ? `data:image/jpeg;base64,${result.base64}` : null;
  } catch {
    return null;
  }
}

/**
 * Force-convert an image data URL to JPEG.
 *
 * Unlike compressDataUrl this always re-encodes (no size threshold) and returns
 * null instead of silently falling back, which callers need for HEIC/HEIF —
 * formats the menu-extraction backend rejects outright.
 */
export async function convertToJpeg(dataUrl: string, maxDim = 1600): Promise<string | null> {
  if (!isImageDataUrl(dataUrl)) return null;
  try {
    return Platform.OS === "web" ? await toJpegWeb(dataUrl, maxDim) : await toJpegNative(dataUrl, maxDim);
  } catch {
    return null;
  }
}

/** Compress a single base64 image data URL. Non-images / small images are returned as-is. */
export async function compressDataUrl(
  dataUrl?: string | null,
  opts?: CompressOpts,
): Promise<string | null | undefined> {
  if (!isImageDataUrl(dataUrl)) return dataUrl;
  const threshold = opts?.thresholdBytes ?? ONE_MB;
  if (dataUrlBytes(dataUrl) <= threshold) return dataUrl; // under 1MB -> leave untouched
  const maxDim = opts?.maxDim ?? 1600;
  const targetBytes = opts?.targetBytes ?? 350 * 1024;
  const minQuality = opts?.minQuality ?? 0.42;
  try {
    if (Platform.OS === "web") return await compressWeb(dataUrl, maxDim, targetBytes, minQuality);
    return await compressNative(dataUrl, maxDim);
  } catch {
    return dataUrl;
  }
}

/** Compress a list of image data URLs (skips nulls, preserves order). */
export async function compressDataUrls(
  list: (string | null | undefined)[],
  opts?: CompressOpts,
): Promise<string[]> {
  const out: string[] = [];
  for (const d of list) {
    const c = await compressDataUrl(d, opts);
    if (typeof c === "string" && c) out.push(c);
  }
  return out;
}
