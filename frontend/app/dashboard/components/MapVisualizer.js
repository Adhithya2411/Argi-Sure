"use client";
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap, Rectangle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon in Leaflet + Next.js
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapUpdater({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 13);
    }
  }, [position, map]);
  return null;
}

function LocationMarker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      if (setPosition) {
        setPosition([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  return position === null ? null : (
    <Marker position={position}></Marker>
  );
}

export default function MapVisualizer({ 
  interactive = true, 
  position, 
  setPosition, 
  disasterZone = null 
}) {
  const defaultCenter = [12.9716, 77.5946]; // Bangalore roughly
  const currentCenter = position || defaultCenter;

  const bounds = disasterZone ? [
    [disasterZone.minLat, disasterZone.minLon],
    [disasterZone.maxLat, disasterZone.maxLon]
  ] : null;

  return (
    <div style={{ 
      height: '400px',
      maxHeight: '40vh',
      minHeight: '300px',
      width: '100%', 
      borderRadius: '16px', 
      overflow: 'hidden', 
      border: '1px solid rgba(255,255,255,0.05)',
      boxShadow: '0 10px 30px -10px rgba(0,0,0,0.8)'
    }}>
      <MapContainer 
        center={currentCenter} 
        zoom={6} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={interactive}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapUpdater position={position} />
        
        {interactive && setPosition && (
          <LocationMarker position={position} setPosition={setPosition} />
        )}
        
        {!interactive && position && (
          <Marker position={position} />
        )}

        {bounds && (
          <Rectangle 
            bounds={bounds} 
            pathOptions={{ 
              color: '#ef4444', 
              weight: 3, 
              fillColor: '#ef4444', 
              fillOpacity: 0.3,
              className: 'radar-polygon' 
            }} 
          />
        )}
      </MapContainer>
      <style jsx global>{`
        .radar-polygon {
          animation: pulseGlow 2s infinite;
        }
        @keyframes pulseGlow {
          0% { filter: drop-shadow(0 0 2px rgba(239, 68, 68, 0.8)); }
          50% { filter: drop-shadow(0 0 15px rgba(239, 68, 68, 1)); }
          100% { filter: drop-shadow(0 0 2px rgba(239, 68, 68, 0.8)); }
        }
      `}</style>
    </div>
  );
}
