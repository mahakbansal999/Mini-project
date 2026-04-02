#!/usr/bin/env node

/**
 * System Verification Script
 * Checks that all components are properly configured
 */

const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

const checks = [];
let passed = 0;
let failed = 0;
let warnings = 0;

function check(name, fn) {
    checks.push({ name, fn });
}

function log(color, symbol, message) {
    console.log(`${color}${symbol}${RESET} ${message}`);
}

function pass(message) {
    log(GREEN, '✓', message);
    passed++;
}

function fail(message) {
    log(RED, '✗', message);
    failed++;
}

function warn(message) {
    log(YELLOW, '⚠', message);
    warnings++;
}

function info(message) {
    log(BLUE, 'ℹ', message);
}

// File existence checks
check('Core files exist', () => {
    const files = [
        'src/index.js',
        'src/app.js',
        'src/middleware/throttle.js',
        'src/services/TokenBucket.js',
        'src/services/CapacityCalculator.js',
        'src/utils/signalHandler.js',
        'src/models/CapacityMetrics.js',
        'src/models/UsagePattern.js',
        'package.json',
        '.env'
    ];

    files.forEach(file => {
        if (fs.existsSync(file)) {
            pass(`Found ${file}`);
        } else {
            fail(`Missing ${file}`);
        }
    });
});

check('Scripts exist', () => {
    const scripts = [
        'scripts/capacity-calculator/calculate.js',
        'scripts/traffic-smoother/throttle-adjuster.sh',
        'scripts/policy-deployer/deploy.sh',
        'scripts/setup-cron.sh',
        'start.sh',
        'start.bat'
    ];

    scripts.forEach(script => {
        if (fs.existsSync(script)) {
            pass(`Found ${script}`);
        } else {
            warn(`Missing ${script}`);
        }
    });
});

check('Dependencies installed', () => {
    if (fs.existsSync('node_modules')) {
        pass('node_modules directory exists');

        const pkg = require('./package.json');
        const requiredDeps = [
            'express',
            'mongoose',
            'ioredis',
            'dotenv',
            'node-cron'
        ];

        requiredDeps.forEach(dep => {
            if (pkg.dependencies[dep]) {
                pass(`Dependency ${dep} listed in package.json`);
            } else {
                fail(`Missing dependency ${dep}`);
            }
        });
    } else {
        fail('node_modules not found - run npm install');
    }
});

check('Environment configuration', () => {
    if (fs.existsSync('.env')) {
        const env = fs.readFileSync('.env', 'utf8');

        const required = ['MONGO_URI', 'REDIS_URI', 'PORT'];
        required.forEach(key => {
            if (env.includes(key)) {
                pass(`Environment variable ${key} configured`);
            } else {
                warn(`Environment variable ${key} not found`);
            }
        });
    } else {
        fail('.env file not found');
    }
});

check('Docker configuration', () => {
    if (fs.existsSync('docker-compose.yml')) {
        pass('docker-compose.yml exists');
    } else {
        warn('docker-compose.yml not found');
    }

    if (fs.existsSync('Dockerfile')) {
        pass('Dockerfile exists');
    } else {
        warn('Dockerfile not found');
    }
});

check('Test files', () => {
    const tests = [
        'tests/integration/throttle.test.js',
        'tests/load/throttle-test.yml'
    ];

    tests.forEach(test => {
        if (fs.existsSync(test)) {
            pass(`Found ${test}`);
        } else {
            warn(`Missing ${test}`);
        }
    });
});

check('Documentation', () => {
    const docs = [
        'README.md',
        'IMPLEMENTATION_SUMMARY.md'
    ];

    docs.forEach(doc => {
        if (fs.existsSync(doc)) {
            pass(`Found ${doc}`);
        } else {
            warn(`Missing ${doc}`);
        }
    });
});

// Run all checks
async function runChecks() {
    console.log('\n' + BLUE + '═'.repeat(60) + RESET);
    console.log(BLUE + '  Request Throttling Manager - System Verification' + RESET);
    console.log(BLUE + '═'.repeat(60) + RESET + '\n');

    for (const { name, fn } of checks) {
        console.log(`\n${BLUE}▶${RESET} ${name}:`);
        try {
            await fn();
        } catch (error) {
            fail(`Error: ${error.message}`);
        }
    }

    // Summary
    console.log('\n' + BLUE + '═'.repeat(60) + RESET);
    console.log(BLUE + '  Summary' + RESET);
    console.log(BLUE + '═'.repeat(60) + RESET);
    console.log(`${GREEN}✓${RESET} Passed:   ${passed}`);
    console.log(`${RED}✗${RESET} Failed:   ${failed}`);
    console.log(`${YELLOW}⚠${RESET} Warnings: ${warnings}`);
    console.log(BLUE + '═'.repeat(60) + RESET + '\n');

    if (failed === 0) {
        console.log(GREEN + '🎉 All critical checks passed! System is ready.' + RESET);
        console.log('\nNext steps:');
        info('1. Start MongoDB and Redis');
        info('2. Run: npm start');
        info('3. Test: curl http://localhost:3000/health');
        console.log('');
        process.exit(0);
    } else {
        console.log(RED + '❌ Some checks failed. Please fix the issues above.' + RESET);
        console.log('');
        process.exit(1);
    }
}

runChecks().catch(console.error);
