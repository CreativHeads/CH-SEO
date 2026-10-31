#!/bin/sh
# Upload the committed code (git HEAD) to the VPS and rebuild Climb. Secrets stay in /opt/climb/deploy/vps/.env on the VPS.
# Usage (Git Bash):  sh scripts/deploy-vps.sh        Needs the deploy SSH key at ~/.ssh/climb_vps.
set -e
HOST=${CLIMB_VPS:-root@187.126.125.145}
KEY=${CLIMB_KEY:-$HOME/.ssh/climb_vps}
git archive --format=tar HEAD | ssh -i "$KEY" -o BatchMode=yes "$HOST" '
 set -e; mkdir -p /opt/climb; cd /opt/climb
 find . -mindepth 1 -maxdepth 1 ! -name deploy -exec rm -rf {} +
 find deploy -mindepth 1 ! -name .env ! -path deploy/vps -delete 2>/dev/null || true
 tar -xf -
 cd deploy/vps; docker compose up -d --build; docker image prune -f >/dev/null; docker compose ps'
