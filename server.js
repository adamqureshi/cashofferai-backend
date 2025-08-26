// server.js - Cash Offer AI Backend
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { AgentDB } = require('@agentdb/sdk');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize AgentDB
const agentDB = new AgentDB({
    apiKey: process.env.AGENTDB_API_KEY || 'your_key_here'
});
const dbId = process.env.AGENTDB_DATABASE_ID || 'cashofferai_main';

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Cash Offer AI Backend Running',
        timestamp: new Date().toISOString()
    });
});

// Get database stats
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await agentDB.execute(dbId, `
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM vehicles) as total_vehicles,
                (SELECT COUNT(*) FROM offers) as total_offers
        `);
        res.json(stats.rows[0] || { total_users: 0, total_vehicles: 0, total_offers: 0 });
    } catch (error) {
        res.json({ error: 'Database not connected', message: error.message });
    }
});

// Create or get user
app.post('/api/users/create', async (req, res) => {
    const { email, name, phone } = req.body;
    
    try {
        // Check if user exists
        const existingUser = await agentDB.execute(dbId, 
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        
        if (existingUser.rows && existingUser.rows.length > 0) {
            return res.json({ user: existingUser.rows[0], existing: true });
        }
        
        // Create new user
        const newUser = await agentDB.execute(dbId,
            'INSERT INTO users (email, name, phone) VALUES (?, ?, ?) RETURNING *',
            [email, name || '', phone || '']
        );
        
        res.json({ user: newUser.rows[0], existing: false });
    } catch (error) {
        console.error('User creation error:', error);
        res.status(500).json({ error: 'Failed to create user', details: error.message });
    }
});

// Decode VIN using free NHTSA API
app.post('/api/vehicle/decode', async (req, res) => {
    const { vin, userId } = req.body;
    
    try {
        // Call NHTSA VIN decoder API
        const vinResponse = await fetch(
            `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`
        );
        const vinData = await vinResponse.json();
        
        // Extract basic info
        const getValueByVariable = (variableId) => {
            const result = vinData.Results.find(r => r.VariableId === variableId);
            return result ? result.Value : null;
        };
        
        const vehicleInfo = {
            vin: vin,
            year: getValueByVariable(29),
            make: getValueByVariable(26),
            model: getValueByVariable(28),
            trim: getValueByVariable(109),
            bodyStyle: getValueByVariable(5),
            baseValue: 25000 // Default value
        };
        
        // Save to database if userId provided
        if (userId && agentDB) {
            try {
                const vehicle = await agentDB.execute(dbId,
                    `INSERT INTO vehicles (user_id, vin, year, make, model, trim, body_style, base_value) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
                     ON CONFLICT(vin) DO UPDATE SET user_id = ?
                     RETURNING *`,
                    [userId, vin, vehicleInfo.year, vehicleInfo.make, vehicleInfo.model,
                     vehicleInfo.trim, vehicleInfo.bodyStyle, vehicleInfo.baseValue, userId]
                );
                vehicleInfo.id = vehicle.rows[0].id;
            } catch (dbError) {
                console.error('DB Save error:', dbError);
            }
        }
        
        res.json({ success: true, vehicle: vehicleInfo });
    } catch (error) {
        console.error('VIN decode error:', error);
        res.status(500).json({ error: 'Failed to decode VIN' });
    }
});

// Update vehicle condition
app.post('/api/vehicle/condition', async (req, res) => {
    const { vehicleId, condition, mileage, accidentHistory } = req.body;
    
    try {
        const result = await agentDB.execute(dbId,
            `INSERT INTO vehicle_conditions (vehicle_id, overall_condition, mileage, accident_history) 
             VALUES (?, ?, ?, ?) RETURNING *`,
            [vehicleId, condition, mileage || 0, accidentHistory || 'none']
        );
        
        res.json({ success: true, condition: result.rows[0] });
    } catch (error) {
        console.error('Condition update error:', error);
        res.status(500).json({ error: 'Failed to update condition' });
    }
});

// Generate offer
app.post('/api/offer/generate', async (req, res) => {
    const { vehicleId, userId, condition, accidentHistory } = req.body;
    
    // Simple offer calculation
    let baseValue = 25000;
    
    const conditionMultipliers = {
        'excellent': 1.0,
        'good': 0.9,
        'fair': 0.75,
        'poor': 0.5
    };
    
    const accidentMultipliers = {
        'none': 1.0,
        'minor': 0.85,
        'major': 0.6
    };
    
    const finalAmount = baseValue * 
                       (conditionMultipliers[condition] || 0.8) * 
                       (accidentMultipliers[accidentHistory] || 0.9);
    
    try {
        // Save to database if possible
        if (vehicleId && userId) {
            await agentDB.execute(dbId,
                `INSERT INTO offers (vehicle_id, user_id, offer_amount, final_amount, valid_until) 
                 VALUES (?, ?, ?, ?, datetime('now', '+7 days')) RETURNING *`,
                [vehicleId, userId, baseValue, finalAmount]
            );
        }
    } catch (error) {
        console.error('Offer save error:', error);
    }
    
    res.json({ 
        success: true,
        offer: {
            amount: Math.round(finalAmount),
            validDays: 7,
            baseValue: baseValue,
            condition: condition,
            accidentHistory: accidentHistory
        }
    });
});

// Simple chat endpoint
app.post('/api/chat/message', async (req, res) => {
    const { message } = req.body;
    
    // Simple response logic (no AI for now)
    let response = "I can help you get a cash offer for your vehicle. ";
    
    if (message.toLowerCase().includes('vin')) {
        response = "Please provide your 17-character VIN number and I'll decode it for you.";
    } else if (message.toLowerCase().includes('offer')) {
        response = "I'll need your VIN, vehicle condition, and accident history to generate an offer.";
    } else if (message.toLowerCase().includes('hello') || message.toLowerCase().includes('hi')) {
        response = "Hello! I'm Cash Offer AI. I can help you get an instant cash offer for your vehicle. Do you have your VIN ready?";
    } else {
        response = "I can help you value your vehicle. Please provide your VIN to get started.";
    }
    
    res.json({ response: response });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Cash Offer AI Backend running on port ${PORT}`);
    console.log(`📊 Database: ${dbId}`);
});

// For Vercel - MUST export app, not use app.listen()
module.exports = app;
