// server.js - Cash Offer AI Backend
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Cash Offer AI Backend Running',
        timestamp: new Date().toISOString(),
        env_check: {
            has_api_key: !!process.env.AGENTDB_API_KEY,
            has_db_id: !!process.env.AGENTDB_DATABASE_ID
        }
    });
});

// Basic stats endpoint
app.get('/api/stats', async (req, res) => {
    res.json({ 
        message: 'Stats endpoint ready',
        total_users: 0,
        total_vehicles: 0,
        total_offers: 0
    });
});

// Create user endpoint
app.post('/api/users/create', async (req, res) => {
    const { email, name, phone } = req.body;
    res.json({ 
        user: { id: 1, email, name, phone },
        existing: false 
    });
});

// For Vercel - MUST export app, not use app.listen()
module.exports = app;
