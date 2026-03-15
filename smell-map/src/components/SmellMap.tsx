// @ts-nocheck
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Filter } from "bad-words";
import MapClickHandler from "./MapClickHandler";
import { motion } from "motion/react"
import { AnimatedCircle } from "./Circle";

const filter = new Filter();

filter.removeWords(
  "shit",
  "bullshit",
  "shithead",
  "shitface",
  "fuck",
  "fucker",
  "fucking",
  "motherfucker"
);


type SmellReport = {
  id: string;
  lat: number;
  lng: number;
  intensity: number;
  description?: string;
  createdAt?: Date;
};

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function formatDateWithOrdinal(date: Date) {
  const day = date.getDate();
  const j = day % 10;
  const k = day % 100;

  let suffix = "th";
  if (j === 1 && k !== 11) suffix = "st";
  else if (j === 2 && k !== 12) suffix = "nd";
  else if (j === 3 && k !== 13) suffix = "rd";

  const month = date.toLocaleString("en-GB", { month: "long" });
  const year = date.getFullYear();
  const time = date.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `${day}${suffix} ${month}, ${year} at ${time}`;
}

const userIcon = L.divIcon({
  className: "user-location-icon",
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#0066ff;border:2px solid #ffffff;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const ACTIVE_MS = 60 * 60 * 1000;       // 1 hour – show as full marker
const HISTORY_MS = 24 * 60 * 60 * 1000; // 24 hours – show in history / red dot
const HOTSPOT_LOOKUP_RADIUS_M = 1000; // reports within this form a hotspot cluster
const HOTSPOT_MIN_COUNT = 5;          // min reports in cluster to show mist
const MIN_CIRCLE_RADIUS_M = 40;      // minimum circle size so it's visible

const DAILY_LIMIT = 10;
const STORAGE_KEY = "smell-report-daily-usage";

function getTodayKey() {
  const now = new Date();
  return now.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getDailyUsage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { date: getTodayKey(), count: 0 };
    }
    const parsed = JSON.parse(raw);
    if (parsed.date !== getTodayKey()) {
      return { date: getTodayKey(), count: 0 };
    }
    return parsed;
  } catch {
    return { date: getTodayKey(), count: 0 };
  }
}

function incrementDailyUsage() {
  const usage = getDailyUsage();
  const next = { date: usage.date, count: usage.count + 1 };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Green-mist circles derived from pin positions: each circle's center is the
 * centroid of a cluster (≥5 reports within 1km), and its radius is the distance
 * from that centroid to the farthest pin (so the circle wraps the pins).
 */
function getHotspotCircles(
  reports: SmellReport[],
  windowMs: number = ACTIVE_MS // default to active reports only
): { center: [number, number]; radius: number }[] {
  const now = Date.now();

  // Filter only reports within the active window
  const activeReports = reports.filter(
    (r) => r.createdAt && r.createdAt.getTime() >= now - windowMs
  );

  const seen = new Set<string>();
  const result: { center: [number, number]; radius: number }[] = [];

  for (const r of activeReports) {
    // Find nearby active reports
    const nearby = activeReports.filter(
      (other) => distanceMeters(r.lat, r.lng, other.lat, other.lng) <= HOTSPOT_LOOKUP_RADIUS_M
    );

    // Must meet minimum count to qualify as hotspot
    if (nearby.length < HOTSPOT_MIN_COUNT) continue;

    // Calculate centroid
    const centerLat = nearby.reduce((s, n) => s + n.lat, 0) / nearby.length;
    const centerLng = nearby.reduce((s, n) => s + n.lng, 0) / nearby.length;

    // Calculate radius to farthest report
    const radius = Math.max(
      MIN_CIRCLE_RADIUS_M,
      ...nearby.map((n) => distanceMeters(centerLat, centerLng, n.lat, n.lng))
    );

    // Avoid duplicates (cluster same location once)
    const key = `${centerLat.toFixed(3)},${centerLng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({ center: [centerLat, centerLng], radius });
  }

  return result;
}
function getLocationKey(lat: number, lng: number) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function getReportsInWindow(reports: SmellReport[], windowMs: number) {
  const cutoff = Date.now() - windowMs;
  return reports.filter((r) => r.createdAt && r.createdAt.getTime() >= cutoff);
}

function groupReportsByLocation(reports: SmellReport[]): Map<string, SmellReport[]> {
  const map = new Map<string, SmellReport[]>();
  for (const r of reports) {
    const key = getLocationKey(r.lat, r.lng);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }
  return map;
}

export default function SmellMap() {
  const [reports, setReports] = useState<SmellReport[]>([]);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);

  // On load, try to center on user's live location
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocationError("Location is not available in this browser.");
      // Fallback: Melbourne CBD
      setCenter([-37.8136, 144.9631]);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const nextPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserPosition(nextPos);
        // If we don't have a center yet, use the first position to center the map
        setCenter((current) => current ?? nextPos);
      },
      (err) => {
        console.error("Geolocation error", err);
        setLocationError("Couldn't get your location. Showing default view.");
        // Fallback: Melbourne CBD
        setCenter([-37.8136, 144.9631]);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "smellReports"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const next: SmellReport[] = snapshot.docs.map((doc) => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          lat: data.lat,
          lng: data.lng,
          intensity: data.intensity,
          description: data.description,
          createdAt: data.createdAt?.toDate?.(),
        };
      });

      setReports(next);
    });

    return () => unsubscribe();
  }, []);

  async function handleMapClick(coords: { lat: number; lng: number }) {
    const usage = getDailyUsage();
    if (usage.count >= DAILY_LIMIT) {
      window.alert("You have reached the daily limit of smell reports. Please try again tomorrow.");
      return;
    }

    const intensityStr = window.prompt("How smelly is it? (1-5)");
    if (!intensityStr) return;

    const intensity = Number(intensityStr);
    if (Number.isNaN(intensity) || intensity < 1 || intensity > 5) {
      window.alert("Please enter a number from 1 to 5.");
      return;
    }

    let description: string | null = window.prompt("Describe the smell (required)");
    while (description !== null) {
      const trimmed = (description || "").trim();
      if (trimmed === "") {
        window.alert("Description is required to submit a smell report.");
        description = window.prompt("Describe the smell (required)");
        continue;
      }
      if (filter.isProfane(trimmed)) {
        window.alert("You cannot enter offensive terms. Please re-enter your description.");
        description = window.prompt("Describe the smell (required)");
        continue;
      }
      description = trimmed;
      break;
    }
    if (description === null) return;

    try {
      console.log("DB instance:", db);
      await addDoc(collection(db, "smellReports"), {
        lat: coords.lat,
        lng: coords.lng,
        intensity,
        description,
        createdAt: serverTimestamp(),
      });
      incrementDailyUsage();
    } catch (e) {
      console.error("Failed to save smell report", e);
      window.alert("Sorry, something went wrong saving your smell report.");
    }
  }

  if (!center) {
    return (
      <div style={{ height: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p>Getting your location...</p>
      </div>
    );
  }

  return (
    <>
      {locationError && (
        <p style={{ color: "#cc0000", marginBottom: "0.5rem" }}>
          {locationError}
        </p>
      )}

      <MapContainer
        className="rounded-lg"
        key={center.join(",")}
        center={center}
        zoom={15}
        style={{ height: "80vh", width: "90vw", margin: "auto" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapClickHandler onClick={handleMapClick} />

        {getHotspotCircles(getReportsInWindow(reports, HISTORY_MS)).map(({ center, radius }, i) => (
          <AnimatedCircle
          color="transparent"
          fillColor="#228b22"
          fillOpacity={0.35}
          blur={8}
            key={`hotspot-${i}`}
            center={center}
            radius={radius}
            pathOptions={{
              weight: 0,
              className: "hotspot-mist",
            }}
          />
        ))}

        {userPosition && (
          <>
            <AnimatedCircle
              center={userPosition}
              radius={200} // 500 meters radius
              color="#0066ff"
              fillColor="#3388ff"
              fillOpacity={0.2}
            />
            <Marker position={userPosition} icon={userIcon}>
              <Popup>You are here</Popup>
            </Marker>
          </>
        )}

        {(() => {
          const inLast24h = getReportsInWindow(reports, HISTORY_MS);
          const activeReports = getReportsInWindow(reports, ACTIVE_MS);
          const byLocation = groupReportsByLocation(inLast24h);

          const elements: React.ReactNode[] = [];

          byLocation.forEach((groupReports, locationKey) => {
            const latest = groupReports[0];
            const position: [number, number] = [latest.lat, latest.lng];
            const hasActive = groupReports.some((r) =>
              r.createdAt && r.createdAt.getTime() >= Date.now() - ACTIVE_MS
            );

            const historyList = (
              <ul style={{ margin: "0.5rem 0 0 0", paddingLeft: "1.2rem" }}>
                {groupReports.map((r) => (
                  <li key={r.id} style={{ marginBottom: "0.25rem" }}>
                    <strong>{r.intensity}/5</strong>
                    {r.description && ` – ${r.description}`}
                    {r.createdAt && (
                      <small style={{ display: "block" }}>
                        {formatDateWithOrdinal(r.createdAt)}
                      </small>
                    )}
                  </li>
                ))}
              </ul>
            );

            if (hasActive) {
              elements.push(
                <Marker
                  key={`active-${locationKey}`}
                  position={position}
                  icon={defaultIcon as any}
                >
                  <Popup>
                    <div>
                      <strong>Smell intensity:</strong> {latest.intensity}/5
                      {latest.description && (
                        <>
                          <br />
                          <strong>Description:</strong> {latest.description}
                        </>
                      )}
                      {latest.createdAt && (
                        <>
                          <br />
                          <small>
                            Reported at: {formatDateWithOrdinal(latest.createdAt)}
                          </small>
                        </>
                      )}
                      {groupReports.length > 1 && (
                        <>
                          <br />
                          <strong style={{ marginTop: "0.5rem", display: "block" }}>
                            Past reports here (24h):
                          </strong>
                          <ul style={{ margin: "0.5rem 0 0 0", paddingLeft: "1.2rem" }}>
                            {groupReports.slice(1).map((r) => (
                              <li key={r.id} style={{ marginBottom: "0.25rem" }}>
                                <strong>{r.intensity}/5</strong>
                                {r.description && ` – ${r.description}`}
                                {r.createdAt && (
                                  <small style={{ display: "block" }}>
                                    {formatDateWithOrdinal(r.createdAt)}
                                  </small>
                                )}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            } else {
              elements.push(
                <CircleMarker
                  key={`history-${locationKey}`}
                  center={position}
                  radius={6}
                  pathOptions={{
                    color: "#c00",
                    fillColor: "#e00",
                    fillOpacity: 0.9,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div>
                      <strong>Smell report history (24h)</strong>
                      {historyList}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            }
          });

          return elements;
        })()}
      </MapContainer>
    </>
  );
}