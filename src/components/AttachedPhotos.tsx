"use client";

import type { Photo } from "@/hooks/usePhotoAttachments";

/** Thumbnail strip with a remove button per photo */
export default function AttachedPhotos({ photos, onRemove, noun }: { photos: Photo[]; onRemove: (id: string) => void; noun: string }) {
  if (photos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p, i) => (
        <div key={p.id} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.preview} alt={`Attached ${noun} ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
          <button
            type="button"
            onClick={() => onRemove(p.id)}
            aria-label={`Remove ${noun} ${i + 1}`}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-text text-xs text-white"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
