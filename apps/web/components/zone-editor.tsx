"use client";

import { useEffect, useRef, useState } from "react";

import "leaflet/dist/leaflet.css";

import type { AreaGeometry } from "@kanofood/core";
import { Button, Cluster } from "@kanofood/ui";

import { KANO_CENTRE } from "./map-picker";

/**
 * The zone boundary editor. Screen 7.7, built in Phase 10.
 *
 * A zone is an area, and until this existed the area could only be set by
 * writing GeoJSON into the database by hand. The screen said so, honestly, and
 * then refused to price anything for a zone nobody could draw.
 *
 * **Click to place, drag to move, three points to close.** The outline closes
 * itself at the third point rather than asking for a "finish" step: a polygon is
 * closed by definition, and a separate button is a state the operator can leave
 * the screen in without noticing. Undo and Clear are the two ways back.
 *
 * **One outline, no holes.** The API refuses a ring set with more than one ring
 * and refuses `MultiPolygon`, because a shape this screen cannot draw is a shape
 * it cannot show you again. A stored multi-part zone is displayed as its first
 * part, and the screen says that saving will replace it.
 *
 * **The map is the only way in, and that is stated rather than worked around.**
 * Typing a polygon by hand is not something an operator should be asked to do,
 * so there is no text fallback. What there is: if the map chunk fails to load,
 * nothing is published, so the boundary already on the zone is left exactly as
 * it was rather than being cleared by a form that never drew anything.
 */

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletLayerGroup = import("leaflet").LayerGroup;

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/** A vertex as GeoJSON orders it: `[longitude, latitude]`. */
type Vertex = [number, number];

/** Six decimal places, the same precision a pin is stored at. */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * The vertices a stored shape was drawn from.
 *
 * The closing duplicate is dropped: GeoJSON repeats the first position last, and
 * the editor holds the points that were placed, not the ring they form. Keeping
 * the duplicate would give every stored outline one extra draggable point that
 * sits under the first.
 */
function readVertices(boundary: AreaGeometry | null): Vertex[] {
  if (boundary === null) return [];

  const rings =
    boundary.type === "Polygon" ? boundary.coordinates : (boundary.coordinates[0] ?? []);
  const ring = rings[0];
  if (!ring) return [];

  const points: Vertex[] = ring.map(([lng, lat]) => [lng, lat]);
  const first = points[0];
  const last = points[points.length - 1];

  if (first && last && points.length > 1 && first[0] === last[0] && first[1] === last[1]) {
    return points.slice(0, -1);
  }

  return points;
}

/**
 * What gets published, or `null` while there is no area yet.
 *
 * Fewer than three points is not a polygon, and sending one would store a shape
 * that every reader would have to defend against. `null` is what the form turns
 * into "clear it", so a zone whose last point was removed ends up with an empty
 * boundary rather than a two-point one.
 */
function toGeometry(vertices: readonly Vertex[]): AreaGeometry | null {
  if (vertices.length < 3) return null;

  const first = vertices[0]!;
  return { type: "Polygon", coordinates: [[...vertices, first]] };
}

export interface ZoneEditorProps {
  /** The outline as stored, or `null` when the zone has none. */
  readonly boundary: AreaGeometry | null;
  /** Called with the new outline, or `null` when the last point is removed. */
  readonly onChange: (boundary: AreaGeometry | null) => void;
  /** What the map is for, read out to assistive technology. */
  readonly label: string;
  /** Height in pixels. */
  readonly height?: number;
}

export function ZoneEditor({ boundary, onChange, label, height = 320 }: ZoneEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LeafletLayerGroup | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const onChangeRef = useRef(onChange);
  /** The last thing this editor published, so a prop echo is not read as a reset. */
  const publishedRef = useRef<string>(JSON.stringify(readVertices(boundary)));
  /** True while the map still owes us a fit to a shape that arrived from the server. */
  const fitPendingRef = useRef(boundary !== null);

  const [vertices, setVertices] = useState<Vertex[]>(() => readVertices(boundary));
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  // The click handler is bound once, at map creation, and reads the points
  // through this mirror rather than through a stale closure.
  const verticesRef = useRef(vertices);
  verticesRef.current = vertices;
  onChangeRef.current = onChange;

  /** The one way a change leaves this component. */
  function publish(next: Vertex[]): void {
    publishedRef.current = JSON.stringify(next);
    setVertices(next);
    onChangeRef.current(toGeometry(next));
  }

  // A shape that arrives from anywhere other than this editor (the server, a
  // save that came back) is adopted. A shape that arrives because we published
  // it is ignored, which is what stops a round trip through the form's string
  // state from resetting the points being dragged.
  useEffect(() => {
    const incoming = readVertices(boundary);
    const serialised = JSON.stringify(incoming);
    if (serialised === publishedRef.current) return;

    publishedRef.current = serialised;
    fitPendingRef.current = incoming.length > 0;
    setVertices(incoming);
  }, [boundary]);

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

      const start = verticesRef.current[0];
      const map = L.map(containerRef.current, {
        center: start ? [start[1], start[0]] : [KANO_CENTRE.lat, KANO_CENTRE.lng],
        zoom: start ? 13 : 11,
        // A zone is drawn by clicking, and a map that zooms on every scroll is a
        // page that cannot be scrolled past.
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

      layerRef.current = L.layerGroup().addTo(map);

      map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        const point: Vertex = [round6(event.latlng.lng), round6(event.latlng.lat)];
        publish([...verticesRef.current, point]);
      });

      setReady(true);

      // Leaflet measures its container when it is created. In a layout that
      // settles after paint the width is still zero at that moment.
      window.setTimeout(() => map.invalidateSize(), 200);
    }

    void setup();

    return () => {
      cancelled = true;
      layerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      setReady(false);
    };
    // The map is created once. Points are painted by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paint the points and the outline. Rebuilt whole on every change: a
  // hand-drawn zone has tens of points, not thousands, and a layer that is
  // updated in place is a layer that can disagree with the state it draws.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!L || !layer || !map) return;

    layer.clearLayers();

    const latlngs = vertices.map(([lng, lat]) => [lat, lng] as [number, number]);

    if (latlngs.length >= 3) {
      L.polygon(latlngs, { className: "kf-zone__shape" }).addTo(layer);
    } else if (latlngs.length === 2) {
      // Two points are a line, and drawing them is how the operator sees that
      // one more click makes an area.
      L.polyline(latlngs, { className: "kf-zone__shape" }).addTo(layer);
    }

    vertices.forEach(([lng, lat], index) => {
      const marker = L.marker([lat, lng], {
        draggable: true,
        keyboard: false,
        title: `Point ${String(index + 1)}`,
        icon: L.divIcon({
          className: "kf-zone__vertex",
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      }).addTo(layer);

      marker.on("dragend", () => {
        const position = marker.getLatLng();
        const next = [...verticesRef.current];
        next[index] = [round6(position.lng), round6(position.lat)];
        publish(next);
      });
    });

    // Fit once, to a shape that arrived from somewhere else. Fitting on every
    // change would re-centre the map under the point just placed.
    if (fitPendingRef.current && latlngs.length > 0) {
      fitPendingRef.current = false;
      map.fitBounds(L.latLngBounds(latlngs).pad(0.25));
    }
  }, [vertices, ready]);

  const multiPart =
    boundary !== null &&
    (boundary.type === "MultiPolygon" || boundary.coordinates.length > 1);

  return (
    <div className="kf-picker">
      <div
        ref={containerRef}
        className="kf-picker__canvas"
        style={{ height: `${String(height)}px` }}
        role="region"
        aria-label={`${label} map`}
      />

      <Cluster>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => publish(verticesRef.current.slice(0, -1))}
          disabled={vertices.length === 0}
        >
          Undo last point
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => publish([])}
          disabled={vertices.length === 0}
        >
          Clear outline
        </Button>
        <span className="kf-muted">
          {vertices.length === 0
            ? "No outline yet."
            : `${String(vertices.length)} point${vertices.length === 1 ? "" : "s"}${
                vertices.length < 3 ? ", two more to close it." : "."
              }`}
        </span>
      </Cluster>

      <p className="kf-muted kf-picker__note">
        {failed
          ? "The map could not load, so the outline cannot be drawn here. The boundary already saved on this zone is left alone."
          : ready
            ? "Tap the map to add a point, drag a point to move it. Three points close the outline."
            : "Loading the map. Nothing is changed until you place a point."}
      </p>

      {multiPart ? (
        <p className="kf-muted kf-picker__note">
          This zone is stored as more than one shape. Only the first is shown here, and saving from this screen
          replaces all of them with the single outline above.
        </p>
      ) : null}
    </div>
  );
}
