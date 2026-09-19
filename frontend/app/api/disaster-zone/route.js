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

        // 2. Fetch latest live weather dataset (simulated)
        const datasetPath = path.join(process.cwd(), '../data/weather_dataset.json');
        const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

        // 3. Find the most severe disaster zone based on AI prediction
        let worstDisaster = null;
        let highestProbability = 0;

        for (const data of dataset) {
            const input = {
                rainfall: data.rainfall / 100,
                temp: data.temp / 50
            };
            const output = net.run(input);
            if (output.disaster > highestProbability) {
                highestProbability = output.disaster;
                worstDisaster = data;
            }
        }

        // 4. Return Bounding Box if a disaster is highly probable (> 80%)
        if (highestProbability > 0.8 && worstDisaster) {
            // Generate a 0.2 degree bounding box around the center
            const offset = 0.1;
            
            // Note: Oracle contract expects scaled integers (lat/lon * 10^6)
            // But we will return raw floats from API, Oracle Node script will scale them
            return NextResponse.json({
                disasterDetected: true,
                probability: highestProbability,
                center: {
                    lat: worstDisaster.lat,
                    lon: worstDisaster.lon
                },
                boundingBox: {
                    minLat: worstDisaster.lat - offset,
                    maxLat: worstDisaster.lat + offset,
                    minLon: worstDisaster.lon - offset,
                    maxLon: worstDisaster.lon + offset
                },
                weather: {
                    rainfall: worstDisaster.rainfall,
                    temp: worstDisaster.temp
                }
            });
        }

        return NextResponse.json({ disasterDetected: false, message: "No active disaster zones detected by AI." });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
