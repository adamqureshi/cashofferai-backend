const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ 
        message: 'Cash Offer AI Backend API',
        version: '1.0.0',
        endpoints: [
            'GET /api/health',
            'GET /api/stats', 
            'POST /api/users/create'
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
        user: { id: 1, email, name },
        created: true
    });
});

module.exports = app;
// Add this after your other endpoints, before module.exports

app.post('/api/vehicle/decode', async (req, res) => {
    const { vin } = req.body;
    
    if (!vin || vin.length !== 17) {
        return res.status(400).json({ 
            error: 'Invalid VIN. Must be 17 characters.' 
        });
    }
    
    try {
        // Call NHTSA VIN decoder API
        const response = await fetch(
            `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`
        );
        const data = await response.json();
        
        // Extract key information from NHTSA response
        const getValue = (variableId) => {
            const result = data.Results.find(r => r.VariableId === variableId);
            return result ? result.Value : null;
        };
        
        const vehicleInfo = {
            vin: vin,
            year: getValue(29) || 'Unknown',           // Model Year
            make: getValue(26) || 'Unknown',           // Make
            model: getValue(28) || 'Unknown',          // Model  
            trim: getValue(109) || '',                 // Trim
            engineSize: getValue(71) || '',            // Engine Displacement
            engineCylinders: getValue(70) || '',       // Engine Cylinders
            fuelType: getValue(24) || '',              // Fuel Type
            bodyClass: getValue(5) || '',              // Body Class
            doors: getValue(14) || '',                 // Doors
            driveType: getValue(15) || '',             // Drive Type
            vehicleType: getValue(39) || '',           // Vehicle Type
            gvwr: getValue(25) || '',                  // Gross Vehicle Weight Rating
            manufacturer: getValue(27) || '',          // Manufacturer Name
            plantCountry: getValue(75) || '',          // Plant Country
            errorCode: data.Results.find(r => r.VariableId === 143)?.Value || '0'
        };
        
        // Check for VIN decode errors
        if (vehicleInfo.errorCode !== '0') {
            return res.status(400).json({
                error: 'VIN not found or invalid',
                details: vehicleInfo.errorCode
            });
        }
        
        res.json({
            success: true,
            vehicle: vehicleInfo,
            baseValue: calculateBaseValue(vehicleInfo)
        });
        
    } catch (error) {
        console.error('VIN decode error:', error);
        res.status(500).json({ 
            error: 'Failed to decode VIN',
            message: error.message 
        });
    }
});

// Helper function to estimate base value (simplified)
function calculateBaseValue(vehicle) {
    // Very basic estimation - in reality you'd use market data APIs
    let baseValue = 20000;
    
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
    if (vehicle.bodyClass?.includes('Truck')) baseValue *= 1.2;
    if (vehicle.bodyClass?.includes('SUV')) baseValue *= 1.15;
    if (vehicle.make?.includes('BMW') || vehicle.make?.includes('Mercedes')) baseValue *= 1.3;
    if (vehicle.make?.includes('Honda') || vehicle.make?.includes('Toyota')) baseValue *= 1.1;
    
    return Math.round(baseValue);
}
