/** Shrink a photo in the browser before upload: iPhone photos are 3–5MB
 *  HEIC/JPEG; Claude only needs ~1280px. Returns base64 JPEG (no prefix). */
export const MAX_EDGE_PX = 1280;
/** Screenshots are mostly text: keep more resolution so small print stays
 *  legible on a tall phone capture. 1568px is the long edge Claude's vision
 *  works at without further downscaling. */
export const SCREENSHOT_MAX_EDGE_PX = 1568;
export const JPEG_QUALITY = 0.8;

export async function downscaleToJpegBase64(file: File, maxEdge = MAX_EDGE_PX): Promise<string> {
  // from-image: apply the EXIF rotation so portrait iPhone shots stay upright
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
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
