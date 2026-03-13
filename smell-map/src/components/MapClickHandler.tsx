import { useMapEvents } from "react-leaflet";

export default function MapClickHandler({ onClick }: any) {
  useMapEvents({
    click(e) {
      onClick(e.latlng);
    }
  });

  return null;
}