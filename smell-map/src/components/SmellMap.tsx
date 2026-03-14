// @ts-nocheck
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import MapClickHandler from "./MapClickHandler";

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

const DAILY_LIMIT = 50;
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
      window.alert("You have reached the daily limit of smell reports (50). Please try again tomorrow.");
      return;
    }

    const intensityStr = window.prompt("How smelly is it? (1–5)");
    if (!intensityStr) return;

    const intensity = Number(intensityStr);
    if (Number.isNaN(intensity) || intensity < 1 || intensity > 5) {
      window.alert("Please enter a number from 1 to 5.");
      return;
    }

    const description = window.prompt("Optional: describe the smell");

    try {
      await addDoc(collection(db, "smellReports"), {
        lat: coords.lat,
        lng: coords.lng,
        intensity,
        description: description || "",
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
        key={center.join(",")}
        center={center}
        zoom={15}
        style={{ height: "80vh", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapClickHandler onClick={handleMapClick} />

        {userPosition && (
          <>
            <Circle
              center={userPosition}
              radius={500} // 500 meters radius
              pathOptions={{
                color: "#0066ff",
                fillColor: "#3388ff",
                fillOpacity: 0.2,
              }}
            />
            <Marker position={userPosition} icon={userIcon}>
              <Popup>You are here</Popup>
            </Marker>
          </>
        )}

        {reports.map((report) => (
          <Marker
            key={report.id}
            position={[report.lat, report.lng]}
            icon={defaultIcon as any}
          >
            <Popup>
              <div>
                <strong>Smell intensity:</strong> {report.intensity}/5
                {report.description && (
                  <>
                    <br />
                    <strong>Description:</strong> {report.description}
                  </>
                )}
                {report.createdAt && (
                  <>
                    <br />
                    <small>
                      Reported at:{" "}
                      {formatDateWithOrdinal(report.createdAt)}
                    </small>
                  </>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </>
  );
}