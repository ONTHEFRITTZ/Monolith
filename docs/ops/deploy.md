# Mon-olith Deployment Runbook

This guide covers everything required to promote the latest changes from `main` onto the Ubuntu host at `/srv/Monolith`, keep both apps running under `systemd`, and serve them over HTTPS via Nginx + Certbot.

> **Assumptions**
>
> - Repository checked out at `/srv/Monolith`
> - Node.js 20+ and npm 10+ installed
> - You deploy as the `ubuntu` user with sudo
> - DNS for `monolith-labs.xyz` and `www.monolith-labs.xyz` already points at the EC2 elastic IP

---

## 1. Pull & Build

```bash
cd /srv/Monolith
git pull
npm ci

# Build API (set NODE_OPTIONS to keep the 2 GB box happy)
NODE_OPTIONS="--max-old-space-size=2048" npm run build -- --filter=@mon-olith/api

# Build web (Next.js)
npm run build -- --filter=@mon-olith/web
```

Both builds must succeed before restarting services. The API build emits `apps/api/dist`, and the web build emits `apps/web/.next`.

---

## 2. Configure systemd Units

Template unit files live in `ops/systemd/`. Copy them into `/etc/systemd/system/` and tweak paths if your checkout directory differs.

```bash
sudo cp ops/systemd/monolith-api.service /etc/systemd/system/
sudo cp ops/systemd/monolith-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable monolith-api monolith-web
sudo systemctl restart monolith-api monolith-web
```

### Service expectations

- API listens on `127.0.0.1:3001` and reads env from `apps/api/.env`
- Web listens on `127.0.0.1:3000` and serves the pre-built `.next` output
- `systemctl status monolith-api` / `monolith-web` should be `active (running)` with zero recent restarts
- Journals live at `journalctl -u monolith-api -f`

---

## 3. Nginx Reverse Proxy

The template `ops/nginx/monolith.conf` proxies:

- `/` to the Next.js server on `127.0.0.1:3000`
- `/api/` to the Nest API on `127.0.0.1:3001`
- Adds the required WebSocket/SSE headers for future features

Install the config and enable the site:

```bash
sudo cp ops/nginx/monolith.conf /etc/nginx/sites-available/monolith.conf
sudo ln -sf /etc/nginx/sites-available/monolith.conf /etc/nginx/sites-enabled/monolith.conf
sudo nginx -t
sudo systemctl reload nginx
```

At this point the site serves plain HTTP.

---

## 4. TLS via Certbot

Install Certbot (first run only):

```bash
sudo snap install core && sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

Issue certificates for both apex and `www`:

```bash
sudo certbot --nginx \
  -d monolith-labs.xyz \
  -d www.monolith-labs.xyz
```

Certbot will update the Nginx config in-place and set up renewal. Test renewal monthly:

```bash
sudo certbot renew --dry-run
```

---

## 5. Smoke Test Checklist

1. `curl -I https://monolith-labs.xyz` returns `200` and the `server` header from `nginx`
2. `curl -I https://monolith-labs.xyz/api/health` (add a health route if missing) returns `200`
3. Frontend renders wallet picker + background image in both desktop & mobile breakpoints
4. Bridge preview + submission flows log the request in `journalctl -u monolith-api`
5. `systemctl status` shows both units `running` for at least a few minutes

---

## 6. Troubleshooting

| Symptom                                                         | Fix                                                                                                                                                             |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `systemctl status monolith-api` shows `code=exited` immediately | Run `NODE_OPTIONS="--max-old-space-size=2048" npm run build -- --filter=@mon-olith/api` again, ensure `.env` exists, then `sudo systemctl restart monolith-api` |
| HTTP 502/504 from Nginx                                         | Confirm both services listening with `ss -tulpn                                                                                                                 | grep 300`, check firewalls, restart offending service |
| Certbot fails due to rate limits                                | Use `--staging` flag when testing; wait an hour before retrying production issuance                                                                             |
| Changes not visible after deploy                                | Rebuild both workspaces, `sudo systemctl restart monolith-web`, and clear browser cache                                                                         |

Keep this runbook updated as infra evolves (e.g., adding workers, queues, or additional domains).
