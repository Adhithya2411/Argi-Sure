import { NextResponse } from 'next/server';
import brain from 'brain.js';
import fs from 'fs';
import path from 'path';

// Always compute fresh - never serve a cached disaster list
export const dynamic = 'force-dynamic';

// Configuration (override in frontend/.env.local)
//  USGS_FEED_URL          - any USGS GeoJSON summary feed
//  DISASTER_MIN_MAGNITUDE - events below this magnitude are not insured disasters
//  DISASTER_RADIUS_DEG    - half-width of the trigger zone around the epicentre
const USGS_FEED_URL = process.env.USGS_FEED_URL
    || 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';
const MIN_MAGNITUDE = Number(process.env.DISASTER_MIN_MAGNITUDE ?? 5.5);
const RADIUS_DEG = Number(process.env.DISASTER_RADIUS_DEG ?? 0.5);

// Bounding boxes are returned as signed GPS * 10^7 (same scale as the ZK circuit inputs)
const SCALE = 1e7;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function toZone(lat, lon) {
    // Clamp to valid GPS ranges so the on-chain range check (MAX_LAT_U / MAX_LON_U) never fails
    return {
        minLat: Math.round(clamp(lat - RADIUS_DEG, -90, 90) * SCALE),
        maxLat: Math.round(clamp(lat + RADIUS_DEG, -90, 90) * SCALE),
        minLon: Math.round(clamp(lon - RADIUS_DEG, -180, 180) * SCALE),
        maxLon: Math.round(clamp(lon + RADIUS_DEG, -180, 180) * SCALE),
    };
}

async function fetchLiveEvents() {
    const res = await fetch(USGS_FEED_URL, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`USGS feed HTTP ${res.status}`);
    const geo = await res.json();
    return geo.features
        .filter(f => typeof f.properties?.mag === 'number' && f.properties.mag >= MIN_MAGNITUDE)
        .map(f => {
            const [lon, lat] = f.geometry.coordinates;
            return {
                eventId: f.id,
                location: f.properties.place,
                magnitude: f.properties.mag,
                time: new Date(f.properties.time).toISOString(),
                url: f.properties.url,
                center: { lat, lon },
                boundingBox: toZone(lat, lon),
            };
        });
}

// Used only if the live USGS API is unreachable: the most recent USGS download
// produced by scripts/dataset_ingestion.py (still real USGS data, flagged as a snapshot).
function loadSnapshotEvents() {
    const dir = path.join(process.cwd(), '../datasets');
    if (!fs.existsSync(dir)) return null;
    const file = fs.readdirSync(dir).filter(f => /^USGS_.*\.json$/.test(f)).sort().pop();
    if (!file) return null;
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    return {
        file,
        events: data
            .filter(e => e.severity_magnitude >= MIN_MAGNITUDE)
            .map(e => {
                const p = e.oracle_payload;
                const lat = (p.minLat + p.maxLat) / 2 / SCALE;
                const lon = (p.minLon + p.maxLon) / 2 / SCALE;
                return {
                    eventId: e.event_id,
                    location: e.location,
                    magnitude: e.severity_magnitude,
                    time: null,
                    url: null,
                    center: { lat, lon },
                    boundingBox: toZone(lat, lon),
                };
            }),
    };
}

function loadModel() {
    const modelPath = path.join(process.cwd(), '../data/trained_model.json');
    if (!fs.existsSync(modelPath)) return null;
    const net = new brain.NeuralNetwork();
    net.fromJSON(JSON.parse(fs.readFileSync(modelPath, 'utf8')));
    return net;
}

export async function GET() {
    try {
        let events;
        let source;
        try {
            events = await fetchLiveEvents();
            source = { type: 'usgs-live', feed: USGS_FEED_URL };
        } catch (liveErr) {
            const snap = loadSnapshotEvents();
            if (!snap) {
                return NextResponse.json({ error: `USGS live feed unavailable (${liveErr.message}) and no local snapshot found.` }, { status: 502 });
            }
            events = snap.events;
            source = { type: 'usgs-snapshot', file: snap.file, reason: liveErr.message };
        }

        // Score each event with the trained model (trained on lat/lon -> magnitude/10, see scripts/train_ml_model.cjs)
        const net = loadModel();
        for (const ev of events) {
            if (net) {
                const out = net.run({
                    lat: (ev.center.lat + 90) / 180,
                    lon: (ev.center.lon + 180) / 360,
                });
                ev.predictedMagnitude = Number(((out.magnitude || 0) * 10).toFixed(2));
            } else {
                ev.predictedMagnitude = null;
            }
        }

        // Highest-risk first: model prediction when available, observed magnitude otherwise
        events.sort((a, b) => (b.predictedMagnitude ?? b.magnitude) - (a.predictedMagnitude ?? a.magnitude) || b.magnitude - a.magnitude);

        return NextResponse.json({
            disasterDetected: events.length > 0,
            generatedAt: new Date().toISOString(),
            source,
            criteria: { minMagnitude: MIN_MAGNITUDE, radiusDeg: RADIUS_DEG, model: net ? 'brain.js' : 'unavailable' },
            count: events.length,
            events,
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Server Error', detail: e.message }, { status: 500 });
    }
}
