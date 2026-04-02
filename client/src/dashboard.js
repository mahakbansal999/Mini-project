import './style.css'

const API_BASE = 'http://localhost:3000';

const elements = {
    metricCapacity: document.getElementById('metric-capacity'),
    metricLoad: document.getElementById('metric-load'),
    metricReset: document.getElementById('metric-reset'),
    metricTokens: document.getElementById('metric-tokens'),
    loadProgress: document.getElementById('load-progress-bar'),
    systemStatus: document.getElementById('system-status-text'),
    logDisplay: document.getElementById('log-display'),
    apiKey: document.getElementById('api-key'),
    apiEndpoint: document.getElementById('api-endpoint'),
    apiComplexity: document.getElementById('api-complexity'),
    complexityLabel: document.getElementById('complexity-label'),
    btnFire: document.getElementById('btn-fire'),
    btnBurst: document.getElementById('btn-burst'),
    btnClear: document.getElementById('btn-clear'),
    btnLogout: document.getElementById('btn-logout')
};

// State
let lastSystemLoad = 0;

// Initialize
function init() {
    if (!localStorage.getItem('sentinel_session')) {
        window.location.href = '/index.html';
        return;
    }

    setupEventListeners();

    // Start polling
    setInterval(pollSystemHealth, 3000);
    pollSystemHealth();
}

function setupEventListeners() {
    elements.btnLogout.addEventListener('click', () => {
        localStorage.removeItem('sentinel_session');
        window.location.href = '/index.html';
    });

    elements.btnFire.addEventListener('click', () => fireRequest());
    elements.btnBurst.addEventListener('click', () => fireBurst());
    elements.btnClear.addEventListener('click', () => {
        elements.logDisplay.innerHTML = '';
    });

    elements.apiComplexity.addEventListener('input', (e) => {
        elements.complexityLabel.textContent = `COST: ${e.target.value} TOKENS`;
    });
}

async function pollSystemHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();

        const cpu = data.capacity?.systemLoad?.cpu_percent || 0;
        const available = data.capacity?.availableCapacity || 0;

        elements.metricLoad.textContent = cpu;
        elements.loadProgress.style.width = `${cpu}%`;
        elements.metricCapacity.textContent = Math.floor(available);

        if (cpu > 80) {
            elements.loadProgress.style.background = 'var(--error)';
            elements.systemStatus.textContent = 'HIGH LOAD DETECTED';
            elements.systemStatus.parentElement.style.color = 'var(--error)';
        } else {
            elements.loadProgress.style.background = 'linear-gradient(90deg, var(--primary), var(--secondary))';
            elements.systemStatus.textContent = 'SYSTEM OPERATIONAL';
            elements.systemStatus.parentElement.style.color = 'var(--success)';
        }

    } catch (err) {
        elements.systemStatus.textContent = 'BACKEND OFFLINE';
        elements.systemStatus.parentElement.style.color = 'var(--error)';
    }
}

async function fireRequest() {
    const endpoint = elements.apiEndpoint.value;
    const key = elements.apiKey.value;
    const cost = parseInt(elements.apiComplexity.value);
    const startTime = Date.now();

    try {
        const options = {
            method: endpoint.includes('POST') ? 'POST' : 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key
            }
        };

        if (options.method === 'POST') {
            options.body = JSON.stringify({ complexity: cost });
        }

        const response = await fetch(`${API_BASE}${endpoint}`, options);
        const data = await response.json();

        const limit = response.headers.get('X-RateLimit-Limit');
        const remaining = response.headers.get('X-RateLimit-Remaining');
        const reset = response.headers.get('X-RateLimit-Reset');

        updateRateLimitUI(remaining, limit, reset);
        addLogEntry(options.method, endpoint, response.status, Date.now() - startTime, remaining);

    } catch (error) {
        addLogEntry('ERROR', endpoint, 'OFFLINE', 0, '--');
    }
}

async function fireBurst() {
    const BURST_COUNT = 10;
    elements.btnBurst.disabled = true;
    elements.btnBurst.textContent = 'BURSTING...';

    const promises = [];
    for (let i = 0; i < BURST_COUNT; i++) {
        promises.push(fireRequest());
    }

    await Promise.all(promises);
    elements.btnBurst.disabled = false;
    elements.btnBurst.textContent = '⚡ BURST MODE';
}

function updateRateLimitUI(remaining, limit, reset) {
    if (!remaining) return;
    elements.metricTokens.textContent = Math.floor(remaining);

    if (reset) {
        const resetTime = parseInt(reset);
        const now = Math.floor(Date.now() / 1000);
        const wait = Math.max(0, resetTime - now);
        elements.metricReset.textContent = wait;
    }
}

function addLogEntry(method, path, status, duration, remaining) {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const statusClass = status === 429 ? 'status-429' : '';
    const methodClass = `method-${method.toLowerCase()}`;

    entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-method ${methodClass}">${method}</span>
    <span class="log-path">${path}</span>
    <span class="log-status ${statusClass}">${status}</span>
    <span class="log-info" style="color: var(--text-muted)">${duration}ms | REM: ${remaining}</span>
  `;

    elements.logDisplay.prepend(entry);
}

init();
