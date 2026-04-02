const os = require('os');
const CapacityMetrics = require('../models/CapacityMetrics');
const UsagePattern = require('../models/UsagePattern');

class CapacityCalculator {
    constructor(mongoConnection) {
        this.conn = mongoConnection;
        this.loadHistory = []; // Circular buffer for trend analysis
        this.maxHistory = 60;   // 1 minute of samples
    }

    // Calculate available capacity based on patterns and system load
    async calculateAvailableCapacity() {
        const systemLoad = this.getSystemLoad();
        this.loadHistory.push(systemLoad);
        if (this.loadHistory.length > this.maxHistory) {
            this.loadHistory.shift();
        }

        // Predictive scaling based on trend
        const trend = this.analyzeTrend();
        const predictiveLoad = systemLoad.cpu + (trend.slope * 10); // Predict 10s ahead

        // Calculate capacity per tier
        const baseCapacity = 10000; // requests per second system max
        const availableCapacity = Math.max(0, baseCapacity * (1 - predictiveLoad / 100));

        // Query usage patterns for distribution recommendations
        const patterns = await this.getActivePatterns();
        const distribution = this.optimizeDistribution(patterns, availableCapacity);

        // Save metrics
        await this.saveMetrics(systemLoad, availableCapacity, distribution);

        return {
            systemLoad,
            availableCapacity,
            predictiveLoad,
            distribution,
            recommendations: this.generateRecommendations(distribution)
        };
    }

    // Alias for compatibility
    async getCurrentCapacity() {
        return this.calculateAvailableCapacity();
    }

    getSystemLoad() {
        const cpus = os.cpus();
        const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
        const totalTick = cpus.reduce((acc, cpu) =>
            acc + Object.values(cpu.times).reduce((a, b) => a + b, 0), 0);

        return {
            cpu_percent: 100 - Math.floor(100 * totalIdle / totalTick),
            memory_percent: Math.floor((os.totalmem() - os.freemem()) / os.totalmem() * 100),
            active_connections: this.getActiveConnections(),
            queue_depth: this.getQueueDepth(),
            load_avg: os.loadavg()
        };
    }

    analyzeTrend() {
        if (this.loadHistory.length < 10) return { slope: 0, direction: 'stable' };

        // Simple linear regression on CPU load
        const n = this.loadHistory.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = this.loadHistory.map(h => h.cpu_percent);

        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
        const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

        return {
            slope,
            direction: slope > 0.5 ? 'increasing' : slope < -0.5 ? 'decreasing' : 'stable'
        };
    }

    async getActivePatterns() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        return await UsagePattern.aggregate([
            {
                $match: {
                    'hourly_stats.hour': { $gte: oneHourAgo }
                }
            },
            {
                $project: {
                    user_id: 1,
                    endpoint: 1,
                    total_requests: { $sum: '$hourly_stats.request_count' },
                    denial_rate: {
                        $divide: [
                            { $sum: '$hourly_stats.denied_count' },
                            { $sum: '$hourly_stats.request_count' }
                        ]
                    },
                    trust_score: '$adjustment_factors.trust_score'
                }
            },
            { $sort: { total_requests: -1 } },
            { $limit: 100 }
        ]);
    }

    optimizeDistribution(patterns, totalCapacity) {
        // Water-filling algorithm for fair distribution
        const distribution = [];
        let remainingCapacity = totalCapacity;

        // Sort by priority (trust_score * demand)
        const prioritized = patterns.map(p => ({
            ...p,
            priority: (p.trust_score || 1) * Math.log(p.total_requests + 1)
        })).sort((a, b) => b.priority - a.priority);

        // Allocate proportionally
        const totalPriority = prioritized.reduce((sum, p) => sum + p.priority, 0);

        for (const pattern of prioritized) {
            const share = (pattern.priority / totalPriority) * totalCapacity;
            const allocation = Math.min(share, pattern.total_requests * 1.5); // Cap at 1.5x demand

            distribution.push({
                user_id: pattern.user_id,
                endpoint: pattern.endpoint,
                allocated: Math.floor(allocation),
                current_demand: pattern.total_requests,
                denial_rate: pattern.denial_rate,
                recommended_rate: Math.floor(allocation / 3600) // per second
            });

            remainingCapacity -= allocation;
        }

        return distribution;
    }

    generateRecommendations(distribution) {
        return distribution.map(d => {
            if (d.denial_rate > 0.1) {
                return {
                    user_id: d.user_id,
                    endpoint: d.endpoint,
                    action: 'increase_limit',
                    current_rate: d.recommended_rate,
                    suggested_rate: Math.floor(d.recommended_rate * 1.2),
                    reason: 'High denial rate indicates insufficient quota'
                };
            } else if (d.denial_rate < 0.01 && d.allocated > d.current_demand * 2) {
                return {
                    user_id: d.user_id,
                    endpoint: d.endpoint,
                    action: 'decrease_limit',
                    current_rate: d.recommended_rate,
                    suggested_rate: Math.floor(d.recommended_rate * 0.8),
                    reason: 'Over-provisioned, reclaim capacity'
                };
            }
            return null;
        }).filter(Boolean);
    }

    async saveMetrics(load, capacity, distribution) {
        await CapacityMetrics.create({
            system_load: load,
            available_capacity: capacity,
            tier_capacity: this.calculateTierCapacity(distribution),
            global_throttle: {
                is_active: load.cpu_percent > 80,
                reduction_factor: load.cpu_percent > 80 ? 0.5 : 1.0,
                reason: load.cpu_percent > 80 ? 'high_cpu' : 'normal'
            },
            recommended_adjustments: distribution.slice(0, 10).map(d => ({
                user_id: d.user_id,
                tier: 'dynamic',
                endpoint: d.endpoint,
                suggested_rate: d.recommended_rate,
                confidence: 0.8
            }))
        });
    }

    calculateTierCapacity(distribution) {
        // Aggregate by implicit tiers (could be explicit in schema)
        const tiers = { free: [], pro: [], enterprise: [] };

        // Simple heuristic based on allocation size
        distribution.forEach(d => {
            if (d.allocated < 100) tiers.free.push(d);
            else if (d.allocated < 1000) tiers.pro.push(d);
            else tiers.enterprise.push(d);
        });

        return {
            free: {
                available: tiers.free.reduce((s, d) => s + d.allocated, 0),
                total: 10000
            },
            pro: {
                available: tiers.pro.reduce((s, d) => s + d.allocated, 0),
                total: 50000
            },
            enterprise: {
                available: tiers.enterprise.reduce((s, d) => s + d.allocated, 0),
                total: 100000
            }
        };
    }

    // Public API for middleware
    async getRecommendation(userId, endpoint) {
        const latest = await CapacityMetrics.findOne().sort({ timestamp: -1 });
        const pattern = await UsagePattern.findOne({ user_id: userId, endpoint });

        let factor = 1.0;
        if (latest?.global_throttle?.is_active) {
            factor = latest.global_throttle.reduction_factor;
        }

        if (pattern?.adjustment_factors?.trust_score) {
            factor *= pattern.adjustment_factors.trust_score;
        }

        return {
            factor,
            systemLoad: latest?.system_load,
            timestamp: latest?.timestamp
        };
    }

    getActiveConnections() {
        // Placeholder - integrate with actual connection tracking
        return Math.floor(Math.random() * 1000);
    }

    getQueueDepth() {
        // Placeholder - integrate with message queue
        return Math.floor(Math.random() * 100);
    }
}

module.exports = CapacityCalculator;
