const brain = require('brain.js');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("Loading Real USGS Earthquake Dataset...");
    const datasetPath = path.join(__dirname, '../datasets/USGS_Severe_Earthquakes_1789038323.json');
    const rawData = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

    console.log(`Loaded ${rawData.length} historical severe earthquake records.`);

    // 1. Prepare Training Data
    // We normalize inputs (Lat/Lon) and outputs (Magnitude) to be between 0 and 1.
    // Lat ranges from -90 to 90. Lon from -180 to 180.
    // Max Magnitude assumed 10.0
    const trainingData = rawData.map(event => {
        // The oracle_payload is stored in integers scaled by 1e6
        const centerLat = ((event.oracle_payload.minLat + event.oracle_payload.maxLat) / 2) / 1e6;
        const centerLon = ((event.oracle_payload.minLon + event.oracle_payload.maxLon) / 2) / 1e6;

        return {
            input: {
                lat: (centerLat + 90) / 180, // Normalize to 0-1
                lon: (centerLon + 180) / 360 // Normalize to 0-1
            },
            output: {
                magnitude: event.severity_magnitude / 10
            }
        };
    });

    // 2. Configure Neural Network
    console.log("Initializing Brain.js Neural Network...");
    const net = new brain.NeuralNetwork({
        hiddenLayers: [8, 8],
        activation: 'sigmoid'
    });

    // 3. Train
    console.log("Training Neural Network on geographic fault line distributions (This may take a moment)...");
    const stats = net.train(trainingData, {
        iterations: 10000,
        errorThresh: 0.005,
        log: true,
        logPeriod: 1000,
        learningRate: 0.01
    });

    console.log("Training complete:", stats);

    // 4. Save Model
    const modelJson = net.toJSON();
    const modelPath = path.join(__dirname, '../data/trained_model.json');
    fs.writeFileSync(modelPath, JSON.stringify(modelJson));
    console.log(`\n✅ Model successfully exported to ${modelPath}`);
}

main().catch(console.error);
