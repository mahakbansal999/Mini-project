const mongoose = require('mongoose');

const UsagePatternSchema = new mongoose.Schema({
  // Composite key: user + endpoint + time window
  user_id: { type: String, required: true, index: true },
  client_ip: { type: String, index: true },
  endpoint: { type: String, required: true, index: true },
  method: { type: String, required: true },

  // Token bucket state (real-time)
  bucket: {
    tokens: { type: Number, default: 100 },
    capacity: { type: Number, default: 100 },
    refill_rate: { type: Number, default: 10 }, // per second
    last_refill: { type: Date, default: Date.now },
    last_request: { type: Date, default: Date.now }
  },

  // Historical patterns (time-series)
  hourly_stats: [{
    hour: Date,
    request_count: Number,
    denied_count: Number,
    avg_response_time: Number,
    peak_tokens_used: Number
  }],

  // Dynamic adjustment factors
  adjustment_factors: {
    trust_score: { type: Number, default: 1.0 }, // 0.5-2.0 multiplier
    burst_multiplier: { type: Number, default: 1.0 },
    time_of_day_weight: { type: Number, default: 1.0 }
  },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  last_adjusted: { type: Date } // Track when automated adjustments occurred
});

// Compound indexes for fast lookups
UsagePatternSchema.index({ user_id: 1, endpoint: 1 });
UsagePatternSchema.index({ 'hourly_stats.hour': 1 });

module.exports = mongoose.model('UsagePattern', UsagePatternSchema);
