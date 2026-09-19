import { NextResponse } from 'next/server';
import brain from 'brain.js';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        // 1. Load trained model
        const modelPath = path.join(process.cwd(), '../data/trained_model.json');
        if (!fs.existsSync(modelPath)) {
            return NextResponse.json({ error: "Model not trained yet." }, { status: 500 });
        }
        const modelJson = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
        
        const net = new brain.NeuralNetwork();
        net.fromJSON(modelJson);

        // 2. Fetch live USGS earthquake feed (simulated from our real dataset)
        const datasetPath = path.join(process.cwd(), '../datasets/USGS_Severe_Earthquakes_1789038323.json');
        const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

        // 3. Find the most severe earthquake disaster zone based on AI prediction
        let worstDisaster = null;
        let highestProbability = 0;

        for (const data of dataset) {
            const centerLat = ((data.oracle_payload.minLat + data.oracle_payload.maxLat) / 2) / 1e6;
            const centerLon = ((data.oracle_payload.minLon + data.oracle_payload.maxLon) / 2) / 1e6;
            
            const input = {
                lat: (centerLat + 90) / 180,
                lon: (centerLon + 180) / 360
            };
            const output = net.run(input);
            if (output.magnitude > highestProbability) {
                highestProbability = output.magnitude;
                worstDisaster = data;
            }
        }

        // 4. Return Bounding Box if an earthquake is highly probable
        // (Highest probability represents normalized severity)
        if (highestProbability > 0.5 && worstDisaster) {
            
            return NextResponse.json({
                disasterDetected: true,
                probability: highestProbability,
                center: {
                    lat: ((worstDisaster.oracle_payload.minLat + worstDisaster.oracle_payload.maxLat) / 2) / 1e6,
                    lon: ((worstDisaster.oracle_payload.minLon + worstDisaster.oracle_payload.maxLon) / 2) / 1e6
                },
                boundingBox: worstDisaster.oracle_payload,
                weather: {
                    magnitude: worstDisaster.severity_magnitude,
                    location: worstDisaster.location
                }
            });
        }

        return NextResponse.json({ disasterDetected: false, message: "No active disaster zones detected by AI." });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
