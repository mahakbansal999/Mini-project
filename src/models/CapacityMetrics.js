const mongoose = require('mongoose');

const CapacityMetricsSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now, index: true },

    // System capacity snapshot
    system_load: {
        cpu_percent: Number,
        memory_percent: Number,
        active_connections: Number,
        queue_depth: Number
    },

    // Available capacity per tier
    tier_capacity: {
        free: { available: Number, total: Number },
        pro: { available: Number, total: Number },
        enterprise: { available: Number, total: Number }
    },

    // Global throttle state
    global_throttle: {
        is_active: Boolean,
        reduction_factor: Number, // 0.0-1.0
        reason: String
    },

    // Calculated by Node.js capacity engine
    recommended_adjustments: [{
        user_id: String, // Added for targeting specific users
        tier: String,
        endpoint: String,
        suggested_rate: Number,
        confidence: Number
    }]
});

module.exports = mongoose.model('CapacityMetrics', CapacityMetricsSchema);
