import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Serves the latest ingested USGS dataset (previously pointed at a
// non-existent data/weather_dataset.json and always returned 500).
export async function GET() {
    try {
        const dir = path.join(process.cwd(), '../datasets');
        const file = fs.existsSync(dir)
            ? fs.readdirSync(dir).filter(f => /^USGS_.*\.json$/.test(f)).sort().pop()
            : null;
        if (!file) {
            return NextResponse.json({ error: "Dataset not found. Run: python scripts/dataset_ingestion.py" }, { status: 404 });
        }
        const rawData = fs.readFileSync(path.join(dir, file), 'utf8');
        return NextResponse.json({ source: file, events: JSON.parse(rawData) });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Failed to read dataset" }, { status: 500 });
    }
}
