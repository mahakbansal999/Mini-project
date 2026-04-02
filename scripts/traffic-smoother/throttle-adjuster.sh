#!/bin/bash

# Request Throttling Manager - Traffic Smoother
# Adjusts throttle thresholds based on real-time capacity metrics

set -euo pipefail

# Configuration
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/throttling}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
LOG_FILE="/var/log/throttle-adjuster.log"
ADJUSTMENT_INTERVAL="${ADJUSTMENT_INTERVAL:-30}" # seconds
SMOOTHING_FACTOR="${SMOOTHING_FACTOR:-0.3}" # EWMA smoothing

# Thresholds
CPU_CRITICAL=85
CPU_WARNING=70
MEMORY_CRITICAL=90
DENIAL_RATE_CRITICAL=0.15

log() {
    echo "[$(date -Iseconds)] $1" | tee -a "$LOG_FILE"
}

# Fetch current capacity metrics from MongoDB
get_capacity_metrics() {
    mongo "$MONGO_URI" --quiet --eval '
        db.capacitymetrics.find().sort({timestamp: -1}).limit(1)[0]
    ' | jq -r '.system_load, .global_throttle, .recommended_adjustments'
}

# Calculate smoothed adjustment using EWMA
calculate_smoothed_rate() {
    local current_rate=$1
    local suggested_rate=$2
    local alpha=$SMOOTHING_FACTOR
    
    # EWMA: new_rate = alpha * suggested + (1 - alpha) * current
    local new_rate=$(echo "$alpha * $suggested_rate + (1 - $alpha) * $current_rate" | bc -l)
    echo "${new_rate%.*}" # Return integer
}

# Apply adjustment to Redis (live throttle update)
apply_throttle_adjustment() {
    local key=$1
    local new_rate=$2
    local new_capacity=$3
    
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HMSET "$key" \
        refill_rate "$new_rate" \
        capacity "$new_capacity" \
        adjusted_at "$(date +%s)" \
        adjusted_by "traffic-smoother"
    
    log "Adjusted $key: rate=$new_rate, capacity=$new_capacity"
}

# Main adjustment loop
smooth_traffic() {
    log "Starting traffic smoothing service..."
    
    while true; do
        # Get latest metrics
        local metrics=$(get_capacity_metrics)
        local cpu=$(echo "$metrics" | jq -r '.cpu_percent // 50')
        local memory=$(echo "$metrics" | jq -r '.memory_percent // 50')
        local denial_rate=$(echo "$metrics" | jq -r '.denial_rate // 0')
        
        log "Current state: CPU=${cpu}%, Memory=${memory}%, DenialRate=${denial_rate}"
        
        # Determine global throttle state
        local global_factor=1.0
        if (( $(echo "$cpu > $CPU_CRITICAL || $memory > $MEMORY_CRITICAL" | bc -l) )); then
            global_factor=0.5
            log "CRITICAL: Reducing global capacity by 50%"
        elif (( $(echo "$cpu > $CPU_WARNING" | bc -l) )); then
            global_factor=0.8
            log "WARNING: Reducing global capacity by 20%"
        fi
        
        # Apply per-endpoint adjustments
        local adjustments=$(echo "$metrics" | jq -c '.[]? // empty')
        
        while IFS= read -r adj; do
            if [[ -z "$adj" ]]; then continue; fi
            
            local user_id=$(echo "$adj" | jq -r '.user_id')
            local endpoint=$(echo "$adj" | jq -r '.endpoint')
            local suggested=$(echo "$adj" | jq -r '.suggested_rate')
            local current=$(echo "$adj" | jq -r '.current_rate // 10')
            
            # Calculate smoothed rate
            local smoothed=$(calculate_smoothed_rate "$current" "$suggested")
            local new_capacity=$(echo "$smoothed * 10" | bc -l | cut -d. -f1) # 10x burst
            
            # Apply global factor
            local final_rate=$(echo "$smoothed * $global_factor" | bc -l | cut -d. -f1)
            local final_capacity=$(echo "$new_capacity * $global_factor" | bc -l | cut -d. -f1)
            
            # Update Redis
            local redis_key="user:${user_id}:${endpoint}"
            apply_throttle_adjustment "$redis_key" "$final_rate" "$final_capacity"
            
            # Update MongoDB with applied adjustment
            mongo "$MONGO_URI" --quiet --eval "
                db.usagepatterns.updateOne(
                    { user_id: '$user_id', endpoint: '$endpoint' },
                    { \$set: { 
                        'bucket.refill_rate': $final_rate,
                        'bucket.capacity': $final_capacity,
                        'last_adjusted': new Date()
                    }}
                )
            "
            
        done <<< "$adjustments"
        
        # Emergency handling for high denial rates
        if (( $(echo "$denial_rate > $DENIAL_RATE_CRITICAL" | bc -l) )); then
            log "EMERGENCY: High denial rate detected. Triggering emergency capacity release."
            redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PUBLISH "throttle:emergency" "release_capacity"
        fi
        
        sleep "$ADJUSTMENT_INTERVAL"
    done
}

# Signal handlers for graceful shutdown
cleanup() {
    log "Received shutdown signal. Cleaning up..."
    # Restore default rates
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "user:*" | while read key; do
        redis-cli HMSET "$key" refill_rate 10 capacity 100 emergency_restore "true"
    done
    log "Emergency rates restored. Exiting."
    exit 0
}

trap cleanup SIGTERM SIGINT

# Start
smooth_traffic
