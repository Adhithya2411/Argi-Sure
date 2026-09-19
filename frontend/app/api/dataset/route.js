import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const datasetPath = path.join(process.cwd(), '../data/weather_dataset.json');
        const rawData = fs.readFileSync(datasetPath, 'utf8');
        return NextResponse.json(JSON.parse(rawData));
    } catch (e) {
        return NextResponse.json({ error: "Dataset not found" }, { status: 500 });
    }
}
