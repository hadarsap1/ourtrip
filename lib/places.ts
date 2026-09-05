// Google Maps JS API loader for Places autocomplete. When the key is missing
// (or the script fails to load, e.g. offline) callers fall back to free-text
// location input - the feature degrades, never blocks.

declare global {
  interface Window {
    google?: typeof google;
  }
}

let loadPromise: Promise<typeof google | null> | null = null;

export function loadGoogleMaps(): Promise<typeof google | null> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key || typeof window === "undefined") return Promise.resolve(null);
  if (window.google?.maps?.places) return Promise.resolve(window.google);

  if (!loadPromise) {
    loadPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=he`;
      script.async = true;
      script.onload = () => resolve(window.google ?? null);
      script.onerror = () => {
        loadPromise = null; // allow retry once back online
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}
