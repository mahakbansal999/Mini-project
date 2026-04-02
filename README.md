# Request Throttling Manager

A robust, production-ready request throttling system with advanced features including token bucket algorithm, dynamic capacity calculation, graceful shutdown handling, and automated policy deployment.

## 🚀 Features

- **Token Bucket Algorithm**: Atomic token consumption using Redis Lua scripts
- **Multi-Dimensional Throttling**: Per-user, per-client, and per-endpoint rate limiting
- **Dynamic Capacity Calculation**: ML-based capacity adjustments using historical patterns
- **Graceful Shutdown**: Unix signal handling (SIGTERM, SIGUSR1, SIGUSR2, SIGHUP) for zero-downtime deployments
- **Traffic Smoothing**: Automated throttle adjustments based on system load
- **Policy Deployment**: Git-based policy management with A/B testing and rollback
- **Comprehensive Testing**: Integration and load tests included

## 📋 Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│     Express Middleware Stack        │
│  ┌───────────────────────────────┐  │
│  │  1. Per-Client Throttle       │  │
│  │  2. Per-User Throttle         │  │
│  │  3. Per-Endpoint Throttle     │  │
│  └───────────────────────────────┘  │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│      Token Bucket Service           │
│  (Redis Lua Script - Atomic)        │
└──────┬──────────────────────────────┘
       │
       ├──────────────┬─────────────────┐
       ▼              ▼                 ▼
   ┌──────┐      ┌─────────┐      ┌──────────┐
   │ Redis│      │ MongoDB │      │ Capacity │
   │      │      │ Patterns│      │Calculator│
   └──────┘      └─────────┘      └──────────┘
```

## 🛠️ Installation

### Prerequisites

- Node.js 16+
- MongoDB 6+
- Redis 7+
- Docker (optional)

### Quick Start

1. **Clone and Install**
   ```bash
   cd m:/project/request-throttling-manager
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start Dependencies**
   ```bash
   # Using Docker
   docker-compose up -d mongo redis

   # Or install locally
   # MongoDB: https://www.mongodb.com/try/download/community
   # Redis: https://redis.io/download
   ```

4. **Run the Application**
   ```bash
   npm start
   # Or for development with auto-reload
   npm run dev
   ```

## 🔧 Configuration

### Throttle Tiers

Edit `src/app.js` to configure throttle limits:

```javascript
const throttleConfigs = {
    free: {
        user: { capacity: 60, refillRate: 10 },      // 10 req/sec, burst 60
        client: { capacity: 30, refillRate: 0.5 },
        endpoint: { capacity: 100, refillRate: 2 }
    },
    pro: {
        user: { capacity: 600, refillRate: 10 },
        client: { capacity: 300, refillRate: 5 },
        endpoint: { capacity: 1000, refillRate: 20 }
    },
    enterprise: {
        user: { capacity: 10000, refillRate: 100 },
        client: { capacity: 5000, refillRate: 50 },
        endpoint: { capacity: 20000, refillRate: 200 }
    }
};
```

## 📊 Automated Tasks

### Setup Cron Jobs

```bash
# Linux/Mac
sudo bash scripts/setup-cron.sh

# Windows
# Import task-scheduler.xml into Task Scheduler
schtasks /create /tn "ThrottleCapacityCalc" /xml task-scheduler.xml
```

### Manual Capacity Calculation

```bash
node scripts/capacity-calculator/calculate.js
```

### Traffic Smoother (Continuous)

```bash
# Runs as Docker service
docker-compose up -d smoother

# Or manually
bash scripts/traffic-smoother/throttle-adjuster.sh
```

## 🎯 Unix Signal Handling

The application responds to Unix signals for graceful operations:

- **SIGTERM**: Graceful shutdown with request draining (30s timeout)
- **SIGINT**: Quick shutdown (5s timeout)
- **SIGUSR1**: Increase throttle rates based on available capacity
- **SIGUSR2**: Emergency throttle (reduce all rates by 50%)
- **SIGHUP**: Reload throttle policies from MongoDB

### Examples

```bash
# Graceful shutdown
kill -TERM <pid>

# Emergency throttle during DDoS
kill -USR2 <pid>

# Reload policies after update
kill -HUP <pid>
```

## 🚢 Policy Deployment

### Deploy a Policy

```bash
bash scripts/policy-deployer/deploy.sh deploy aggressive
```

### Gradual Rollout (A/B Testing)

```bash
# Deploy to 10% of users
bash scripts/policy-deployer/deploy.sh rollout aggressive 10

# Increase to 50%
bash scripts/policy-deployer/deploy.sh rollout aggressive 50
```

### Rollback

```bash
bash scripts/policy-deployer/deploy.sh rollback
```

## 🧪 Testing

### Integration Tests

```bash
npm test
```

### Load Testing

```bash
# Install Artillery
npm install -g artillery

# Run load test
artillery run tests/load/throttle-test.yml
```

## 📈 Monitoring

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "capacity": {
    "availableCapacity": 8500,
    "systemLoad": {
      "cpu_percent": 15,
      "memory_percent": 42
    }
  },
  "timestamp": "2026-02-09T08:30:00.000Z"
}
```

### Rate Limit Headers

Every throttled request includes:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining tokens
- `X-RateLimit-Reset`: Unix timestamp when limit resets

## 🐳 Docker Deployment

### Build and Run

```bash
docker-compose up -d
```

### Scale Application

```bash
docker-compose up -d --scale app=5
```

### View Logs

```bash
docker-compose logs -f app
```

## 📁 Project Structure

```
request-throttling-manager/
├── src/
│   ├── app.js                    # Express app with middleware stack
│   ├── index.js                  # Server entry point
│   ├── config/
│   │   └── redis.js              # Redis client singleton
│   ├── middleware/
│   │   └── throttle.js           # Throttle middleware
│   ├── models/
│   │   ├── CapacityMetrics.js    # Capacity metrics schema
│   │   └── UsagePattern.js       # Usage pattern schema
│   ├── services/
│   │   ├── TokenBucket.js        # Token bucket implementation
│   │   └── CapacityCalculator.js # Capacity calculation service
│   └── utils/
│       └── signalHandler.js      # Unix signal handler
├── scripts/
│   ├── capacity-calculator/
│   │   └── calculate.js          # Automated capacity calculation
│   ├── policy-deployer/
│   │   └── deploy.sh             # Policy deployment script
│   ├── traffic-smoother/
│   │   ├── throttle-adjuster.sh  # Traffic smoothing service
│   │   └── Dockerfile
│   ├── mongo-init.js             # MongoDB initialization
│   └── setup-cron.sh             # Cron job setup
├── tests/
│   ├── integration/
│   │   └── throttle.test.js      # Integration tests
│   └── load/
│       └── throttle-test.yml     # Artillery load test
├── policies/
│   └── aggressive/               # Example policy set
├── docker-compose.yml
├── Dockerfile
├── package.json
└── .env
```

## 🔍 Key Components

### Token Bucket Service

Implements atomic token consumption using Redis Lua scripts:
- Automatic refill based on elapsed time
- Configurable capacity and refill rate
- Returns remaining tokens and retry-after time

### Capacity Calculator

Analyzes system metrics and usage patterns to:
- Calculate available capacity
- Predict future load using linear regression
- Generate optimization recommendations
- Distribute capacity fairly across users

### Signal Handler

Manages graceful shutdown and runtime adjustments:
- Tracks active requests
- Drains requests before shutdown
- Returns tokens for interrupted requests
- Supports dynamic throttle adjustments

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

ISC

## 🆘 Troubleshooting

### Redis Connection Issues

```bash
# Check Redis is running
redis-cli ping

# Should return: PONG
```

### MongoDB Connection Issues

```bash
# Check MongoDB is running
mongosh --eval "db.adminCommand('ping')"
```

### High Denial Rates

1. Check system capacity: `curl http://localhost:3000/health`
2. Review capacity metrics in MongoDB
3. Adjust throttle configs in `src/app.js`
4. Trigger capacity increase: `kill -USR1 <pid>`

### Memory Leaks

The system uses Redis LRU eviction and MongoDB TTL indexes to prevent memory leaks:
- Redis: `maxmemory-policy allkeys-lru`
- MongoDB: Automatic cleanup of old metrics (30 days)

## 📚 Additional Resources

- [Token Bucket Algorithm](https://en.wikipedia.org/wiki/Token_bucket)
- [Redis Lua Scripting](https://redis.io/docs/manual/programmability/eval-intro/)
- [Express Middleware](https://expressjs.com/en/guide/using-middleware.html)
- [Unix Signals](https://man7.org/linux/man-pages/man7/signal.7.html)
