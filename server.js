const express = require('express');
const app = express();

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK',
        message: 'Minimal test - no dependencies'
    });
});

module.exports = app;
