// Shrinks phone photos before upload: a full-size copy (a 12MP photo → roughly
// 0.5–1.5 MB JPEG) and a small preview for the organizer page.
const FULL = { maxEdge: 2048, quality: 0.85 };
const THUMB = { maxEdge: 480, quality: 0.8 };

export async function compressImage(file: File): Promise<{ photo: Blob; thumb: Blob }> {
  const bitmap = await loadBitmap(file);
  try {
    return { photo: await resize(bitmap, FULL), thumb: await resize(bitmap, THUMB) };
  } finally {
    if ('close' in bitmap) bitmap.close();
  }
}

function resize(
  bitmap: ImageBitmap | HTMLImageElement,
  { maxEdge, quality }: { maxEdge: number; quality: number },
): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not read that image.'))),
      'image/jpeg',
      quality,
    ),
  );
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error('Could not read that image. Try a JPG or PNG.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
