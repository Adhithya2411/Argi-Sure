#!/usr/bin/env python3
import json
import time
import os
import urllib.request
from datetime import datetime

# =======================================================================
# Real Data Ingestion Pipeline
# Source: United States Geological Survey (USGS) Live Earthquake API
# =======================================================================

DATASET_NAME = "USGS_Severe_Earthquakes"
OUTPUT_DIR = "datasets"
# Public, no-auth URL for all earthquakes in the past 30 days
USGS_API_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson"

def fetch_real_disaster_data():
    """
    Fetches LIVE data from the USGS government API.
    """
    print(f"[{datetime.now().isoformat()}] Fetching LIVE 30-day dataset from USGS (earthquake.usgs.gov)...")
    
    req = urllib.request.Request(USGS_API_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        
    print(f"[{datetime.now().isoformat()}] Downloaded dataset containing {len(data['features'])} geological events.")
    return data['features']

def filter_and_create_bounding_boxes(features, min_magnitude=5.0, bbox_radius_deg=0.5):
    """
    Filters for severe disasters (e.g., Mag > 5.0) and converts their epicenter 
    point into a 4-point geospatial bounding box (Oracle Trigger Zone).
    """
    severe_events = []
    
    for feature in features:
        mag = feature['properties']['mag']
        
        # Only process severe disasters
        if mag is not None and mag >= min_magnitude:
            coords = feature['geometry']['coordinates']
            lon = coords[0]
            lat = coords[1]
            
            # Create a bounding box around the epicenter
            # 1 degree of latitude is roughly 111 km. 0.5 degrees creates a large disaster zone.
            minLat = lat - bbox_radius_deg
            maxLat = lat + bbox_radius_deg
            minLon = lon - bbox_radius_deg
            maxLon = lon + bbox_radius_deg
            
            severe_events.append({
                "event_id": feature['id'],
                "event_type": "Severe Earthquake",
                "location": feature['properties']['place'],
                "severity_index": mag,
                "timestamp": feature['properties']['time'],
                "geometry": {
                    "type": "BoundingBox",
                    "minLat": minLat,
                    "maxLat": maxLat,
                    "minLon": minLon,
                    "maxLon": maxLon
                }
            })
            
    print(f"[{datetime.now().isoformat()}] Filtered down to {len(severe_events)} severe disaster events (Magnitude >= {min_magnitude}).")
    return severe_events

def process_and_scale_data(events):
    """
    Scales the bounding box coordinates by 10^7 for Zero-Knowledge Circuit compatibility.
    """
    SCALE_FACTOR = 10000000
    processed = []
    
    for event in events:
        geom = event["geometry"]
        processed.append({
            "event_id": event["event_id"],
            "type": event["event_type"],
            "location": event["location"],
            "severity_magnitude": event["severity_index"],
            "oracle_payload": {
                "minLat": int(geom["minLat"] * SCALE_FACTOR),
                "maxLat": int(geom["maxLat"] * SCALE_FACTOR),
                "minLon": int(geom["minLon"] * SCALE_FACTOR),
                "maxLon": int(geom["maxLon"] * SCALE_FACTOR),
            }
        })
    return processed

def main():
    print("==========================================================")
    print(" Zk-AgriSure: Real USGS Climate/Geological Data Ingestion ")
    print("==========================================================")
    
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    try:
        # 1. Download real dataset
        raw_features = fetch_real_disaster_data()
        
        # 2. Filter & build geometries
        severe_events = filter_and_create_bounding_boxes(raw_features, min_magnitude=5.5)
        
        # 3. Scale for ZK / Smart Contract
        processed_events = process_and_scale_data(severe_events)
        
        # 4. Save to disk
        output_file = os.path.join(OUTPUT_DIR, f"{DATASET_NAME}_{int(time.time())}.json")
        with open(output_file, 'w') as f:
            json.dump(processed_events, f, indent=4)
            
        print(f"[{datetime.now().isoformat()}] Successfully parsed dataset.")
        print(f"[{datetime.now().isoformat()}] Real Dataset saved locally at: {output_file}")
        print(f"\nSaved {len(processed_events)} REAL events ready for Chainlink Oracle ingestion.")
        
    except Exception as e:
        print(f"Error fetching real dataset: {e}")

if __name__ == "__main__":
    main()
