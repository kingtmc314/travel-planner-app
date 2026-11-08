import { useEffect, useState } from "react";

// Keep data entrances snappy; tooltip movement is a smaller, frequent interaction.
export const CHART_ANIMATION_DURATION = 280;
export const CHART_TOOLTIP_ANIMATION_DURATION = 140;
export const CHART_ANIMATION_EASING = "ease-out" as const;
export const CHART_REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Value-based keys change for new data/scope, never for fetch status or array identity. */
export function getChartAnimationKey(scope: string, data: unknown): string {
  return `${scope}:${JSON.stringify(data)}`;
}

/** Start motion-free for SSR/hydration; enable motion only after checking the device. */
export function useChartMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const preference = window.matchMedia(CHART_REDUCED_MOTION_QUERY);
    const update = () => setReducedMotion(preference.matches);
    update();
    if (typeof preference.addEventListener === "function") {
      preference.addEventListener("change", update);
      return () => preference.removeEventListener("change", update);
    }
    // Older Safari exposes the legacy MediaQueryList subscription API.
    if (typeof preference.addListener === "function") {
      preference.addListener(update);
      return () => preference.removeListener(update);
    }
  }, []);

  return reducedMotion;
}
