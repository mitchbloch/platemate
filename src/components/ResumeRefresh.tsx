"use client";

import { useResumeRefresh } from "@/hooks/useResumeRefresh";

/** Mounted once in the root layout; renders nothing. */
export default function ResumeRefresh() {
  useResumeRefresh();
  return null;
}
