"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  LOCATION_COOKIE,
  LOCATION_MAX_AGE_SECONDS,
  encodeLocation,
  type SavedLocation,
} from "@/lib/public/location-shared";

/**
 * The delivery location bar. Screen 4.1, and it stays on every storefront page.
 *
 * A cookie, not localStorage, because the server reads it before the first
 * paint to price delivery. `router.refresh()` after the write re-renders the
 * current screen with the new point, so nothing is left showing fees for the
 * old one.
 *
 * Two ways in, neither of them built yet on a map: the browser's own location,
 * and a typed coordinate pair. The second is deliberately plain. Screen 4.8 is
 * the map and address picker, and its approach is still open with Yoyo, so this
 * screen does not pretend to have one. A customer who allows location never
 * sees the fallback; anyone testing the storefront can still set a point.
 */
export function LocationBar({ initial }: { readonly initial: SavedLocation | null }) {
  const router = useRouter();
  const [location, setLocation] = useState<SavedLocation | null>(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  function save(next: SavedLocation) {
    document.cookie = `${LOCATION_COOKIE}=${encodeLocation(next)}; path=/; max-age=${LOCATION_MAX_AGE_SECONDS}; SameSite=Lax`;
    setLocation(next);
    setOpen(false);
    setMessage(null);
    router.refresh();
  }

  function useDeviceLocation() {
    if (!("geolocation" in navigator)) {
      setMessage("This browser cannot report a location. Enter coordinates below.");
      return;
    }

    setBusy(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBusy(false);
        save({
          label: "My current location",
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        });
      },
      () => {
        setBusy(false);
        setMessage("Location was not shared. Enter coordinates below, or allow location in your browser.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  function submitManual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedLat = Number(lat);
    const parsedLng = Number(lng);

    if (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      setMessage("Latitude must be between -90 and 90.");
      return;
    }
    if (!Number.isFinite(parsedLng) || parsedLng < -180 || parsedLng > 180) {
      setMessage("Longitude must be between -180 and 180.");
      return;
    }

    save({
      label: label.trim() || "Custom location",
      lat: Number(parsedLat.toFixed(6)),
      lng: Number(parsedLng.toFixed(6)),
    });
  }

  return (
    <div className="sf-location">
      <button
        type="button"
        className="sf-location__button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="sf-location__pin" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </span>
        <span className="sf-location__text">
          <span className="sf-location__label">Deliver to</span>
          <span className="sf-location__value">{location ? location.label : "Set your location"}</span>
        </span>
        <span className="sf-location__change">{open ? "Close" : location ? "Change" : "Set"}</span>
      </button>

      {open ? (
        <div className="sf-location__panel">
          <button
            type="button"
            className="kf-btn kf-btn--primary kf-btn--block"
            onClick={useDeviceLocation}
            disabled={busy}
          >
            {busy ? "Finding you…" : "Use my current location"}
          </button>

          <form className="sf-location__manual" onSubmit={submitManual}>
            <p className="sf-location__hint">
              Or enter a point by hand. Address search arrives with the location screen.
            </p>
            <label className="kf-field">
              <span className="kf-label">What should we call it?</span>
              <input
                className="kf-input"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Home, office, Sabon Gari…"
                maxLength={80}
              />
            </label>
            <div className="sf-location__coords">
              <label className="kf-field">
                <span className="kf-label">Latitude</span>
                <input
                  className="kf-input"
                  inputMode="decimal"
                  value={lat}
                  onChange={(event) => setLat(event.target.value)}
                  placeholder="12.0022"
                />
              </label>
              <label className="kf-field">
                <span className="kf-label">Longitude</span>
                <input
                  className="kf-input"
                  inputMode="decimal"
                  value={lng}
                  onChange={(event) => setLng(event.target.value)}
                  placeholder="8.5919"
                />
              </label>
            </div>
            <button type="submit" className="kf-btn kf-btn--secondary kf-btn--block">
              Save this point
            </button>
          </form>

          {message ? (
            <p className="sf-location__message" role="status">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
