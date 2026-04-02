require('dotenv').config();
const app = require('./app');
const mongoose = require('mongoose');
const redis = require('./config/redis');
const GracefulThrottleInterrupt = require('./utils/signalHandler');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/throttling';
const REDIS_URI = process.env.REDIS_URI || 'redis://localhost:6379';

mongoose.connect(MONGO_URI).then(() => {
    console.log('Connected to MongoDB');

    const server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });

    // const redis = new Redis(REDIS_URI); // Already required above as singleton from config/redis

    const signalHandler = new GracefulThrottleInterrupt(server, redis, mongoose.connection);
    app.set('signalHandler', signalHandler); // Make accessible to middleware
    signalHandler.setupHandlers();

}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});
