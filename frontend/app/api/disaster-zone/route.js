import { NextResponse } from 'next/server';

export async function GET() {
  // Real world: This would connect to a weather API (like OpenWeatherMap)
  // and compute a bounding box. For demonstration, we serve the active disaster zone
  // scaled up by 10^7, ready for the Chainlink Oracle to ingest.
  
  const data = {
    minLat: 129700000,
    maxLat: 129800000,
    minLon: 791500000,
    maxLon: 791600000,
    isActive: true,
    timestamp: new Date().toISOString()
  };

  return NextResponse.json(data);
}
