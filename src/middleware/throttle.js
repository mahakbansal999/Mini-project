const TokenBucket = require('../services/TokenBucket');
const UsagePattern = require('../models/UsagePattern');
const CapacityCalculator = require('../services/CapacityCalculator');

class ThrottleMiddleware {
    constructor(redisClient, mongoConnection) {
        this.tokenBucket = new TokenBucket(redisClient);
        this.capacityCalc = new CapacityCalculator(mongoConnection);
        // this.signalHandlers = new Map(); // Removed: dedicated SignalHandler service is used
    }

    // Main middleware factory
    createMiddleware(options = {}) {
        const {
            type = 'user', // 'user', 'client', 'endpoint'
            keyExtractor = this.defaultKeyExtractor,
            defaultCapacity = 100,
            defaultRefillRate = 10,
            costCalculator = () => 1
        } = options;

        return async (req, res, next) => {
            try {
                // Extract identity based on throttle type
                const identity = await keyExtractor(req, type);
                const endpoint = `${req.method}:${req.route?.path || req.path}`;
                const bucketKey = `${type}:${identity}:${endpoint}`;

                // Get dynamic configuration from pattern analysis
                const config = await this.getDynamicConfig(identity, endpoint, {
                    capacity: defaultCapacity,
                    refillRate: defaultRefillRate
                });

                // Calculate request cost (can vary by payload size, complexity)
                const cost = await costCalculator(req);

                // Check token bucket
                const result = await this.tokenBucket.consume(bucketKey, cost, config);

                // Set rate limit headers
                res.set({
                    'X-RateLimit-Limit': config.capacity,
                    'X-RateLimit-Remaining': Math.floor(result.remainingTokens),
                    'X-RateLimit-Reset': Math.floor(Date.now() / 1000) + result.retryAfter
                });

                if (!result.allowed) {
                    // Log denial for pattern analysis
                    await this.logDenial(identity, endpoint, cost, result);

                    return res.status(429).json({
                        error: 'Too Many Requests',
                        retry_after: result.retryAfter,
                        limit: config.capacity,
                        window: 'second'
                    });
                }

                // Track usage for pattern analysis (async, don't block)
                this.trackUsage(identity, endpoint, cost, result).catch(console.error);

                // Setup graceful interruption handler
                this.setupGracefulInterruption(req, res, bucketKey, cost);

                next();

            } catch (error) {
                console.error('Throttle middleware error:', error);
                // Fail open in case of system error (configurable)
                next();
            }
        };
    }

    // Dynamic configuration based on historical patterns
    async getDynamicConfig(identity, endpoint, defaults) {
        const pattern = await UsagePattern.findOne({
            user_id: identity,
            endpoint: endpoint
        });

        if (!pattern) return defaults;

        // Apply ML-tuned adjustments
        const trustMultiplier = pattern.adjustment_factors.trust_score;
        const timeWeight = pattern.adjustment_factors.time_of_day_weight;
        const burstMult = pattern.adjustment_factors.burst_multiplier;

        // Get system capacity recommendation
        const capacityRec = await this.capacityCalc.getRecommendation(identity, endpoint);

        return {
            capacity: Math.floor(defaults.capacity * trustMultiplier * burstMult),
            refillRate: Math.floor(defaults.refillRate * timeWeight * capacityRec.factor),
            currentLoad: capacityRec.systemLoad
        };
    }

    // Key extractors for different throttle dimensions
    defaultKeyExtractor(req, type) {
        switch (type) {
            case 'user':
                return req.user?.id || req.headers['x-api-key'] || 'anonymous';
            case 'client':
                return req.ip || req.connection.remoteAddress;
            case 'endpoint':
                return req.route?.path || req.path;
            default:
                return 'global';
        }
    }

    // Setup graceful interruption using central handler
    setupGracefulInterruption(req, res, bucketKey, cost) {
        const abortController = new AbortController();
        req.abortSignal = abortController.signal;

        const signalHandler = req.app.get('signalHandler');
        if (!signalHandler) return; // Should be available

        // Generate ID if missing
        const reqId = req.id || `req-${Math.random().toString(36).substr(2, 9)}`;

        try {
            // Register with central handler
            signalHandler.registerRequest(reqId, bucketKey, cost, abortController);

            // Allow handler to access response object
            const reqInfo = signalHandler.activeRequests.get(reqId);
            if (reqInfo) reqInfo.res = res;

            // Cleanup on finish
            res.on('finish', () => {
                signalHandler.completeRequest(reqId);
            });

        } catch (err) {
            // If server is shutting down, registerRequest throws
            console.warn('Request rejected during shutdown:', err.message);
            res.status(503).json({ error: 'Server shutting down' });
        }
    }

    async trackUsage(identity, endpoint, cost, result) {
        const now = new Date();
        const hourKey = new Date(now.setMinutes(0, 0, 0));

        await UsagePattern.updateOne(
            { user_id: identity, endpoint: endpoint },
            {
                $inc: {
                    'bucket.tokens': -cost,
                    'hourly_stats.$[elem].request_count': 1,
                    'hourly_stats.$[elem].peak_tokens_used': cost
                },
                $set: {
                    'bucket.last_request': now,
                    'updated_at': now
                }
            },
            {
                arrayFilters: [{ 'elem.hour': hourKey }],
                upsert: true
            }
        );
    }

    async logDenial(identity, endpoint, cost, result) {
        await UsagePattern.updateOne(
            { user_id: identity, endpoint: endpoint },
            {
                $push: {
                    'hourly_stats': {
                        $each: [{
                            hour: new Date(),
                            request_count: 0,
                            denied_count: 1,
                            peak_tokens_used: 0
                        }],
                        $sort: { hour: -1 },
                        $slice: -168 // Keep last 7 days (168 hours)
                    }
                }
            },
            { upsert: true }
        );
    }
}

module.exports = ThrottleMiddleware;
