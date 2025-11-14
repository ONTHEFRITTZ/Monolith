## EC2 SSH Shortcut

Use this command from your local terminal (PowerShell) to connect to the Mon-olith EC2 instance:

```bash

ssh -i "C:\Users\onthe\Documents\Web3\Mon-olith\Monolith.pem" ubuntu@3.151.80.105


```

If you ever rotate the key or replace the instance, update the command here accordingly.

Restart/Rebuild

ssh -i "C:\Users\onthe\Documents\Web3\Private\Monolith.pem" ubuntu@3.151.80.105 "
  cd /srv/Monolith &&
  rm -rf apps/web/.next .turbo &&
  TURBO_FORCE=1 npm run build -- --filter=@mon-olith/web &&
  sudo systemctl restart monolith-web
"
