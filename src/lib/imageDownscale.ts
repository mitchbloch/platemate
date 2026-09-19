/** Shrink a photo in the browser before upload: iPhone photos are 3–5MB
 *  HEIC/JPEG; Claude only needs ~1280px. Returns base64 JPEG (no prefix). */
export const MAX_EDGE_PX = 1280;
export const JPEG_QUALITY = 0.8;

export async function downscaleToJpegBase64(file: File): Promise<string> {
  // from-image: apply the EXIF rotation so portrait iPhone shots stay upright
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the photo");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
