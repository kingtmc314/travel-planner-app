/**
 * MAP COMPONENT - Leaflet + OpenStreetMap
 *
 * Uses Leaflet with OpenStreetMap tiles - no API key required, no Origin restrictions.
 *
 * USAGE:
 * ======
 * import { MapView, type LeafletMap } from "@/components/Map";
 *
 * const mapRef = useRef<LeafletMap | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 35.6762, lng: 139.6503 }}
 *   initialZoom={12}
 *   onMapReady={(map) => {
 *     mapRef.current = map;
 *     // Add markers, layers, etc.
 *   }}
 * />
 *
 * ADDING MARKERS:
 * ---------------
 * import L from "leaflet";
 * const marker = L.marker([lat, lng]).addTo(map);
 * marker.bindPopup("<b>Title</b><br>Notes");
 *
 * CLICK EVENTS:
 * -------------
 * map.on("click", (e: L.LeafletMouseEvent) => {
 *   const { lat, lng } = e.latlng;
 * });
 *
 * FIT BOUNDS:
 * -----------
 * const bounds = L.latLngBounds(pins.map(p => [p.lat, p.lng]));
 * map.fitBounds(bounds, { padding: [40, 40] });
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export type LeafletMap = L.Map;

interface MapViewProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  onMapReady?: (map: L.Map) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 35.6762, lng: 139.6503 },
  initialZoom = 12,
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    const map = L.map(mapContainer.current, {
      center: [initialCenter.lat, initialCenter.lng],
      zoom: initialZoom,
      zoomControl: true,
    });

    // OpenStreetMap tiles - free, no API key needed
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapInstance.current = map;

    if (onMapReady) {
      onMapReady(map);
    }

    return () => {
      map.remove();
      mapInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={mapContainer} className={cn("w-full h-[500px]", className)} />
  );
}
