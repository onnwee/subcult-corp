# SUBCULT OPS — VPS Worker Deployment

# Copy these .service files to /etc/systemd/system/ on your VPS.

#

# Usage:

# sudo cp deploy/systemd/\*.service /etc/systemd/system/

# sudo systemctl daemon-reload

# sudo systemctl enable --now subcult-roundtable

# sudo systemctl enable --now subcult-initiative

#

# Manage:

# sudo systemctl status subcult-roundtable

# sudo journalctl -u subcult-roundtable -f

# sudo systemctl restart subcult-roundtable

# ─── Setup Checklist ───

# 1. Clone repo to VPS: /opt/subcult-corp/

# 2. Install Node.js 20+: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs

# 3. Install deps: cd /opt/subcult-corp && npm install

# 4. Create .env.local: cp .env.example .env.local && chmod 600 .env.local

# 5. Edit .env.local with your real keys

# 6. Copy service files + enable (see above)

# 7. Verify: sudo systemctl status subcult-\*
