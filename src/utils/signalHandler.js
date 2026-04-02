const process = require('process');

class GracefulThrottleInterrupt {
    constructor(server, redisClient, mongoConnection) {
        this.server = server;
        this.redis = redisClient;
        this.mongo = mongoConnection;
        this.activeRequests = new Map(); // Track in-flight requests
        this.shuttingDown = false;
    }

    setupHandlers() {
        // SIGTERM: Graceful shutdown with request draining
        process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));

        // SIGUSR1: Dynamic throttle adjustment (user-defined)
        process.on('SIGUSR1', () => this.handleThrottleAdjustment('increase'));

        // SIGUSR2: Emergency throttle (user-defined)
        process.on('SIGUSR2', () => this.handleThrottleAdjustment('emergency'));

        // SIGINT: Quick shutdown (Ctrl+C)
        process.on('SIGINT', () => this.handleShutdown('SIGINT'));

        // SIGHUP: Reload configuration
        process.on('SIGHUP', () => this.handleConfigReload());
    }

    registerRequest(reqId, bucketKey, tokens, abortController) {
        if (this.shuttingDown) {
            throw new Error('Server is shutting down, new requests rejected');
        }

        this.activeRequests.set(reqId, {
            bucketKey,
            tokens,
            abortController, // Store controller to trigger abort
            startTime: Date.now(),
            res: null // Will be set by middleware
        });
    }

    completeRequest(reqId) {
        this.activeRequests.delete(reqId);
    }

    async handleShutdown(signal) {
        console.log(`[${signal}] Initiating graceful shutdown...`);
        this.shuttingDown = true;

        // Stop accepting new connections
        this.server.close(() => {
            console.log('HTTP server closed');
        });

        // Notify all active requests to complete quickly
        const timeout = signal === 'SIGINT' ? 5000 : 30000; // 5s for SIGINT, 30s for SIGTERM

        const shutdownPromise = this.drainRequests(timeout);

        try {
            await shutdownPromise;
            console.log('All requests drained successfully');
        } catch (error) {
            console.error('Forced shutdown:', error);
            // Return tokens for interrupted requests
            await this.returnInterruptedTokens();
        }

        // Cleanup resources
        await this.redis.quit();
        await this.mongo.close();

        console.log('Graceful shutdown completed');
        process.exit(0);
    }

    async drainRequests(timeoutMs) {
        const startTime = Date.now();

        while (this.activeRequests.size > 0) {
            const elapsed = Date.now() - startTime;
            const remaining = timeoutMs - elapsed;

            if (remaining <= 0) {
                throw new Error(`Timeout: ${this.activeRequests.size} requests still active`);
            }

            console.log(`Draining: ${this.activeRequests.size} requests remaining, ${remaining}ms left`);

            // Send graceful interruption signal to active requests
            for (const [reqId, reqInfo] of this.activeRequests) {
                if (reqInfo.res && !reqInfo.res.headersSent) {
                    // Set header to indicate graceful interruption possible
                    reqInfo.res.set('X-Shutdown-Imminent', 'true');
                }
                // Trigger abort signal if available
                if (reqInfo.abortController) {
                    reqInfo.abortController.abort();
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    async returnInterruptedTokens() {
        console.log('Returning tokens for interrupted requests...');

        for (const [reqId, reqInfo] of this.activeRequests) {
            try {
                // Return tokens to bucket
                await this.redis.hincrby(reqInfo.bucketKey, 'tokens', reqInfo.tokens);
                console.log(`Returned ${reqInfo.tokens} tokens to ${reqInfo.bucketKey}`);
            } catch (error) {
                console.error(`Failed to return tokens for ${reqId}:`, error);
            }
        }
    }

    async handleThrottleAdjustment(mode) {
        console.log(`[SIGUSR] Handling throttle adjustment: ${mode}`);

        const adjustments = [];

        if (mode === 'emergency') {
            // Reduce all rates by 50%
            const keys = await this.redis.keys('user:*');
            for (const key of keys) {
                const current = await this.redis.hget(key, 'refill_rate');
                const newRate = Math.floor(parseInt(current) * 0.5);
                adjustments.push(this.redis.hset(key, 'refill_rate', newRate));
            }
            console.log(`Emergency throttle applied to ${keys.length} buckets`);
        } else if (mode === 'increase') {
            // Increase based on capacity metrics
            const capacity = await this.getCurrentCapacity();
            if (capacity.available > 0.3) { // If >30% capacity available
                const keys = await this.redis.keys('user:*');
                for (const key of keys) {
                    const current = await this.redis.hget(key, 'refill_rate');
                    const newRate = Math.ceil(parseInt(current) * 1.2);
                    adjustments.push(this.redis.hset(key, 'refill_rate', newRate));
                }
            }
        }

        await Promise.all(adjustments);
        console.log(`Throttle adjustment completed: ${mode}`);
    }

    async handleConfigReload() {
        console.log('[SIGHUP] Reloading configuration...');
        // Reload throttle policies from MongoDB
        const policies = await this.mongo.collection('throttle_policies').find().toArray();

        for (const policy of policies) {
            const key = `policy:${policy.endpoint}:${policy.tier}`;
            await this.redis.hmset(key, {
                capacity: policy.base_limit,
                refill_rate: policy.refill_rate,
                updated: Date.now()
            });
        }

        console.log(`Reloaded ${policies.length} policies`);
    }

    async getCurrentCapacity() {
        // Query from capacity service
        return { available: 0.5 }; // Placeholder
    }
}

module.exports = GracefulThrottleInterrupt;
