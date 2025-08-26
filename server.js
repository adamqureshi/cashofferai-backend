const express = require('express');
const app = express();

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Minimal backend - no requires'
    });
});

app.get('/', (req, res) => {
    res.json({ 
        message: 'Root endpoint working'
    });
});

module.exports = app;
