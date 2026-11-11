import { slugify } from "./model.ts";
import { toFile } from "./persistence.ts";
import type { Diagram } from "./types.ts";

/**
 * Image and file export (specs S9 and S10). `toSvg` builds the picture; this
 * module only turns a payload into a downloaded file. Browser APIs stay inside
 * function bodies so the pure helpers can still be imported by tests.
 */

export interface SvgSize {
  width: number;
  height: number;
}

/** `Title` -> `title.svg`; an untitled diagram exports as `untitled.svg`. */
export function fileNameFor(diagram: Diagram, extension: string): string {
  const base = diagram.title.trim() === "" ? "untitled" : slugify(diagram.title);
  return `${base}.${extension}`;
}

/** Reads the root `width`/`height` of a document produced by `toSvg`. */
export function svgSize(svg: string): SvgSize | null {
  const width = Number(/\bwidth="([\d.]+)"/.exec(svg)?.[1]);
  const height = Number(/\bheight="([\d.]+)"/.exec(svg)?.[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

/** Copies text to the clipboard. Returns false when the browser refuses. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a tick to start the download before dropping the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvg(svg: string, fileName: string): void {
  downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), fileName);
}

/**
 * The `.json` download pair: the exact exchange text from `persistence.toFile`
 * and the title slug. Nothing is re-serialised here, so the exported file imports
 * back unchanged.
 */
export function jsonExport(diagram: Diagram): { text: string; fileName: string } {
  return { text: toFile(diagram), fileName: fileNameFor(diagram, "json") };
}

export function downloadJson(diagram: Diagram): void {
  const { text, fileName } = jsonExport(diagram);
  downloadBlob(new Blob([text], { type: "application/json;charset=utf-8" }), fileName);
}

/** Rasterizes the whole diagram at `scale` times its vector size. */
export async function svgToPngBlob(svg: string, scale: number): Promise<Blob> {
  const size = svgSize(svg);
  if (!size) throw new Error("The SVG has no usable size");
  const safeScale = scale > 0 ? scale : 1;

  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The SVG could not be loaded for export"));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(size.width * safeScale));
    canvas.height = Math.max(1, Math.round(size.height * safeScale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The 2D canvas is unavailable");

    context.setTransform(safeScale, 0, 0, safeScale, 0, 0);
    context.drawImage(image, 0, 0, size.width, size.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("The PNG could not be encoded"))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPng(svg: string, fileName: string, scale: number): Promise<void> {
  downloadBlob(await svgToPngBlob(svg, scale), fileName);
}
