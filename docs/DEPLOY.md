# Deploying Cleave on a VPS

## Prerequisites

- Ubuntu 22.04+ (or Debian 12+)
- Root or sudo access
- Domain name (optional, for SSL)

---

## 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v   # v20.x
npm -v    # 10.x

# Install Playwright system dependencies
sudo npx playwright install-deps chromium
```

---

## 2. Clone & Install

```bash
# Clone repo
cd /opt
sudo git clone https://github.com/Raghdkun/Cleave.git cleave
sudo chown -R $USER:$USER /opt/cleave
cd /opt/cleave

# Install core exporter dependencies
npm install

# Install Playwright browser
npx playwright install chromium

# Install web UI dependencies & build
cd web
npm install
npm run build
cd ..
```

---

## 3. Environment Config

```bash
cat > /opt/cleave/.env << 'EOF'
PORT=3001
NODE_ENV=production
LOG_LEVEL=info
EOF
```

---

## 4. Create systemd Service

```bash
sudo tee /etc/systemd/system/cleave.service << 'EOF'
[Unit]
Description=Cleave Website Exporter
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/cleave/web
EnvironmentFile=/opt/cleave/.env
ExecStart=/usr/bin/npx tsx server/index.ts
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/tmp /opt/cleave
PrivateTmp=true

# Resource limits
LimitNOFILE=65536
MemoryMax=2G

[Install]
WantedBy=multi-user.target
EOF
```

```bash
# Fix ownership for www-data
sudo chown -R www-data:www-data /opt/cleave

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable cleave
sudo systemctl start cleave

# Check status
sudo systemctl status cleave
sudo journalctl -u cleave -f
```

---

## 5. Nginx Reverse Proxy

```bash
sudo apt install -y nginx
```

### Without SSL (HTTP only)

```bash
sudo tee /etc/nginx/sites-available/cleave << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE — disable buffering for real-time progress
    location /api/export/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 300s;
    }
}
EOF
```

```bash
sudo ln -s /etc/nginx/sites-available/cleave /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### With SSL (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot auto-configures the SSL block and sets up auto-renewal.

---

## 6. Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 7. Update / Redeploy

```bash
cd /opt/cleave
sudo -u www-data git pull origin main
npm install
cd web && npm install && npm run build && cd ..
sudo systemctl restart cleave
```

Or create a deploy script:

```bash
cat > /opt/cleave/deploy.sh << 'SCRIPT'
#!/bin/bash
set -e
cd /opt/cleave
git pull origin main
npm install
cd web && npm install && npm run build && cd ..
sudo systemctl restart cleave
echo "✅ Deployed successfully"
SCRIPT
chmod +x /opt/cleave/deploy.sh
```

---

## 8. Monitoring

```bash
# Live logs
sudo journalctl -u cleave -f

# Health check
curl http://localhost:3001/api/health

# Restart if issues
sudo systemctl restart cleave
```

---

## Quick Reference

| Item | Value |
|---|---|
| App directory | `/opt/cleave` |
| Service name | `cleave.service` |
| Internal port | `3001` |
| Logs | `journalctl -u cleave` |
| Config | `/opt/cleave/.env` |
| Build frontend | `cd web && npm run build` |
| Restart | `sudo systemctl restart cleave` |

---

## Troubleshooting

**Playwright fails to launch browser:**
```bash
sudo npx playwright install-deps chromium
# If still failing, install manually:
sudo apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxrandr2 libgbm1 libpango-1.0-0 \
  libasound2
```

**Permission denied on /tmp:**
```bash
# Ensure www-data can write to tmp
sudo chmod 1777 /tmp
```

**SSE progress not streaming (stuck loading):**
- Check nginx config has `proxy_buffering off` for `/api/export/`
- Verify `chunked_transfer_encoding off` is set

**Port already in use:**
```bash
sudo lsof -i :3001
# Kill the process or change PORT in .env
```
