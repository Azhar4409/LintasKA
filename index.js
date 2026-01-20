const express = require('express');
const path = require('path');
const app = express();

// Middleware untuk melayani file statis dari folder 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Contoh Route API (pastikan sesuai dengan fetch di frontend)
app.get('/api/stations', (req, res) => {
    const stations = require('./data/stations.json'); // arahkan ke file data kamu
    res.json(stations);
});

app.get('/api/gapeka', (req, res) => {
    const gapeka = require('./data/gapeka.json');
    res.json(gapeka);
});

// Penting untuk Vercel: Export app
module.exports = app;