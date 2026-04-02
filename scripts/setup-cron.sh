#!/bin/bash

# Setup cron jobs for automated throttle management
# Run this script once to configure periodic tasks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

log() {
    echo "[$(date -Iseconds)] $1"
}

# Check if running as root (required for cron setup)
if [[ $EUID -ne 0 ]] && [[ "$OSTYPE" != "msys" ]] && [[ "$OSTYPE" != "win32" ]]; then
   log "This script should be run with sudo for cron setup"
   exit 1
fi

log "Setting up cron jobs for Request Throttling Manager..."

# Create cron entries
CRON_ENTRIES="
# Request Throttling Manager - Automated Tasks

# Capacity calculation every 5 minutes
*/5 * * * * cd $PROJECT_DIR && node scripts/capacity-calculator/calculate.js >> /var/log/throttle-capacity.log 2>&1

# Traffic smoother runs continuously (managed by systemd/docker)
# But we can trigger manual adjustments via signals

# Policy deployment check (if using Git-based policies)
0 */6 * * * cd $PROJECT_DIR && scripts/policy-deployer/deploy.sh list >> /var/log/throttle-policies.log 2>&1

# Cleanup old metrics (keep last 30 days)
0 2 * * * cd $PROJECT_DIR && node -e \"
require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await mongoose.connection.collection('capacitymetrics').deleteMany({
        timestamp: { \\\$lt: thirtyDaysAgo }
    });
    console.log('Deleted', result.deletedCount, 'old capacity metrics');
    await mongoose.disconnect();
});
\" >> /var/log/throttle-cleanup.log 2>&1
"

# Write to crontab
if command -v crontab &> /dev/null; then
    # Backup existing crontab
    crontab -l > /tmp/crontab.backup 2>/dev/null || true
    
    # Add new entries (avoiding duplicates)
    (crontab -l 2>/dev/null | grep -v "Request Throttling Manager"; echo "$CRON_ENTRIES") | crontab -
    
    log "Cron jobs installed successfully"
    log "View with: crontab -l"
else
    log "WARNING: crontab not found. On Windows, use Task Scheduler instead."
    log "Creating task-scheduler.xml for Windows..."
    
    # Create Windows Task Scheduler XML
    cat > "$PROJECT_DIR/task-scheduler.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Request Throttling Manager - Capacity Calculator</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <Repetition>
        <Interval>PT5M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>2026-01-01T00:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Actions>
    <Exec>
      <Command>node</Command>
      <Arguments>scripts/capacity-calculator/calculate.js</Arguments>
      <WorkingDirectory>PROJECT_DIR_PLACEHOLDER</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
EOF
    
    # Replace placeholder
    sed -i "s|PROJECT_DIR_PLACEHOLDER|$PROJECT_DIR|g" "$PROJECT_DIR/task-scheduler.xml"
    
    log "Created task-scheduler.xml"
    log "Import with: schtasks /create /tn \"ThrottleCapacityCalc\" /xml task-scheduler.xml"
fi

# Create log directory
mkdir -p /var/log 2>/dev/null || mkdir -p "$PROJECT_DIR/logs"

log "Setup complete!"
log ""
log "Automated tasks configured:"
log "  - Capacity calculation: Every 5 minutes"
log "  - Metrics cleanup: Daily at 2 AM"
log "  - Policy checks: Every 6 hours"
