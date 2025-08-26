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
