const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Configure CORS to allow all origins during development
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// CarAPI configuration
const CARAPI_BASE_URL = 'https://carapi.app/api';
const CARAPI_HEADERS = {
    'Authorization': `Bearer ${process.env.CARAPI_TOKEN}`,
    'Content-Type': 'application/json'
};

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
        // Use carAPI to decode VIN
        console.log('Decoding VIN with carAPI:', vin);
        console.log('Token exists:', !!process.env.CARAPI_TOKEN);
        console.log('Token value:', process.env.CARAPI_TOKEN?.substring(0, 10) + '...');
        
        const response = await axios.get(
            `${CARAPI_BASE_URL}/vin/${vin}`,
            { headers: CARAPI_HEADERS }
        );
        
        const data = response.data;
        
        // Extract and map carAPI response to our format
        const vehicleInfo = {
            vin: vin,
            year: data.year || 'Unknown',
            make: data.make || 'Unknown',
            model: data.model || 'Unknown',
            trim: data.trim || '',
            engineSize: data.engine ? `${data.engine.size || ''}${data.engine.size_unit || ''}` : '',
            engineCylinders: data.engine?.cylinder || '',
            fuelType: data.fuel_type || '',
            bodyClass: data.body_type || '',
            doors: data.doors || '',
            driveType: data.drive_type || '',
            vehicleType: data.vehicle_type || '',
            gvwr: data.gross_vehicle_weight_rating || '',
            manufacturer: data.manufacturer || data.make || '',
            plantCountry: data.made_in || '',
            // Additional carAPI specific fields
            transmission: data.transmission || '',
            mpgCity: data.mpg_city || '',
            mpgHighway: data.mpg_highway || '',
            msrp: data.msrp || null
        };
        
        // Check if we got valid data
        if (!data.make || !data.model || !data.year) {
            return res.status(400).json({
                error: 'VIN not found or incomplete data',
                details: 'Could not retrieve complete vehicle information'
            });
        }
        
        // Calculate base value (enhanced with carAPI data)
        const baseValue = calculateBaseValue(vehicleInfo, data.msrp);
        
        res.json({
            success: true,
            vehicle: vehicleInfo,
            baseValue: baseValue,
            marketValue: data.msrp || null,
            confidence: data.confidence_score || null
        });
        
    } catch (error) {
        console.error('VIN decode error:', error.response?.data || error.message);
        
        // Handle carAPI specific errors
        if (error.response?.status === 401) {
            return res.status(500).json({ 
                error: 'API authentication failed',
                message: 'Please check carAPI credentials' 
            });
        }
        
        if (error.response?.status === 404) {
            return res.status(404).json({ 
                error: 'VIN not found',
                message: 'This VIN could not be decoded' 
            });
        }
        
        if (error.response?.status === 429) {
            return res.status(429).json({ 
                error: 'Rate limit exceeded',
                message: 'Too many requests. Please try again later.' 
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to decode VIN',
            message: error.message 
        });
    }
});

// Enhanced helper function with MSRP data from carAPI
function calculateBaseValue(vehicle, msrp) {
    let baseValue = 20000;
    
    // If we have MSRP from carAPI, use it as a better starting point
    if (msrp && msrp > 0) {
        const year = parseInt(vehicle.year);
        const currentYear = new Date().getFullYear();
        const age = currentYear - year;
        
        // Apply depreciation to MSRP
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
        // Fallback to original estimation if no MSRP
        const year = parseInt(vehicle.year);
        const currentYear = new Date().getFullYear();
        const age = currentYear - year;
        
        // Depreciation estimate
        if (age <= 1) baseValue = 35000;
        else if (age <= 3) baseValue = 28000;
        else if (age <= 5) baseValue = 22000;
        else if (age <= 7) baseValue = 18000;
        else if (age <= 10) baseValue = 14000;
        else baseValue = 10000;
        
        // Adjust for vehicle type
        if (vehicle.bodyClass?.toLowerCase().includes('truck')) baseValue *= 1.2;
        if (vehicle.bodyClass?.toLowerCase().includes('suv')) baseValue *= 1.15;
        if (vehicle.make?.toLowerCase().includes('bmw') || 
            vehicle.make?.toLowerCase().includes('mercedes')) baseValue *= 1.3;
        if (vehicle.make?.toLowerCase().includes('honda') || 
            vehicle.make?.toLowerCase().includes('toyota')) baseValue *= 1.1;
    }
    
    return Math.round(baseValue);
}

// THIS MUST BE AT THE VERY END
module.exports = app;
