const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Configure CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

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
        return res.status(400).json({ 
            error: 'Invalid VIN. Must be 17 characters.' 
        });
    }
    
    try {
        console.log('VIN decode request for:', vin);
        
        // Use NHTSA VIN decoder API - FREE and NO AUTH REQUIRED
        const response = await axios.get(
            `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`
        );
        
        const data = response.data;
        console.log('NHTSA response received');
        
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
            engineSize: getValue(71) || getValue(13) || '',  // Try both CC and L
            engineCylinders: getValue(9) || getValue(70) || '',
            fuelType: getValue(24) || '',
            bodyClass: getValue(5) || '',
            doors: getValue(14) || '',
            driveType: getValue(15) || '',
            vehicleType: getValue(39) || '',
            gvwr: getValue(25) || '',
            manufacturer: getValue(27) || '',
            plantCountry: getValue(75) || '',
            transmission: getValue(37) || '',
            errorCode: getValue(143) || '0',
            errorText: getValue(191) || ''
        };
        
        console.log('Extracted vehicle info:', {
            make: vehicleInfo.make,
            model: vehicleInfo.model,
            year: vehicleInfo.year,
            errorCode: vehicleInfo.errorCode
        });
        
        // Handle NHTSA error codes more gracefully
        // Error code 8 means limited data, but we can still use what we have
        if (vehicleInfo.errorCode === '8') {
            console.log('NHTSA has limited data for this VIN, using what is available');
        }
        
        // Only fail for truly invalid VINs
        if (!vehicleInfo.year || vehicleInfo.year === 'Unknown' || vehicleInfo.year === null) {
            return res.status(400).json({
                error: 'Invalid VIN',
                details: 'Could not decode VIN - no year data available'
            });
        }
        
        // If we have at least year and make, continue with what we have
        // Fill in "Unknown" for missing model
        if (!vehicleInfo.model || vehicleInfo.model === null) {
            vehicleInfo.model = vehicleInfo.make ? `${vehicleInfo.make} Vehicle` : 'Unknown Model';
        }
        
        // Calculate base value
        const baseValue = calculateBaseValue(vehicleInfo, null);
        
        res.json({
            success: true,
            vehicle: vehicleInfo,
            baseValue: baseValue,
            marketValue: null,
            confidence: null
        });
        
    } catch (error) {
        console.error('VIN decode error:', error.message);
        
        res.status(500).json({ 
            error: 'Failed to decode VIN',
            message: error.message || 'Unknown error occurred'
        });
    }
});

// Helper function
function calculateBaseValue(vehicle, msrp) {
    let baseValue = 20000;
    
    if (msrp && msrp > 0) {
        const year = parseInt(vehicle.year);
        const currentYear = new Date().getFullYear();
        const age = currentYear - year;
        
        let depreciationRate = 1;
        if (age <= 1) depreciationRate = 0.80;
        else if (age <= 2) depreciationRate = 0.70;
        else if (age <= 3) depreciationRate = 0.60;
        else if (age <= 5) depreciationRate = 0.45;
        else if (age <= 7) depreciationRate = 0.35;
        else if (age <= 10) depreciationRate = 0.25;
        else depreciationRate = 0.15;
        
        baseValue = msrp * depreciationRate;
    } else {
        const year = parseInt(vehicle.year);
        const currentYear = new Date().getFullYear();
        const age = currentYear - year;
        
        if (age <= 1) baseValue = 35000;
        else if (age <= 3) baseValue = 28000;
        else if (age <= 5) baseValue = 22000;
        else if (age <= 7) baseValue = 18000;
        else if (age <= 10) baseValue = 14000;
        else baseValue = 10000;
        
        if (vehicle.bodyClass?.toLowerCase().includes('truck')) baseValue *= 1.2;
        if (vehicle.bodyClass?.toLowerCase().includes('suv')) baseValue *= 1.15;
        if (vehicle.make?.toLowerCase().includes('bmw') || 
            vehicle.make?.toLowerCase().includes('mercedes')) baseValue *= 1.3;
        if (vehicle.make?.toLowerCase().includes('honda') || 
            vehicle.make?.toLowerCase().includes('toyota')) baseValue *= 1.1;
    }
    
    return Math.round(baseValue);
}

// Export for Vercel
module.exports = app;
