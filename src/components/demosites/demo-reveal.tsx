"use client";

/**
 * Scroll-reveal for demo previews: fades/slides in every [data-demo-reveal]
 * element as it enters the viewport. Injected once by the preview renderer
 * in public mode — sections opt in with the data attribute, no per-section
 * client components needed.
 */
import { useEffect } from "react";

export function DemoReveal() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-demo-reveal]"));
    if (!elements.length) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      elements.forEach((el) => el.classList.add("demo-reveal-in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("demo-reveal-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <style>{`
      [data-demo-reveal] { opacity: 0; transform: translateY(22px); transition: opacity 0.7s ease, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1); will-change: opacity, transform; }
      [data-demo-reveal].demo-reveal-in { opacity: 1; transform: none; }
      @media (prefers-reduced-motion: reduce) { [data-demo-reveal] { opacity: 1; transform: none; transition: none; } }
    `}</style>
  );
}
