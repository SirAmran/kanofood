"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatNaira } from "@kanofood/core";
import { Alert, Button } from "@kanofood/ui";

import {
  LOCATION_COOKIE,
  LOCATION_MAX_AGE_SECONDS,
  encodeLocation,
  type SavedLocation,
} from "@/lib/public/location-shared";

import { readAddress, writeAddress } from "./checkout-store";
import { fetchQuote, type DeliveryQuote } from "./storefront-api";

/**
 * Screen 4.8, the delivery location.
 *
 * A map with a draggable pin is the spec'd answer and is not built: the map
 * decision is still open with Yoyo, so this screen does not pretend. It offers
 * the browser's location and a typed point, and it is honest on the page about
 * what is missing. When the map lands it replaces the coordinate fields, not the
 * rest of the screen.
 *
 * The address text is what a rider actually uses, so it is required even when
 * the point is exact. Landmark and instructions are optional but are carried on
 * the order, because in Kano a street name alone regularly is not enough.
 *
 * The point is written to the cookie as well as localStorage: the cookie is what
 * the server reads to price the storefront before the first paint, and the
 * address record is what checkout fills from.
 */

type QuoteState =
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "ready"; readonly quote: DeliveryQuote }
  | { readonly status: "error"; readonly message: string };

function parsePoint(latText: string, lngText: string): { lat: number; lng: number } | null {
  const lat = Number(latText);
  const lng = Number(lngText);
  if (latText.trim() === "" || lngText.trim() === "") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

export function LocationView({
  initialPoint,
  next,
  platformPhone,
}: {
  readonly initialPoint: SavedLocation | null;
  readonly next: string;
  readonly platformPhone: string | null;
}) {
  const router = useRouter();

  const [label, setLabel] = useState(initialPoint?.label ?? "");
  const [addressText, setAddressText] = useState("");
  const [landmark, setLandmark] = useState("");
  const [instructions, setInstructions] = useState("");
  const [latText, setLatText] = useState(initialPoint ? String(initialPoint.lat) : "");
  const [lngText, setLngText] = useState(initialPoint ? String(initialPoint.lng) : "");

  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const [message, setMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  // The saved address fills the text fields after mount, because it lives in
  // localStorage and reading it during render would render differently on the
  // server and the first client pass.
  useEffect(() => {
    const saved = readAddress();
    if (!saved) return;
    setLabel(saved.label);
    setAddressText(saved.addressText);
    setLandmark(saved.landmark ?? "");
    setInstructions(saved.instructions ?? "");
    setLatText(String(saved.lat));
    setLngText(String(saved.lng));
  }, []);

  const point = parsePoint(latText, lngText);

  // Check the area as soon as there is a usable point, with a pause so typing
  // coordinates does not fire a request per keystroke and an abort so the last
  // answer is the only one that lands.
  useEffect(() => {
    if (!point) {
      setQuote({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setQuote({ status: "checking" });
      fetchQuote(point, undefined, controller.signal)
        .then((result) => setQuote({ status: "ready", quote: result }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setQuote({
            status: "error",
            message: error instanceof Error ? error.message : "The area could not be checked.",
          });
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [point?.lat, point?.lng]);

  function useDeviceLocation() {
    if (!("geolocation" in navigator)) {
      setMessage("This browser cannot report a location. Enter the point below.");
      return;
    }

    setLocating(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setLatText(String(Number(position.coords.latitude.toFixed(6))));
        setLngText(String(Number(position.coords.longitude.toFixed(6))));
        setMessage("Point captured. Add the address text so the rider can find you.");
      },
      () => {
        setLocating(false);
        setMessage(
          "Location was not shared. Allow location in your browser, or enter the point below.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!addressText.trim()) {
      setMessage("Add the address text. A rider needs more than a pin.");
      return;
    }
    if (!point) {
      setMessage("Set your delivery point with the button above or the fields below.");
      return;
    }

    setSaving(true);
    let result: DeliveryQuote;
    try {
      result = await fetchQuote(point);
    } catch (error) {
      setSaving(false);
      setMessage(
        error instanceof Error ? error.message : "We could not check the area. Try again.",
      );
      return;
    }
    setSaving(false);

    if (!result.deliverable) {
      setMessage(
        platformPhone
          ? `We do not deliver to this point yet. Call ${platformPhone} to ask about your area.`
          : "We do not deliver to this point yet. Try an address closer to Kano Metropolitan.",
      );
      return;
    }

    const savedLocation: SavedLocation = {
      label: label.trim() || "Delivery address",
      lat: point.lat,
      lng: point.lng,
    };

    document.cookie = `${LOCATION_COOKIE}=${encodeLocation(savedLocation)}; path=/; max-age=${LOCATION_MAX_AGE_SECONDS}; SameSite=Lax`;
    writeAddress({
      label: savedLocation.label,
      addressText: addressText.trim(),
      landmark: landmark.trim() || null,
      instructions: instructions.trim() || null,
      lat: savedLocation.lat,
      lng: savedLocation.lng,
    });

    router.push(next);
    router.refresh();
  }

  const checkedQuote = quote.status === "ready" ? quote.quote : null;
  const outside = checkedQuote !== null && !checkedQuote.deliverable;

  return (
    <section className="sf-page">
      <div className="sf-hero">
        <h1 className="sf-hero__title">Where should we deliver?</h1>
        <p className="sf-tile__meta">
          We use your point to price delivery and to send the rider to the right place.
        </p>
      </div>

      <div className="sf-form">
        <Button type="button" variant="secondary" block onClick={useDeviceLocation} disabled={locating}>
          {locating ? "Finding you..." : "Use my current location"}
        </Button>

        <form className="sf-form__body" onSubmit={submit}>
          <label className="kf-field">
            <span className="kf-label">What should we call it?</span>
            <input
              className="kf-input"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Home, office, Sabon Gari..."
              maxLength={80}
            />
            <span className="sf-field__hint">Shown on the delivery bar, for you only.</span>
          </label>

          <label className="kf-field">
            <span className="kf-label">Delivery address</span>
            <textarea
              className="kf-input sf-textarea"
              value={addressText}
              onChange={(event) => setAddressText(event.target.value)}
              placeholder="House number, street, area"
              maxLength={300}
              rows={2}
              required
            />
          </label>

          <label className="kf-field">
            <span className="kf-label">Landmark (optional)</span>
            <input
              className="kf-input"
              value={landmark}
              onChange={(event) => setLandmark(event.target.value)}
              placeholder="Beside the mosque, opposite the school..."
              maxLength={200}
            />
          </label>

          <label className="kf-field">
            <span className="kf-label">Instructions for the rider (optional)</span>
            <textarea
              className="kf-input sf-textarea"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Call when you reach the gate"
              maxLength={300}
              rows={2}
            />
          </label>

          <fieldset className="sf-coords">
            <legend className="kf-label">Delivery point</legend>
            <p className="sf-field__hint">
              A map picker is not built yet. Use your current location, or type the latitude and
              longitude if you have them.
            </p>
            <div className="sf-form__row">
              <label className="kf-field">
                <span className="kf-label">Latitude</span>
                <input
                  className="kf-input"
                  inputMode="decimal"
                  value={latText}
                  onChange={(event) => setLatText(event.target.value)}
                  placeholder="12.0022"
                />
              </label>
              <label className="kf-field">
                <span className="kf-label">Longitude</span>
                <input
                  className="kf-input"
                  inputMode="decimal"
                  value={lngText}
                  onChange={(event) => setLngText(event.target.value)}
                  placeholder="8.5919"
                />
              </label>
            </div>
          </fieldset>

          {quote.status === "checking" ? (
            <p className="sf-field__hint" role="status">
              Checking this area...
            </p>
          ) : null}

          {checkedQuote?.deliverable ? (
            <Alert tone="success" title={`We deliver to ${checkedQuote.zoneName}`}>
              Delivery from this area starts at {formatNaira(checkedQuote.feeKobo)}. The kitchen adds
              any distance band at checkout.
            </Alert>
          ) : null}

          {outside ? (
            <Alert tone="warning" title="Not in our delivery area yet">
              {platformPhone ? (
                <>
                  Call{" "}
                  <a href={`tel:${platformPhone}`} className="kf-link">
                    {platformPhone}
                  </a>{" "}
                  to ask about your area, or try a point closer to Kano Metropolitan.
                </>
              ) : (
                "Try a point closer to Kano Metropolitan."
              )}
            </Alert>
          ) : null}

          {quote.status === "error" ? (
            <Alert tone="danger" title="This area could not be checked">
              {quote.message}
            </Alert>
          ) : null}

          {message ? (
            <p className="sf-form__message" role="status">
              {message}
            </p>
          ) : null}

          <Button type="submit" variant="primary" block disabled={saving || outside}>
            {saving ? "Saving..." : "Save this location"}
          </Button>
        </form>
      </div>
    </section>
  );
}
