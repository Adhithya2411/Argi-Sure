#!/usr/bin/env python3
"""
Zk-AgriSure: ML Disaster Prediction & Bounding Box Generator
Predicts disaster severity and outputs the exact 4-point bounding box
scaled by 10^7 with offsets matching the Circom ZK circuit and smart contracts.
"""

import sys
import os
import json
import argparse
import numpy as np
import joblib

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "disaster_ml_model.joblib")
SCALE_FACTOR = 10_000_000
LAT_OFFSET = 900_000_000
LON_OFFSET = 1_800_000_000

def get_model():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Trained model not found at {MODEL_PATH}. Run python ml/train_disaster_model.py first.")
    return joblib.load(MODEL_PATH)

def predict_disaster(lat, lon, depth_km=10.0, base_radius_deg=0.5):
    pipeline = get_model()
    clf = pipeline["classifier"]
    reg = pipeline["regressor"]
    feature_names = pipeline.get("features", ["latitude", "longitude", "depth_km", "dist_equator", "dist_meridian"])

    import pandas as pd
    features = pd.DataFrame([{
        "latitude": float(lat),
        "longitude": float(lon),
        "depth_km": float(depth_km),
        "dist_equator": abs(float(lat)),
        "dist_meridian": abs(float(lon))
    }], columns=feature_names)

    is_severe_prob = float(clf.predict_proba(features)[0][1])
    predicted_mag = float(reg.predict(features)[0])
    
    # Adaptive disaster radius based on predicted magnitude
    # Stronger disaster expands the red zone bounding box
    radius = base_radius_deg * max(1.0, (predicted_mag / 4.5))

    # GPS coordinates
    min_lat_gps = max(-90.0, lat - radius)
    max_lat_gps = min(90.0, lat + radius)
    min_lon_gps = max(-180.0, lon - radius)
    max_lon_gps = min(180.0, lon + radius)

    # Scaled integer coordinates for ZK circuit & on-chain storage
    min_lat_u = int(round(min_lat_gps * SCALE_FACTOR)) + LAT_OFFSET
    max_lat_u = int(round(max_lat_gps * SCALE_FACTOR)) + LAT_OFFSET
    min_lon_u = int(round(min_lon_gps * SCALE_FACTOR)) + LON_OFFSET
    max_lon_u = int(round(max_lon_gps * SCALE_FACTOR)) + LON_OFFSET

    return {
        "status": "Severe Disaster" if is_severe_prob >= 0.5 else "Normal",
        "disaster_probability": round(is_severe_prob, 4),
        "predicted_magnitude": round(predicted_mag, 2),
        "impact_radius_deg": round(radius, 3),
        "gps_bounding_box": {
            "minLat": round(min_lat_gps, 5),
            "maxLat": round(max_lat_gps, 5),
            "minLon": round(min_lon_gps, 5),
            "maxLon": round(max_lon_gps, 5)
        },
        "on_chain_box": {
            "minLat": min_lat_u,
            "maxLat": max_lat_u,
            "minLon": min_lon_u,
            "maxLon": max_lon_u
        }
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Predict disaster risk for coordinates")
    parser.add_argument("--lat", type=float, default=30.2672, help="Latitude (default: Austin TX 30.2672)")
    parser.add_argument("--lon", type=float, default=-97.7431, help="Longitude (default: Austin TX -97.7431)")
    parser.add_argument("--depth", type=float, default=10.0, help="Depth in km")
    args = parser.parse_args()

    result = predict_disaster(args.lat, args.lon, args.depth)
    print(json.dumps(result, indent=2))
