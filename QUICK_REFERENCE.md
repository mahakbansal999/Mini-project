# Request Throttling Manager - Quick Reference

## 🚀 Quick Start

```bash
# Windows
start.bat

# Linux/Mac
bash start.sh

# Or manually
npm install
npm start
```

## 📋 Common Commands

### Development
```bash
npm run dev              # Start with auto-reload
npm test                 # Run all tests
npm run test:integration # Integration tests only
npm run test:load        # Load testing with Artillery
npm run verify           # Verify system setup
```

### Capacity Management
```bash
npm run capacity:calculate  # Manual capacity calculation
bash scripts/setup-cron.sh  # Setup automated tasks
```

### Docker
```bash
npm run docker:up       # Start all services
npm run docker:down     # Stop all services
npm run docker:logs     # View application logs
```

### Policy Deployment
```bash
npm run policy:deploy aggressive    # Deploy policy
npm run policy:rollback              # Rollback to previous
bash scripts/policy-deployer/deploy.sh rollout aggressive 25  # 25% rollout
```

## 🎯 Unix Signals

```bash
# Get process ID
PID=$(pgrep -f "node src/index.js")

# Graceful shutdown (30s drain)
kill -TERM $PID

# Quick shutdown (5s drain)
kill -INT $PID

# Increase throttle rates
kill -USR1 $PID

# Emergency throttle (50% reduction)
kill -USR2 $PID

# Reload policies
kill -HUP $PID
```

## 🧪 Testing Requests

### Basic Request
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "x-api-key: test-user-123" \
  -H "Content-Type: application/json" \
  -d '{"complexity": 1, "items": [1,2,3]}'
```

### Check Rate Limits
```bash
curl -i http://localhost:3000/api/status \
  -H "x-api-key: test-user-123"
```

### Health Check
```bash
curl http://localhost:3000/health
```

### Burst Test
```bash
for i in {1..20}; do
  curl -X POST http://localhost:3000/api/orders \
    -H "x-api-key: burst-test" \
    -H "Content-Type: application/json" \
    -d '{"complexity": 1}' &
done
wait
```

## 📊 Monitoring

### MongoDB Queries

```javascript
// View capacity metrics
db.capacitymetrics.find().sort({timestamp: -1}).limit(10)

// View usage patterns
db.usagepatterns.find({user_id: "test-user-123"})

// Check global throttle state
db.capacitymetrics.findOne(
  {}, 
  {global_throttle: 1, system_load: 1}
).sort({timestamp: -1})

// Get recommendations
db.capacitymetrics.findOne(
  {},
  {recommended_adjustments: 1}
).sort({timestamp: -1})
```

### Redis Commands

```bash
# View all bucket keys
redis-cli KEYS "user:*"

# Check specific bucket state
redis-cli HGETALL "user:test-user-123:/api/orders"

# Monitor real-time commands
redis-cli MONITOR

# Check memory usage
redis-cli INFO memory
```

## 🔧 Configuration

### Throttle Tiers (src/app.js)

```javascript
free: {
    user: { capacity: 60, refillRate: 10 },
    client: { capacity: 30, refillRate: 0.5 },
    endpoint: { capacity: 100, refillRate: 2 }
}
```

### Environment Variables (.env)

```bash
MONGO_URI=mongodb://localhost:27017/throttling
REDIS_URI=redis://localhost:6379
PORT=3000
NODE_ENV=development
```

### Traffic Smoother (scripts/traffic-smoother/throttle-adjuster.sh)

```bash
ADJUSTMENT_INTERVAL=30   # seconds
SMOOTHING_FACTOR=0.3     # EWMA alpha (0-1)
CPU_CRITICAL=85          # percentage
CPU_WARNING=70           # percentage
DENIAL_RATE_CRITICAL=0.15 # 15%
```

## 🐛 Troubleshooting

### Redis Connection Failed
```bash
# Check if Redis is running
redis-cli ping

# Start Redis with Docker
docker-compose up -d redis
```

### MongoDB Connection Failed
```bash
# Check if MongoDB is running
mongosh --eval "db.adminCommand('ping')"

# Start MongoDB with Docker
docker-compose up -d mongo
```

### High Denial Rates
```bash
# Check system capacity
curl http://localhost:3000/health

# Trigger capacity increase
kill -USR1 $(pgrep -f "node src/index.js")

# Or adjust configs in src/app.js
```

### Memory Issues
```bash
# Check Redis memory
redis-cli INFO memory

# Check Node.js memory
ps aux | grep node

# Restart services
docker-compose restart
```

## 📁 Important Files

| File | Purpose |
|------|---------|
| `src/app.js` | Throttle configuration |
| `src/middleware/throttle.js` | Throttle logic |
| `src/services/TokenBucket.js` | Token bucket algorithm |
| `src/services/CapacityCalculator.js` | Capacity calculation |
| `src/utils/signalHandler.js` | Signal handling |
| `.env` | Environment configuration |
| `docker-compose.yml` | Docker services |

## 🔗 Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/orders` | POST | Example throttled endpoint |
| `/api/heavy-task` | POST | Long-running task example |
| `/api/status` | GET | Status check (throttled) |
| `/health` | GET | Health check (not throttled) |

## 📈 Rate Limit Headers

Every throttled response includes:
- `X-RateLimit-Limit`: Maximum capacity
- `X-RateLimit-Remaining`: Available tokens
- `X-RateLimit-Reset`: Reset timestamp

Example:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1707478920
```

## 🎓 Learn More

- [README.md](README.md) - Full documentation
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Implementation details
- [Token Bucket Algorithm](https://en.wikipedia.org/wiki/Token_bucket)
- [Redis Lua Scripting](https://redis.io/docs/manual/programmability/eval-intro/)
