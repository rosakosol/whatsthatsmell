// @ts-nocheck
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
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

  return (
    <MapContainer
      center={[-37.8136, 144.9631]}
      zoom={13}
      style={{ height: "80vh", width: "100%" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapClickHandler onClick={handleMapClick} />

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
                    {report.createdAt.toLocaleString()}
                  </small>
                </>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}