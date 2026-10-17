"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Pulls fresh numbers every 30 seconds. */
export function BoardRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
