const brain = require('brain.js');
const fs = require('fs');
const path = require('path');

// 1. Load Dataset
const datasetPath = path.join(__dirname, '../data/weather_dataset.json');
const rawData = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

// 2. Prepare Training Data
// We normalize inputs to be between 0 and 1.
// Max Temp assumed 50C, Max Rainfall assumed 100mm
const trainingData = rawData.map(item => ({
    input: {
        rainfall: item.rainfall / 100,
        temp: item.temp / 50
    },
    output: {
        disaster: item.disaster
    }
}));

// 3. Configure Neural Network
const net = new brain.NeuralNetwork({
    hiddenLayers: [4, 4],
    activation: 'sigmoid'
});

// 4. Train
console.log("Training Machine Learning Model on Weather Dataset...");
const stats = net.train(trainingData, {
    iterations: 20000,
    errorThresh: 0.005,
    log: true,
    logPeriod: 1000
});

console.log("Training complete:", stats);

// 5. Test the model manually
const droughtTest = net.run({ rainfall: 1/100, temp: 41/50 });
console.log(`Drought Test (1mm, 41C) Output: ${droughtTest.disaster}`);

const normalTest = net.run({ rainfall: 45/100, temp: 25/50 });
console.log(`Normal Test (45mm, 25C) Output: ${normalTest.disaster}`);

// 6. Save Model
const modelJson = net.toJSON();
const modelPath = path.join(__dirname, '../data/trained_model.json');
fs.writeFileSync(modelPath, JSON.stringify(modelJson));
console.log(`Model successfully exported to ${modelPath}`);
