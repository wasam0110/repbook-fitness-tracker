const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 6 * 1024 * 1024;
const MAX_EDGE = 1600;

type ImageSource = ImageBitmap | HTMLImageElement;

function decodeWithImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(sourceUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error("This image could not be opened. Try a JPEG, PNG, or WebP photo."));
    };
    image.src = sourceUrl;
  });
}

async function decode(file: File): Promise<ImageSource> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      return decodeWithImageElement(file);
    }
  }
  return decodeWithImageElement(file);
}

export async function prepareProgressPhoto(file: File): Promise<{ blob: Blob; fileName: string }> {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowedTypes.has(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Choose a photo smaller than 20 MB.");
  }

  const source = await decode(file);
  try {
    const width = "width" in source ? source.width : 0;
    const height = "height" in source ? source.height : 0;
    if (!width || !height) throw new Error("This image has no readable dimensions.");

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo compression is unavailable in this browser.");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        result => result ? resolve(result) : reject(new Error("The photo could not be compressed.")),
        "image/jpeg",
        0.82,
      );
    });
    if (blob.size > MAX_COMPRESSED_BYTES) {
      throw new Error("The compressed photo is still too large. Choose a smaller image.");
    }

    const fileName = file.name
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .trim()
      .slice(0, 110) || "progress-photo.jpg";
    return { blob, fileName };
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }
}
