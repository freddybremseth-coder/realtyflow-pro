"use client";

const DEFAULT_MAX_UPLOAD_BYTES = 3.8 * 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 2200;

export type PreparedImageFile = {
  file: File;
  compressed: boolean;
  originalSize: number;
};

function extensionFromMime(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  return "jpg";
}

function replaceExtension(fileName: string, mimeType: string) {
  const base = fileName.replace(/\.[^.]+$/, "") || "image";
  return `${base}.${extensionFromMime(mimeType)}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Kunne ikke klargjøre bildet for opplasting."));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

async function loadImage(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareImageForUpload(
  file: File,
  options: {
    maxBytes?: number;
    maxDimension?: number;
    outputType?: "image/jpeg" | "image/webp";
  } = {},
): Promise<PreparedImageFile> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const outputType = options.outputType ?? "image/jpeg";
  const shouldCompress = file.size > maxBytes || file.type === "image/png";

  if (!shouldCompress) {
    return { file, compressed: false, originalSize: file.size };
  }

  const image = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kunne ikke lese bildet i nettleseren.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const qualities = [0.88, 0.78, 0.68, 0.58, 0.48];
  let bestBlob: Blob | null = null;

  for (const quality of qualities) {
    const blob = await canvasToBlob(canvas, outputType, quality);
    bestBlob = blob;
    if (blob.size <= maxBytes) break;
  }

  if (!bestBlob) {
    return { file, compressed: false, originalSize: file.size };
  }

  const preparedFile = new File([bestBlob], replaceExtension(file.name, outputType), {
    type: outputType,
    lastModified: Date.now(),
  });

  return {
    file: preparedFile,
    compressed: preparedFile.name !== file.name || preparedFile.size !== file.size,
    originalSize: file.size,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function safeImageFilename(value: string, fallback = "bilde.png") {
  const cleaned = value
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
}

export async function downloadImageFile(imageUrl: string, filename: string) {
  const safeName = safeImageFilename(filename);

  if (imageUrl.startsWith("data:")) {
    const blob = await fetch(imageUrl).then((res) => res.blob());
    downloadBlob(blob, safeName);
    return;
  }

  const res = await fetch(
    `/api/image-download?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(safeName)}`,
    { cache: "no-store" },
  );

  if (!res.ok) {
    throw new Error((await res.text().catch(() => "")) || "Kunne ikke laste ned bildet.");
  }

  const blob = await res.blob();
  downloadBlob(blob, safeName);
}
