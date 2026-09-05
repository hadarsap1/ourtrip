"use client";

import { useEffect, useState } from "react";
import { RainDropIcon, WarningIcon, WeatherIcon } from "@/components/icons";
import { getDayWeather, type DayWeather } from "@/lib/data/weather";
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
  const rainWarning = hasOutdoor && weather.precipitationChance > 50;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
      <WeatherIcon code={weather.weatherCode} className="h-3.5 w-3.5 text-sun" />
      <span dir="ltr">
        {weather.tempMin}-{weather.tempMax}°
      </span>
      {weather.precipitationChance >= 20 && (
        <span className="inline-flex items-center gap-0.5">
          <RainDropIcon className="h-3 w-3 text-sea" />
          <span dir="ltr">{weather.precipitationChance}%</span>
        </span>
      )}
      {rainWarning && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-sun-tint px-1.5 py-0.5 font-bold text-sun-deep"
          title={strings.weather.rainAlert}
        >
          <WarningIcon className="h-3 w-3" />
          {strings.weather.rain}
        </span>
      )}
    </span>
  );
}
