const Redis = require('ioredis');

const useMock = process.env.USE_MOCK_REDIS === 'true';

let redisClient;

if (useMock) {
    const RedisMock = require('ioredis-mock');
    redisClient = new RedisMock();
    console.log('Using Mock Redis for testing');
} else {
    const redisUri = process.env.REDIS_URI || 'redis://localhost:6379';
    redisClient = new Redis(redisUri, {
        retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        maxRetriesPerRequest: 3
    });

    redisClient.on('connect', () => {
        console.log('Connected to Redis');
    });

    redisClient.on('error', (err) => {
        console.error('Redis connection error:', err);
    });
}

module.exports = redisClient;
