const express = require('express');
const mongoose = require('mongoose');
const redis = require('./config/redis');
const ThrottleMiddleware = require('./middleware/throttle');
const CapacityService = require('./services/CapacityCalculator');
const cors = require('cors');

const app = express();
const path = require('path');

app.use(cors());
app.use(express.static(path.join(__dirname, '../client'))); // Serve static files from client

// Serve the login page by default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});
const throttle = new ThrottleMiddleware(redis, mongoose.connection);

// Global JSON parsing
app.use(express.json());

// Tier-based throttle configurations
const throttleConfigs = {
    // Free tier: strict limits
    free: {
        user: { capacity: 60, refillRate: 10 },      // 10 req/sec, burst 60
        client: { capacity: 30, refillRate: 0.5 },  // 0.5 req/sec
        endpoint: { capacity: 100, refillRate: 2 }
    },
    // Pro tier: moderate
    pro: {
        user: { capacity: 600, refillRate: 10 },    // 10 req/sec
        client: { capacity: 300, refillRate: 5 },
        endpoint: { capacity: 1000, refillRate: 20 }
    },
    // Enterprise: high limits with dynamic adjustment
    enterprise: {
        user: { capacity: 10000, refillRate: 100 },  // 100 req/sec base
        client: { capacity: 5000, refillRate: 50 },
        endpoint: { capacity: 20000, refillRate: 200 }
    }
};

// Middleware stack with multiple throttle dimensions
app.use('/api/',
    // 1. Per-client IP throttling (DDoS protection)
    throttle.createMiddleware({
        type: 'client',
        ...throttleConfigs.free.client
    }),

    // 2. Per-user/API key throttling (account limits)
    (req, res, next) => {
        const tier = req.user?.tier || 'free';
        return throttle.createMiddleware({
            type: 'user',
            ...throttleConfigs[tier].user,
            costCalculator: async (req) => {
                // Expensive endpoints cost more tokens
                const complexity = req.body?.complexity || 1;
                return Math.ceil(complexity * 1);
            }
        })(req, res, next);
    },

    // 3. Per-endpoint throttling (resource protection)
    throttle.createMiddleware({
        type: 'endpoint',
        ...throttleConfigs.free.endpoint
    })
);

// Example endpoints
app.post('/api/orders', async (req, res) => {
    // Check for graceful interruption
    if (req.abortSignal?.aborted) {
        return res.status(503).json({ error: 'Request interrupted by throttle policy' });
    }

    // Process order...
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 100));

    res.json({ status: 'success', order_id: '12345' });
});

app.post('/api/heavy-task', async (req, res) => {
    // Check for graceful interruption
    if (req.abortSignal?.aborted) {
        return res.status(503).json({ error: 'Request interrupted by throttle policy' });
    }
    // Simulate long task
    await new Promise(resolve => setTimeout(resolve, 3000));
    res.json({ status: 'success', task_id: '999' });
});

app.get('/api/status', async (req, res) => {
    res.json({ status: 'ok' });
});


// Health check with capacity status
app.get('/health', async (req, res) => {
    const capacity = await new CapacityService(mongoose.connection).getCurrentCapacity().catch(() => ({}));
    res.json({
        status: 'healthy',
        capacity: capacity,
        timestamp: new Date().toISOString()
    });
});

module.exports = app;
