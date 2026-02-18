#!/bin/bash
# Auto-publish: commits new articles to GitHub, triggering Vercel deploy.
# Run daily via cron or launchd.

REPO_DIR="/Users/anon/Downloads/agents workign"
LOG_FILE="$REPO_DIR/data/auto-publish.log"

cd "$REPO_DIR" || exit 1

# Check for changes
CHANGES=$(git status --porcelain data/output/ data/articles-index.json data/subscribers.json 2>/dev/null)

if [ -z "$CHANGES" ]; then
  echo "[$(date)] No new articles to publish." >> "$LOG_FILE"
  exit 0
fi

# Count new/modified files
NEW_COUNT=$(echo "$CHANGES" | wc -l | tr -d ' ')

# Stage, commit, push
git add data/output/ data/articles-index.json data/subscribers.json 2>/dev/null
git add -A 2>/dev/null

TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
git commit -m "Auto-publish: $NEW_COUNT new/updated files — $TIMESTAMP" >> "$LOG_FILE" 2>&1
git push origin main >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
  echo "[$(date)] Published $NEW_COUNT changes to GitHub. Vercel will deploy automatically." >> "$LOG_FILE"
else
  echo "[$(date)] ERROR: git push failed." >> "$LOG_FILE"
fi
