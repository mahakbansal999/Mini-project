try {
    const Redis = require('ioredis-mock');
    const redis = new Redis();
    console.log('ioredis-mock loaded successfully');
    process.exit(0);
} catch (err) {
    console.error('Failed to load ioredis-mock:', err);
    process.exit(1);
}
