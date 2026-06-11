const express = require('express');
const cors = require('cors');
const lcapApi = require('./src/index');
const apis = require('./api.json')
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// database config
const config = {
    type: 'postgres',
    database: {
        host: 'localhost',
        user: 'postgres',
        password: 'Gulshan@814144',
        database: 'user_management',
        port: 5432
    },
    apis: apis.apis
};

const { router } = lcapApi(config);
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'LCAP-API is running' });
});

// Dynamic API routes
app.use('/api', router);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
    console.log(`🚀 LCAP-API server running on port ${PORT}`);
    console.log(`📋 API base path: http://localhost:${PORT}/api`);
});

module.exports = app;