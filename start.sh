#!/bin/bash

# Quick Start Script for Request Throttling Manager
# Automates setup and startup process

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

log() {
    echo -e "\033[1;34m[$(date +%H:%M:%S)]\033[0m $1"
}

error() {
    echo -e "\033[1;31m[ERROR]\033[0m $1"
}

success() {
    echo -e "\033[1;32m[SUCCESS]\033[0m $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    local missing=()
    
    if ! command -v node &> /dev/null; then
        missing+=("Node.js")
    fi
    
    if ! command -v npm &> /dev/null; then
        missing+=("npm")
    fi
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        error "Missing required tools: ${missing[*]}"
        error "Please install them and try again"
        exit 1
    fi
    
    success "All prerequisites found"
}

# Install dependencies
install_deps() {
    log "Installing Node.js dependencies..."
    npm install
    success "Dependencies installed"
}

# Check if services are running
check_services() {
    log "Checking MongoDB and Redis..."
    
    local mongo_running=false
    local redis_running=false
    
    # Check MongoDB
    if mongosh --eval "db.adminCommand('ping')" &> /dev/null || \
       mongo --eval "db.adminCommand('ping')" &> /dev/null; then
        mongo_running=true
        success "MongoDB is running"
    fi
    
    # Check Redis
    if redis-cli ping &> /dev/null; then
        redis_running=true
        success "Redis is running"
    fi
    
    if [[ "$mongo_running" == false ]] || [[ "$redis_running" == false ]]; then
        log "Some services are not running. Attempting to start with Docker..."
        start_docker_services
    fi
}

# Start services with Docker
start_docker_services() {
    if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
        error "Docker not found. Please start MongoDB and Redis manually."
        error "MongoDB: mongodb://localhost:27017"
        error "Redis: redis://localhost:6379"
        exit 1
    fi
    
    log "Starting MongoDB and Redis with Docker..."
    docker-compose up -d mongo redis
    
    log "Waiting for services to be ready..."
    sleep 5
    
    success "Services started"
}

# Initialize database
init_database() {
    log "Initializing database..."
    
    if [[ -f "scripts/mongo-init.js" ]]; then
        mongosh "$MONGO_URI" < scripts/mongo-init.js &> /dev/null || \
        mongo "$MONGO_URI" < scripts/mongo-init.js &> /dev/null || true
        success "Database initialized"
    fi
}

# Start application
start_app() {
    log "Starting Request Throttling Manager..."
    log ""
    log "Application will be available at: http://localhost:${PORT:-3000}"
    log "Health check: http://localhost:${PORT:-3000}/health"
    log ""
    log "Press Ctrl+C to stop"
    log ""
    
    if [[ "${NODE_ENV:-development}" == "development" ]]; then
        npm run dev
    else
        npm start
    fi
}

# Main execution
main() {
    clear
    echo "╔═══════════════════════════════════════════════════╗"
    echo "║   Request Throttling Manager - Quick Start       ║"
    echo "╚═══════════════════════════════════════════════════╝"
    echo ""
    
    # Load environment variables
    if [[ -f ".env" ]]; then
        export $(cat .env | grep -v '^#' | xargs)
    fi
    
    check_prerequisites
    install_deps
    check_services
    init_database
    
    echo ""
    echo "╔═══════════════════════════════════════════════════╗"
    echo "║              Setup Complete!                      ║"
    echo "╚═══════════════════════════════════════════════════╝"
    echo ""
    
    start_app
}

# Handle Ctrl+C
trap 'echo ""; log "Shutting down..."; exit 0' INT

main "$@"
