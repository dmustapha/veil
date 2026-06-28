"use client";

import { useEffect } from "react";

/**
 * Bulletproof scroll-reveal. Mounted once in the root layout.
 * - IntersectionObserver adds `.in` to `.reveal` elements as they enter.
 * - A MutationObserver re-scans for `.reveal` nodes added after first paint
 *   (route changes, lazy content), so nothing is ever missed.
 * - A 4000ms hard fallback reveals anything still hidden, so a stalled
 *   observer can never strand the page blank (long enough that normal
 *   scrolling triggers the animated reveal first).
 * Pairs with globals.css: `.reveal` is visible by default (no-JS safe) and
 * only hidden once `html.js-ready` is set by the pre-paint inline script.
 */
export function Reveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    const observeAll = () =>
      document
        .querySelectorAll(".reveal:not(.in)")
        .forEach((el) => io.observe(el));
    observeAll();
    const mo = new MutationObserver(observeAll);
    mo.observe(document.body, { childList: true, subtree: true });
    const fallback = setTimeout(
      () =>
        document
          .querySelectorAll(".reveal:not(.in)")
          .forEach((el) => el.classList.add("in")),
      4000
    );
    return () => {
      io.disconnect();
      mo.disconnect();
      clearTimeout(fallback);
    };
  }, []);
  return null;
}
