"use client";

import { useEffect } from "react";

function isDirectVideoUrl(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return /\.(mp4|webm|ogg)(?:$|[?#])/i.test(url.pathname + url.search + url.hash);
  } catch {
    return false;
  }
}

export function DemoHeroVideo({
  videoUrl,
  posterUrl,
  companyName,
}: {
  videoUrl?: string | null;
  posterUrl?: string | null;
  companyName: string;
}) {
  useEffect(() => {
    const src = String(videoUrl || "").trim();
    if (!src || !isDirectVideoUrl(src)) return;

    let cancelled = false;
    let frame = 0;

    function enhance() {
      if (cancelled) return;
      const hero = document.querySelector<HTMLElement>("#top");
      const image = hero?.querySelector<HTMLImageElement>(
        'img[alt*="hovedbilde"], img[alt*="bilde 1"], img.object-cover',
      );

      if (!hero || !image) {
        frame += 1;
        if (frame < 12) window.requestAnimationFrame(enhance);
        return;
      }
      if (hero.dataset.heroVideoEnhanced === "true") return;

      const video = document.createElement("video");
      video.src = src;
      video.poster = String(posterUrl || image.currentSrc || image.src || "").trim();
      video.className = image.className;
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-label", `${companyName} presentasjonsvideo`);
      video.setAttribute("disablepictureinpicture", "");
      video.setAttribute("controlslist", "nodownload noplaybackrate");
      image.replaceWith(video);
      hero.dataset.heroVideoEnhanced = "true";

      void video.play().catch(() => {
        // Browsers may block autoplay. The approved poster remains visible.
      });
    }

    window.requestAnimationFrame(enhance);
    return () => {
      cancelled = true;
    };
  }, [companyName, posterUrl, videoUrl]);

  return null;
}
