import './style.css'

const API_BASE = 'http://localhost:3000';

// DOM Elements
const loginForm = document.getElementById('login-form');
const loginUser = document.getElementById('login-username');
const loginPass = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-login');

// Initialize
function init() {
    if (localStorage.getItem('sentinel_session')) {
        window.location.href = '/dashboard.html';
        return;
    }
    setupEventListeners();
}

function setupEventListeners() {
    loginForm.addEventListener('submit', handleLogin);
}

function handleLogin(e) {
    e.preventDefault();
    const username = loginUser.value;
    const password = loginPass.value;

    // Show loading state
    const btnText = btnLogin.querySelector('.btn-text');
    const btnLoader = btnLogin.querySelector('.btn-loader');

    btnText.style.display = 'none';
    btnLoader.style.display = 'block';
    btnLogin.disabled = true;

    // Simulate authentication delay
    setTimeout(() => {
        if (username === 'admin' && password === 'admin123') {
            localStorage.setItem('sentinel_session', Date.now());
            window.location.href = '/dashboard.html';
        } else {
            loginError.style.display = 'block';
            loginPass.value = '';
            btnText.style.display = 'block';
            btnLoader.style.display = 'none';
            btnLogin.disabled = false;

            setTimeout(() => {
                loginError.style.display = 'none';
            }, 3000);
        }
    }, 1000);
}

init();
