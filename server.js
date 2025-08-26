const express = require('express');
const cors = require('cors');
const axios = require('axios');  // Add axios here
const app = express();
app.use(express.json());
app.use(cors());


app.get('/', (req, res) => {
    res.json({ 
        message: 'Cash Offer AI Backend API',
        version: '1.0.0',
        endpoints: [
            'GET /api/health',
            'GET /api/stats', 
            'POST /api/users/create',
            'POST /api/vehicle/decode'
        ]
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK',
        message: 'Backend Running'
    });
});

app.get('/api/stats', (req, res) => {
    res.json({
        users: 0,
        vehicles: 0,
        offers: 0
    });
});

app.post('/api/users/create', (req, res) => {
    const { email, name } = req.body;
    res.json({
        user: { id: Date.now(), email, name },
        created: true
    });
});

app.post('/api/vehicle/decode', async (req, res) => {
    const { vin } = req.body;
    
    if (!vin || vin.length !== 17) {
app.post('/api/vehicle/decode', async (req, res) => {
    const { vin } = req.body;
    
    if (!vin || vin.length !== 17) {
        return res.status(400).json({ 
            error: 'Invalid VIN. Must be 17 characters.' 
        });
    }
    
    try {
        // Use axios to call NHTSA VIN decoder API
        const response = await axios.get(
            `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`
        );
        const data = response.data;
        
        // Extract key information from NHTSA response
        const getValue = (variableId) => {
            const result = data.Results.find(r => r.VariableId === variableId);
            return result ? result.Value : null;
        };
        
        const vehicleInfo = {
            vin: vin,
            year: getValue(29) || 'Unknown',
            make: getValue(26) || 'Unknown',
            model: getValue(28) || 'Unknown',
            trim: getValue(109) || '',
            engineSize: getValue(71) || '',
            engineCylinders: getValue(70) || '',
            fuelType: getValue(24) || '',
            bodyClass: getValue(5) || '',
            doors: getValue(14) || '',
            driveType: getValue(15) || '',
