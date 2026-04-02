#!/usr/bin/env node

/**
 * Automated Capacity Calculator
 * Runs periodically via cron to analyze patterns and update capacity metrics
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CapacityCalculator = require('../../src/services/CapacityCalculator');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/throttling';

async function runCalculation() {
    console.log('[Capacity Calculator] Starting calculation...');

    try {
        await mongoose.connect(MONGO_URI);
        console.log('[Capacity Calculator] Connected to MongoDB');

        const calculator = new CapacityCalculator(mongoose.connection);
        const result = await calculator.calculateAvailableCapacity();

        console.log('[Capacity Calculator] Results:');
        console.log(`  - Available Capacity: ${result.availableCapacity} req/s`);
        console.log(`  - System Load: CPU ${result.systemLoad.cpu_percent}%, Memory ${result.systemLoad.memory_percent}%`);
        console.log(`  - Predictive Load: ${result.predictiveLoad.toFixed(2)}%`);
        console.log(`  - Recommendations: ${result.recommendations.length} adjustments suggested`);

        if (result.recommendations.length > 0) {
            console.log('\n[Capacity Calculator] Top Recommendations:');
            result.recommendations.slice(0, 5).forEach((rec, i) => {
                console.log(`  ${i + 1}. ${rec.action} for ${rec.user_id}:${rec.endpoint}`);
                console.log(`     Current: ${rec.current_rate} req/s → Suggested: ${rec.suggested_rate} req/s`);
                console.log(`     Reason: ${rec.reason}`);
            });
        }

        await mongoose.disconnect();
        console.log('[Capacity Calculator] Completed successfully');
        process.exit(0);

    } catch (error) {
        console.error('[Capacity Calculator] Error:', error);
        process.exit(1);
    }
}

runCalculation();
