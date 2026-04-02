class TokenBucket {
    constructor(redisClient) {
        this.redis = redisClient;
        this.scripts = {
            consume: this.loadConsumeScript()
        };
    }

    // Lua script for atomic token consumption
    loadConsumeScript() {
        return `
      local key = KEYS[1]
      local requested = tonumber(ARGV[1])
      local capacity = tonumber(ARGV[2])
      local refill_rate = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      
      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local tokens = tonumber(bucket[1]) or capacity
      local last_refill = tonumber(bucket[2]) or now
      
      -- Calculate refill
      local elapsed = now - last_refill
      local refill_amount = elapsed * refill_rate
      tokens = math.min(capacity, tokens + refill_amount)
      
      -- Check availability
      if tokens >= requested then
        tokens = tokens - requested
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
        return {1, tokens, elapsed} -- allowed, remaining, time_since_refill
      else
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
        return {0, tokens, elapsed} -- denied, remaining, time_since_refill
      end
    `;
    }

    async consume(key, tokensRequested = 1, config = {}) {
        const {
            capacity = 100,
            refillRate = 10, // per second
            defaultCost = 1
        } = config;

        const now = Math.floor(Date.now() / 1000);

        try {
            const result = await this.redis.eval(
                this.scripts.consume,
                1, // number of keys
                key,
                tokensRequested,
                capacity,
                refillRate,
                now
            );

            const [allowed, remaining, elapsed] = result;

            return {
                allowed: allowed === 1,
                remainingTokens: remaining,
                timeSinceRefill: elapsed,
                retryAfter: allowed === 0 ? Math.ceil((tokensRequested - remaining) / refillRate) : 0
            };
        } catch (error) {
            console.error('Token bucket error:', error);
            // Fail open or closed based on policy
            return { allowed: false, error: error.message };
        }
    }

    // Dynamic refill rate adjustment based on patterns
    async adjustRefillRate(key, newRate) {
        await this.redis.hset(key, 'refill_rate', newRate);
    }

    // Get current bucket state for monitoring
    async getState(key) {
        return await this.redis.hgetall(key);
    }
    // Return unused tokens (e.g., on request failure or interruption)
    async returnTokens(key, tokens) {
        // Simple increment, capped at capacity if needed logic added to Lua script
        // For now, just increment
        await this.redis.hincrby(key, 'tokens', tokens);
    }
}

module.exports = TokenBucket;
