const express = require('express');
const cors = require('cors');
const lcapApi = require('./src/index');
const dynamicApiForMySql = require('./src/index');
const apis = require('./psqlapi.json')
const mysqlapis = require('./mysqlapi.json')
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

// database config
const mysqlconfig = {
    type: 'mysql',
    database: {
        host: 'localhost',
        user: 'gulshan',
        password: 'Gulshan@814144',
        database: 'user_management',
        port: 3306
    },
    apis: mysqlapis.apis
};

// Dynamic API routes for PostgreSQL
// let postgresqlApiConfig = lcapApi(config).router;
// app.use('/api', postgresqlApiConfig);

// Dynamic API routes for MySQL
let mysqlApiConfig = dynamicApiForMySql(mysqlconfig).router;
app.use('/mysqlapi', mysqlApiConfig);


// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'LCAP-API is running' });
});


// app.use('/mysqlapi', mysqlRouter);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
    console.log(`🚀 LCAP-API server running on port ${PORT}`);
    console.log(`📋 API base path: http://localhost:${PORT}/api`);
    console.log(`📋 MySQL API base path: http://localhost:${PORT}/mysqlapi`);
});

module.exports = app;