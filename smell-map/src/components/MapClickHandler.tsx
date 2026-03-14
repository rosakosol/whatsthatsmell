import { useMapEvents } from "react-leaflet";

export default function MapClickHandler({ onClick }: any) {
  useMapEvents({
    click(e: any) {
      onClick(e.latlng);
    }
  });

  return null;
}