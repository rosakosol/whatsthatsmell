import { MapContainer, TileLayer, useMapEvents } from "react-leaflet";

function MapClickHandler({ onClick }: { onClick: (coords: any) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng);
    }
  });

  return null;
}

export default function SmellMap() {

  function handleMapClick(coords: any) {
    console.log("Clicked at:", coords);
  }

  return (
    <MapContainer
      center={[-37.8136, 144.9631]}
      zoom={13}
      style={{ height: "80vh" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapClickHandler onClick={handleMapClick} />

    </MapContainer>
  );
}