#!/usr/bin/env python3
import json
import time
import os
from datetime import datetime, timedelta

# Simulating data ingestion from NOAA Severe Weather Data Inventory (SWDI) or NASA GPM
# For Review 2: We demonstrate the ingestion pipeline that pulls macro-level climate events
# and prepares the 4-point bounding boxes for the Chainlink Oracle.

DATASET_NAME = "NOAA_Storm_Events_Mock"
OUTPUT_DIR = "datasets"

def fetch_noaa_disaster_data():
    """
    Simulates fetching real-time or historical geospatial bounds of severe weather events.
    In production, this would make an API call to NOAA's REST API or parse an incoming CSV.
    """
    print(f"[{datetime.now().isoformat()}] Initiating secure connection to NOAA Data Sources...")
    time.sleep(1.5)
    
    # Mocking a JSON response from a climate authority
    mock_api_response = [
        {
            "event_id": "NOAA-FLD-2026-881",
            "event_type": "Severe Flash Flood",
            "state": "TAMIL_NADU",
            "severity_index": 8.5,
            "timestamp": datetime.now().isoformat(),
            "geometry": {
                "type": "BoundingBox",
                # Real world: Floating point GPS
                "minLat": 12.9700000,
                "maxLat": 12.9800000,
                "minLon": 79.1500000,
                "maxLon": 79.1600000
            }
        },
        {
            "event_id": "NOAA-DRT-2026-002",
            "event_type": "Prolonged Agricultural Drought",
            "state": "KARNATAKA",
            "severity_index": 9.1,
            "timestamp": (datetime.now() - timedelta(days=2)).isoformat(),
            "geometry": {
                "type": "BoundingBox",
                "minLat": 13.0100000,
                "maxLat": 13.0500000,
                "minLon": 77.5000000,
                "maxLon": 77.6000000
            }
        }
    ]
    
    print(f"[{datetime.now().isoformat()}] Received {len(mock_api_response)} anomaly events from dataset.")
    return mock_api_response

def process_and_scale_data(events):
    """
    Prepares the data for the Smart Contract / Oracle.
    Translates the floats into scaled integers (10^7) to match the ZK Circuit finite-field requirements.
    """
    SCALE_FACTOR = 10000000
    processed = []
    
    for event in events:
        geom = event["geometry"]
        processed.append({
            "event_id": event["event_id"],
            "type": event["event_type"],
            "oracle_payload": {
                "minLat": int(geom["minLat"] * SCALE_FACTOR),
                "maxLat": int(geom["maxLat"] * SCALE_FACTOR),
                "minLon": int(geom["minLon"] * SCALE_FACTOR),
                "maxLon": int(geom["maxLon"] * SCALE_FACTOR),
            }
        })
    return processed

def main():
    print("==================================================")
    print(" Zk-AgriSure: Climate Dataset Ingestion Pipeline  ")
    print("==================================================")
    
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    raw_events = fetch_noaa_disaster_data()
    processed_events = process_and_scale_data(raw_events)
    
    output_file = os.path.join(OUTPUT_DIR, f"{DATASET_NAME}_{int(time.time())}.json")
    
    with open(output_file, 'w') as f:
        json.dump(processed_events, f, indent=4)
        
    print(f"[{datetime.now().isoformat()}] Successfully processed dataset.")
    print(f"[{datetime.now().isoformat()}] Data ready for ML Training & Oracle Ingestion at: {output_file}")
    
    # Review 2 ML Scope Plan Printout
    print("\n--- ML Scope (Review 3 Readiness) ---")
    print("This dataset acts as the foundational truth. In Phase 3, an ML Model (e.g. Random Forest/LSTM)")
    print("will be trained on historical NOAA datasets to accurately predict the geometric bounding boxes")
    print("based on incoming satellite climate telemetry. This predictive output will automatically drive")
    print("the Chainlink DON to trigger the Escrow smart contracts trustlessly.")

if __name__ == "__main__":
    main()
