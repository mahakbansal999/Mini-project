#!/bin/bash

# Git-based Throttle Policy Deployment
# Switches between aggressive/lenient/ML-tuned policies via Git branches

set -euo pipefail

POLICY_DIR="${POLICY_DIR:-./policies}"
ACTIVE_POLICY="${ACTIVE_POLICY:-balanced}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/throttling}"
BACKUP_DIR="/var/backups/throttle-policies"

log() {
    echo "[$(date -Iseconds)] $1"
}

# Validate policy branch exists
validate_policy() {
    local policy=$1
    if [[ ! -d "$POLICY_DIR/$policy" ]]; then
        log "ERROR: Policy '$policy' not found in $POLICY_DIR"
        exit 1
    fi
    
    # Check required files
    for file in "throttle-config.json" "rate-limits.yaml" "adjustment-rules.js"; do
        if [[ ! -f "$POLICY_DIR/$policy/$file" ]]; then
            log "WARNING: Policy $policy missing $file"
        fi
    done
}

# Backup current MongoDB state
backup_current_state() {
    local backup_file="$BACKUP_DIR/policy-backup-$(date +%Y%m%d-%H%M%S).json"
    mkdir -p "$BACKUP_DIR"
    
    mongoexport --uri="$MONGO_URI" \
        --collection=throttle_policies \
        --out="$backup_file"
    
    log "Backed up current policies to $backup_file"
}

# Deploy policy to MongoDB
deploy_policy() {
    local policy=$1
    local config_file="$POLICY_DIR/$policy/throttle-config.json"
    
    log "Deploying policy: $policy"
    
    # Load and validate JSON
    if ! jq empty "$config_file" 2>/dev/null; then
        log "ERROR: Invalid JSON in $config_file"
        exit 1
    fi
    
    # Import to MongoDB
    mongoimport --uri="$MONGO_URI" \
        --collection=throttle_policies \
        --mode=merge \
        --file="$config_file"
    
    # Apply to running system via Redis pub/sub
    local policy_json=$(cat "$config_file" | jq -c .)
    redis-cli PUBLISH "throttle:policy-update" "$policy_json"
    
    log "Policy $policy deployed successfully"
}

# A/B testing: gradual rollout
gradual_rollout() {
    local policy=$1
    local percentage=$2
    
    log "Starting gradual rollout of $policy to $percentage% of traffic"
    
    # Get user segments
    local total_users=$(mongo "$MONGO_URI" --quiet --eval 'db.usagepatterns.countDocuments()')
    local target_users=$(echo "$total_users * $percentage / 100" | bc)
    
    # Select random sample
    mongo "$MONGO_URI" --quiet --eval "
        db.usagepatterns.aggregate([
            { \$sample: { size: $target_users } },
            { \$project: { user_id: 1 } }
        ]).forEach(function(doc) {
            db.usersegments.updateOne(
                { user_id: doc.user_id },
                { \$set: { policy: '$policy', updated: new Date() }},
                { upsert: true }
            );
        })
    "
    
    log "Rolled out $policy to $target_users users ($percentage%)"
}

# Rollback to previous policy
rollback() {
    local latest_backup=$(ls -t $BACKUP_DIR/*.json | head -1)
    
    if [[ -z "$latest_backup" ]]; then
        log "ERROR: No backup found for rollback"
        exit 1
    fi
    
    log "Rolling back to $latest_backup"
    
    mongoimport --uri="$MONGO_URI" \
        --collection=throttle_policies \
        --mode=replace \
        --file="$latest_backup"
    
    redis-cli PUBLISH "throttle:policy-update" '{"action":"rollback"}'
    
    log "Rollback completed"
}

# Main command handler
case "${1:-deploy}" in
    deploy)
        validate_policy "$2"
        backup_current_state
        deploy_policy "$2"
        ;;
    rollout)
        validate_policy "$2"
        gradual_rollout "$2" "${3:-10}" # Default 10% rollout
        ;;
    rollback)
        rollback
        ;;
    list)
        ls -1 "$POLICY_DIR"
        ;;
    *)
        echo "Usage: $0 {deploy|rollout|rollback|list} [policy] [percentage]"
        exit 1
        ;;
esac
