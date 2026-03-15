import { Circle, useMap } from 'react-leaflet';
import { useEffect, useRef } from 'react';

interface AnimatedCircleProps {
  center: [number, number];
  radius: number;
  color?: string;
  fillColor?: string;
  minOpacity?: number;
  maxOpacity?: number;
  speed?: number; // how fast the fade in/out is
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  blur?: number; // optional blur in pixels
}

export const AnimatedCircle = ({
  center,
  radius,
  color,
  fillColor,
  minOpacity = 0.2,
  maxOpacity = 0.5,
  speed = 0.01,
  blur = 0, // default no blur
}: AnimatedCircleProps) => {
  const circleRef = useRef<L.Circle>(null);

  useEffect(() => {
    let opacity = minOpacity;
    let direction = 1; // 1 = increasing, -1 = decreasing

    const interval = setInterval(() => {
      if (!circleRef.current) return;

      // Update opacity
      opacity += direction * speed;

      if (opacity >= maxOpacity) direction = -1;
      if (opacity <= minOpacity) direction = 1;

      // Apply new style
      circleRef.current.setStyle({ fillOpacity: opacity, opacity });
      
    }, 50); // update every 50ms for smooth animation

    return () => clearInterval(interval);
  }, [minOpacity, maxOpacity, speed]);

  return (
    <Circle
      ref={circleRef}
      center={center}
      radius={radius}
      pathOptions={{ color, fillColor, fillOpacity: minOpacity }}

      className={blur > 0 ? "blurred-circle" : undefined}
    />
  );
};