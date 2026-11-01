"use client";

import { useRef, useState } from "react";
import { downscaleToJpegBase64 } from "@/lib/imageDownscale";

export type Photo = { id: string; preview: string; base64: string };

/** Why some files weren't attached; callers word it for their context */
export type AddPhotosProblem = "too_many" | "unreadable" | null;

/** Photos picked in the browser, downscaled to base64 JPEG before upload.
 *  Shared by the generation chat (photos) and import (screenshots). */
export function usePhotoAttachments(max: number, maxEdge?: number) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  // Slots claimed by picks still downscaling, so two quick picks can't
  // both take the last free slot
  const pending = useRef(0);

  async function add(files: FileList | File[] | null): Promise<AddPhotosProblem> {
    if (!files) return null;
    const list = Array.from(files);
    const room = Math.max(0, max - photos.length - pending.current);
    const chosen = list.slice(0, room);
    pending.current += chosen.length;
    try {
      const next = await Promise.all(
        chosen.map(async (f) => {
          const base64 = await downscaleToJpegBase64(f, maxEdge);
          return { id: `${f.name}-${f.lastModified}-${Math.random()}`, preview: `data:image/jpeg;base64,${base64}`, base64 };
        }),
      );
      setPhotos((prev) => [...prev, ...next].slice(0, max));
    } catch {
      return "unreadable";
    } finally {
      pending.current -= chosen.length;
    }
    return list.length > room ? "too_many" : null;
  }

  return {
    photos,
    add,
    remove: (id: string) => setPhotos((prev) => prev.filter((p) => p.id !== id)),
    clear: () => setPhotos([]),
    full: photos.length >= max,
  };
}
