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

// JWT token caching
let cachedJWT = null;
let jwtExpiry = null;

// Helper function to get JWT token from carAPI
async function getCarAPIToken() {
    // Check if we have a valid cached token
    if (cachedJWT && jwtExpiry && new Date() < jwtExpiry) {
        console.log('Using cached JWT token');
        return cachedJWT;
    }
    
    console.log('Generating new JWT token from carAPI');
    
    try {
        const loginResponse = await axios.post('https://carapi.app/api/auth/login', {
            api_token: process.env.CARAPI_TOKEN,
            api_secret: process.env.CARAPI_SECRET
        }, {
            headers: {
                'Content-Type': 'application/json',
                'accept': 'text/plain'
            }
        });
        
        // The response is the JWT token as plain text
        cachedJWT = loginResponse.data;
        // JWT expires in 7 days, but let's refresh it after 6 days to be safe
        jwtExpiry = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
        
        console.log('JWT token generated successfully');
        return cachedJWT;
    } catch (error) {
        console.error('Failed to get JWT token:', error.response?.data || error.message);
        throw error;
    }
}

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
        // Log for debugging
        console.log('VIN decode request for:', vin);
        console.log('CARAPI_TOKEN exists:', !!process.env.CARAPI_TOKEN);
        console.log('CARAPI_SECRET exists:', !!process.env.CARAPI_SECRET);
        
        // Check if credentials are available
        if (!process.env.CARAPI_TOKEN || !process.env.CARAPI_SECRET) {
            console.error('carAPI credentials not found in environment variables');
            return res.status(500).json({ 
                error: 'API configuration error',
                message: 'carAPI credentials not configured' 
            });
        }
        
        // Get JWT token
        const jwtToken = await getCarAPIToken();
        
        // Make request to carAPI with JWT
        const carApiUrl = `https://carapi.app/api/vin/${vin}`;
        console.log('Calling carAPI with JWT token');
        
        const response = await axios.get(carApiUrl, {
            headers: {
                'Authorization': `Bearer ${jwtToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = response.data;
        console.log('carAPI response received');
        
        // Map carAPI response to our format
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
        
        // Calculate base value
        const baseValue = calculateBaseValue(vehicleInfo, data.msrp);
        
        res.json({
            success: true,
            vehicle: vehicleInfo,
            baseValue: baseValue,
            marketValue: data.msrp || null,
            confidence: data.confidence_score || null
        });
        
    } catch (error) {
        console.error('VIN decode error:', error.message);
        console.error('Error details:', error.response?.data || 'No response data');
        console.error('Error status:', error.response?.status || 'No status');
        
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

// Export for Vercel
module.exports = app;
