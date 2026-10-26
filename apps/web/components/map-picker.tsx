"use client";

import { useEffect, useRef, useState } from "react";

import "leaflet/dist/leaflet.css";

/**
 * The map picker. Decided 2026-10-23, built in Phase 10.
 *
 * One component serves three screens: the customer's delivery point (4.8), the
 * admin's kitchen pin (7.4) and a kitchen setting its own pin (5.7). Shipping it
 * once is what closed the kitchen pin, which had been waiting on this decision
 * since Phase 7.
 *
 * **Leaflet with OpenStreetMap tiles.** No key, no billing account, no per-load
 * cost, which is the same reasoning that made the platform phone a phone call
 * rather than an SMS bill. The alternative, Google or Mapbox, needs a key on
 * every screen and a billing relationship to render a pin.
 *
 * **Progressive, never the only way in.** Device location, typed coordinates and
 * the address text all keep working with JavaScript off, with tiles blocked, or
 * with the map chunk failing to load. The map enhances those fields; it does not
 * replace them, and a failed import leaves them untouched.
 *
 * **No marker image.** Leaflet's default marker loads PNGs from inside the
 * package by URL, which a bundler rewrites and a strict CSP refuses. A `divIcon`
 * styled by CSS has no asset to resolve and follows the theme.
 *
 * **Address search is deliberately absent.** It needs a self-hosted Nominatim,
 * because the public instance forbids production use, and there is no host for
 * one yet. A search box that promises an address and returns nothing is worse
 * than a screen that plainly asks for coordinates.
 */

/** Kano city centre. Opening on Kano beats opening on an unknown point. */
export const KANO_CENTRE = { lat: 12.0022, lng: 8.5919 } as const;

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletMarker = import("leaflet").Marker;

/** Six places is what the rest of the platform stores for a point. */
function rounded(lat: number, lng: number): { lat: number; lng: number } {
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

function parse(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface MapPickerProps {
  /** The point, or null when nothing is set. */
  readonly lat: number | null;
  readonly lng: number | null;
  /** Called with the new point, or null when the point is cleared. */
  readonly onChange: (point: { lat: number; lng: number } | null) => void;
  /** What the map is for, read out to assistive technology. */
  readonly label: string;
  /** Height in pixels. The customer screen wants more room than a settings form. */
  readonly height?: number;
  /** Show the lat and lng text fields under the map. On by default. */
  readonly withInputs?: boolean;
}

/**
 * The map and its two fields.
 *
 * Leaflet is imported inside the effect rather than at module scope, so the
 * server never evaluates it and the chunk only arrives on a screen that has a
 * map on it. `ssr: false` is not available in a server component, and this
 * component is imported by server pages, so the import has to happen in the
 * browser.
 */
export function MapPicker({
  lat,
  lng,
  onChange,
  label,
  height = 280,
  withInputs = true,
}: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const onChangeRef = useRef(onChange);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  // The click and drag handlers are bound once, at map creation, so they read
  // the latest callback through a ref rather than being torn down and rebuilt
  // every time the parent re-renders.
  onChangeRef.current = onChange;

  /**
   * The pin, in one place.
   *
   * A click, a drag and a typed coordinate all end up here, so the three routes
   * to a point cannot drift into handling the marker differently.
   */
  function placeMarker(L: LeafletModule, point: { lat: number; lng: number }): void {
    const map = mapRef.current;
    if (!map) return;

    if (markerRef.current === null) {
      markerRef.current = L.marker([point.lat, point.lng], {
        draggable: true,
        icon: L.divIcon({ className: "kf-picker__pin", iconSize: [18, 18], iconAnchor: [9, 9] }),
      }).addTo(map);

      markerRef.current.on("dragend", () => {
        const position = markerRef.current?.getLatLng();
        if (position) onChangeRef.current(rounded(position.lat, position.lng));
      });

      return;
    }

    markerRef.current.setLatLng([point.lat, point.lng]);
  }

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      if (containerRef.current === null || mapRef.current !== null) return;

      let L: LeafletModule;
      try {
        L = await import("leaflet");
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled || containerRef.current === null) return;

      leafletRef.current = L;

      const start = lat !== null && lng !== null ? { lat, lng } : KANO_CENTRE;

      const map = L.map(containerRef.current, {
        center: [start.lat, start.lng],
        zoom: lat !== null ? 16 : 13,
        // A map that eats the wheel turns every page scroll into a zoom, which
        // on a phone is how a customer loses the form they were filling in.
        scrollWheelZoom: false,
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer(TILE_URL, {
        attribution: ATTRIBUTION,
        maxZoom: 19,
        minZoom: 10,
      }).addTo(map);

      // No point in the URL of any tile request: one static template with the
      // tile coordinates in it, and nothing belonging to a customer.
      if (lat !== null && lng !== null) placeMarker(L, { lat, lng });

      map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        const point = rounded(event.latlng.lat, event.latlng.lng);
        placeMarker(L, point);
        onChangeRef.current(point);
      });

      setReady(true);

      // Leaflet measures its container on creation. In a layout that settles
      // after paint the width is still zero at that moment, which renders a grey
      // rectangle until the next interaction, so it is measured again once the
      // browser has laid the page out.
      window.setTimeout(() => map.invalidateSize(), 200);
    }

    void setup();

    return () => {
      cancelled = true;
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      setReady(false);
    };
    // The map is created once. Later point changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in step with the fields, without recreating the map.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (lat === null || lng === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    placeMarker(L, { lat, lng });

    // A point that arrives from somewhere other than the map (a typed
    // coordinate, the device's location, a saved address) can be off screen.
    // Panning only when it is actually outside avoids fighting a drag with a
    // nudge on every dragend, which reads as the map refusing the gesture.
    if (!map.getBounds().contains([lat, lng])) map.panTo([lat, lng]);
    // The marker is placed by a function defined in the component body, which
    // is stable enough for this: the effect's job is the pair, not the helper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  function setLatText(value: string) {
    const nextLat = parse(value);
    const nextLng = lng ?? KANO_CENTRE.lng;
    if (nextLat === null) {
      onChange(lng === null ? null : { lat: KANO_CENTRE.lat, lng: nextLng });
      return;
    }
    onChange({ lat: nextLat, lng: nextLng });
  }

  function setLngText(value: string) {
    const nextLng = parse(value);
    const nextLat = lat ?? KANO_CENTRE.lat;
    if (nextLng === null) {
      onChange(lat === null ? null : { lat: nextLat, lng: KANO_CENTRE.lng });
      return;
    }
    onChange({ lat: nextLat, lng: nextLng });
  }

  return (
    <div className="kf-picker">
      <div
        ref={containerRef}
        className="kf-picker__canvas"
        style={{ height: `${String(height)}px` }}
        role="region"
        aria-label={`${label} map`}
      />

      <p className="kf-muted kf-picker__note">
        {failed
          ? withInputs
            ? "The map could not load. The fields below set the same point."
            : "The map could not load. Use your current location instead."
          : ready
            ? "Tap the map or drag the pin to set the point."
            : "Loading the map. The rest of this screen works without it."}
      </p>

      {withInputs ? (
        <div className="kf-picker__fields">
          <label className="kf-field">
            <span className="kf-label">{label} latitude</span>
            <input
              className="kf-input"
              inputMode="decimal"
              value={lat === null ? "" : String(lat)}
              onChange={(event) => setLatText(event.target.value)}
              placeholder="12.0022"
              aria-describedby="kf-picker-help"
            />
          </label>
          <label className="kf-field">
            <span className="kf-label">{label} longitude</span>
            <input
              className="kf-input"
              inputMode="decimal"
              value={lng === null ? "" : String(lng)}
              onChange={(event) => setLngText(event.target.value)}
              placeholder="8.5919"
              aria-describedby="kf-picker-help"
            />
          </label>
        </div>
      ) : null}

      <p id="kf-picker-help" className="kf-muted kf-picker__note">
        {withInputs
          ? "Clear both to say the point is unknown. A pin tells the platform where delivery is priced from; the address text is what the rider actually reads."
          : "The pin tells the platform where delivery is priced from; the address text is what the rider actually reads."}
      </p>
    </div>
  );
}
