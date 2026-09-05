// Open-Meteo per itinerary-day location, cached (SPEC 2.5). Free API, no key.
// Cache: localStorage keyed by (date, rounded coords), 3h TTL - enough for
// "cached" and keeps offline Today rendering the last known forecast.

import { strings } from "@/lib/strings";

export type DayWeather = {
  tempMax: number;
  tempMin: number;
  precipitationChance: number; // 0-100
  weatherCode: number;
};

const TTL_MS = 3 * 60 * 60 * 1000;

function cacheKey(date: string, lat: number, lng: number): string {
  return `ourtrip-weather-${date}-${lat.toFixed(2)},${lng.toFixed(2)}`;
}

function readCache(key: string, ignoreTtl = false): DayWeather | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; weather: DayWeather };
    if (!ignoreTtl && Date.now() - parsed.at > TTL_MS) return null;
    return parsed.weather;
  } catch {
    return null;
  }
}

/**
 * Forecast for one day at one location. Serves from cache within TTL; on
 * fetch failure (offline) falls back to any stale cached value.
 */
export async function getDayWeather(
  date: string,
  lat: number,
  lng: number
): Promise<DayWeather | null> {
  const key = cacheKey(date, lat, lng);
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&start_date=${date}&end_date=${date}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const daily = json?.daily;
    if (!daily?.time?.length) return readCache(key, true);
    const weather: DayWeather = {
      tempMax: Math.round(daily.temperature_2m_max[0]),
      tempMin: Math.round(daily.temperature_2m_min[0]),
      precipitationChance: daily.precipitation_probability_max?.[0] ?? 0,
      weatherCode: daily.weather_code[0],
    };
    try {
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), weather }));
    } catch {
      // storage full - cache is best-effort
    }
    return weather;
  } catch {
    return readCache(key, true);
  }
}

/**
 * WMO weather code → Hebrew label. The picture is drawn, not emoji, and lives
 * in components/icons.tsx as WeatherIcon - the two share this grouping.
 */
export function describeWeather(code: number): { label: string } {
  const w = strings.weather;
  if (code === 0) return { label: w.clear };
  if (code <= 2) return { label: w.partlyCloudy };
  if (code === 3) return { label: w.cloudy };
  if (code <= 48) return { label: w.fog };
  if (code <= 57) return { label: w.drizzle };
  if (code <= 67) return { label: w.rain };
  if (code <= 77) return { label: w.snow };
  if (code <= 82) return { label: w.showers };
  if (code <= 86) return { label: w.snow };
  return { label: w.thunderstorm };
}
