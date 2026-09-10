"use client";
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, Rectangle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon in Leaflet + Next.js
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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
    <div style={{ height: '400px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
      <MapContainer 
        center={currentCenter} 
        zoom={6} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={interactive}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {interactive && setPosition && (
          <LocationMarker position={position} setPosition={setPosition} />
        )}
        
        {!interactive && position && (
          <Marker position={position} />
        )}

        {bounds && (
          <Rectangle 
            bounds={bounds} 
            pathOptions={{ color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.2 }} 
          />
        )}
      </MapContainer>
    </div>
  );
}
