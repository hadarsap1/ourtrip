"use client";

import { useEffect, useState } from "react";
import { describeWeather, getDayWeather, type DayWeather } from "@/lib/data/weather";
import { strings } from "@/lib/strings";

// Compact per-day forecast line (timeline + Today). When the day has outdoor
// items and rain chance > 50%, shows a warning chip (Sprint 5 acceptance).
export function WeatherLine({
  date,
  lat,
  lng,
  hasOutdoor = false,
}: {
  date: string;
  lat: number;
  lng: number;
  hasOutdoor?: boolean;
}) {
  const [weather, setWeather] = useState<DayWeather | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getDayWeather(date, lat, lng).then((w) => {
      if (!cancelled) setWeather(w);
    });
    return () => {
      cancelled = true;
    };
  }, [date, lat, lng]);

  if (!weather) return null;
  const { icon } = describeWeather(weather.weatherCode);
  const rainWarning = hasOutdoor && weather.precipitationChance > 50;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
      <span aria-hidden="true">{icon}</span>
      <span dir="ltr">
        {weather.tempMin}–{weather.tempMax}°
      </span>
      {weather.precipitationChance >= 20 && (
        <span dir="ltr">💧{weather.precipitationChance}%</span>
      )}
      {rainWarning && (
        <span
          className="rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700"
          title={strings.weather.rainAlert}
        >
          ⚠️ {strings.weather.rain}
        </span>
      )}
    </span>
  );
}
