"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef } from "react";

import { NODE_KIND_LABELS } from "@/components/node-kind-icon";
import type { NodeKind, NodeStatus } from "@/domain/types";
import { useLiveStream } from "@/hooks/use-live-stream";
import { getTheme, subscribeTheme, type Theme } from "@/hooks/use-theme";
import { formatIstTime } from "@/lib/time";
import type { StreamEventType } from "@/stream/events";

export interface MapNode {
  id: string;
  name: string;
  kind: NodeKind;
  lat: number;
  lng: number;
  geofenceRadiusM: number;
  status: NodeStatus;
  batteryPct: number | null;
  linkQualityPct: number | null;
  lastHeartbeatAt: string | null;
}

export interface ActiveMapEvent {
  id: string;
  nodeId: string;
}

export interface LiveMapProps {
  nodes: MapNode[];
  /** Open confirmed/responding events — their nodes pulse. */
  activeEvents: ActiveMapEvent[];
}

const MAP_EVENT_TYPES: readonly StreamEventType[] = ["node-status", "event"];

const TILE_LAYERS: Record<Theme, { url: string; attribution: string }> = {
  light: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
};

// Same glyphs as NodeKindIcon, as strings for Leaflet divIcon HTML.
const KIND_GLYPHS: Record<NodeKind, string> = {
  village_boundary:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.5 12 4.5l8 7"/><path d="M6.5 10.5V19h11v-8.5"/><path d="M10.5 19v-5h3v5"/></svg>',
  rail_crossing:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v18M16 3v18"/><path d="M8 7.5h8M8 12h8M8 16.5h8"/></svg>',
  waterhole:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5c3.5 4.4 6 7.4 6 10.5a6 6 0 1 1-12 0c0-3.1 2.5-6.1 6-10.5Z"/></svg>',
};

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

export default function LiveMapInner({ nodes, activeEvents }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<{ theme: Theme; layer: L.TileLayer } | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const geofenceRef = useRef<L.Circle | null>(null);
  const nodesRef = useRef(new Map(nodes.map((node) => [node.id, { ...node }])));
  const activeEventsRef = useRef(
    new Map(activeEvents.map((event) => [event.id, event.nodeId])),
  );

  const nodePulses = useCallback((nodeId: string): boolean => {
    for (const pulsingNodeId of activeEventsRef.current.values()) {
      if (pulsingNodeId === nodeId) return true;
    }
    return false;
  }, []);

  const markerIcon = useCallback(
    (node: MapNode): L.DivIcon =>
      L.divIcon({
        className: "coexist-marker-anchor",
        html: `<span class="coexist-marker coexist-marker--${node.status}${
          nodePulses(node.id) ? " coexist-marker--pulse" : ""
        }">${KIND_GLYPHS[node.kind]}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -18],
      }),
    [nodePulses],
  );

  const applyMarkerA11y = useCallback((marker: L.Marker, node: MapNode) => {
    const element = marker.getElement();
    if (element === undefined) return;
    element.setAttribute("role", "button");
    element.setAttribute(
      "aria-label",
      `${node.name}, ${NODE_KIND_LABELS[node.kind]}, ${node.status}`,
    );
  }, []);

  const refreshMarker = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.get(nodeId);
      const marker = markersRef.current.get(nodeId);
      if (node === undefined || marker === undefined) return;
      marker.setIcon(markerIcon(node));
      applyMarkerA11y(marker, node);
    },
    [applyMarkerA11y, markerIcon],
  );

  const buildPopupContent = useCallback((nodeId: string): HTMLElement => {
    const node = nodesRef.current.get(nodeId);
    const root = document.createElement("div");
    root.className = "coexist-popup";
    if (node === undefined) return root;

    const title = document.createElement("p");
    title.className = "coexist-popup__title";
    title.textContent = node.name;
    root.append(title);

    const rows: Array<[string, string]> = [
      ["Kind", NODE_KIND_LABELS[node.kind]],
      ["Status", node.status],
      ["Battery", pct(node.batteryPct)],
      ["Link", pct(node.linkQualityPct)],
      [
        "Last beat",
        node.lastHeartbeatAt === null
          ? "never"
          : `${formatIstTime(node.lastHeartbeatAt)} IST`,
      ],
    ];
    for (const [label, value] of rows) {
      const row = document.createElement("p");
      row.className = "coexist-popup__row";
      const key = document.createElement("span");
      key.textContent = label;
      const val = document.createElement("span");
      val.className = "tnum";
      val.textContent = value;
      row.append(key, val);
      root.append(row);
    }

    const link = document.createElement("a");
    link.href = `/command/nodes/${node.id}`;
    link.className = "coexist-popup__link";
    link.textContent = "View node";
    root.append(link);

    return root;
  }, []);

  // Map lifecycle — created once, torn down on unmount.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null || mapRef.current !== null) return;

    const map = L.map(container, { zoomControl: true });
    map.attributionControl.setPrefix(false);
    mapRef.current = map;
    const markers = markersRef.current;

    const initialNodes = [...nodesRef.current.values()];
    if (initialNodes.length > 0) {
      map.fitBounds(
        L.latLngBounds(
          initialNodes.map((node) => [node.lat, node.lng] as [number, number]),
        ).pad(0.35),
        { maxZoom: 14 },
      );
    } else {
      map.setView([26.88, 88.87], 12);
    }

    for (const node of initialNodes) {
      const marker = L.marker([node.lat, node.lng], {
        icon: markerIcon(node),
        keyboard: true,
      }).addTo(map);
      // Bottom padding keeps popup actions clear of the attribution strip.
      marker.bindPopup(() => buildPopupContent(node.id), {
        autoPanPadding: L.point(24, 32),
      });
      marker.on("popupopen", () => {
        const current = nodesRef.current.get(node.id);
        if (current === undefined) return;
        geofenceRef.current?.remove();
        geofenceRef.current = L.circle([current.lat, current.lng], {
          radius: current.geofenceRadiusM,
          className: "coexist-geofence",
          weight: 1.5,
        }).addTo(map);
      });
      marker.on("popupclose", () => {
        geofenceRef.current?.remove();
        geofenceRef.current = null;
      });
      markers.set(node.id, marker);
      applyMarkerA11y(marker, node);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      markers.clear();
      geofenceRef.current = null;
    };
  }, [applyMarkerA11y, buildPopupContent, markerIcon]);

  // Tile layer follows the resolved theme (light OSM / dark CARTO).
  useEffect(() => {
    function syncTiles() {
      const map = mapRef.current;
      if (map === null) return;
      const theme = getTheme();
      if (tileRef.current?.theme === theme) return;
      tileRef.current?.layer.remove();
      const spec = TILE_LAYERS[theme];
      tileRef.current = {
        theme,
        layer: L.tileLayer(spec.url, {
          attribution: spec.attribution,
          maxZoom: 18,
        }).addTo(map),
      };
    }

    syncTiles();
    return subscribeTheme(syncTiles);
  }, []);

  // Live deltas: node health recolors its marker, confirmed events pulse.
  const onStreamEvent = useCallback(
    (streamEvent: { type: string; payload: unknown }) => {
      if (streamEvent.type === "node-status") {
        const payload = streamEvent.payload as {
          nodeId: string;
          status: NodeStatus;
          batteryPct: number | null;
          linkQualityPct: number | null;
          lastHeartbeatAt: string | null;
        };
        const node = nodesRef.current.get(payload.nodeId);
        if (node === undefined) return;
        node.status = payload.status;
        node.batteryPct = payload.batteryPct;
        node.linkQualityPct = payload.linkQualityPct;
        node.lastHeartbeatAt = payload.lastHeartbeatAt;
        refreshMarker(payload.nodeId);
        return;
      }
      if (streamEvent.type === "event") {
        const payload = streamEvent.payload as {
          id: string;
          nodeId: string;
          state: string;
        };
        if (payload.state === "confirmed" || payload.state === "responding") {
          activeEventsRef.current.set(payload.id, payload.nodeId);
        } else {
          activeEventsRef.current.delete(payload.id);
        }
        refreshMarker(payload.nodeId);
      }
    },
    [refreshMarker],
  );

  useLiveStream({ types: MAP_EVENT_TYPES, onEvent: onStreamEvent });

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      aria-label="Live network map"
    />
  );
}
