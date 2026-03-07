#!/bin/bash
# Auto-publish: batches new articles before pushing to GitHub.
# Run via cron or launchd if you want an external deploy cadence.

REPO_DIR="/Users/anon/Downloads/agents workign"
LOG_FILE="$REPO_DIR/data/auto-publish.log"
STATE_FILE="$REPO_DIR/data/auto-publish-state.json"
BATCH_SIZE="${AUTO_PUBLISH_BATCH_SIZE:-4}"
MAX_DELAY_MINUTES="${AUTO_PUBLISH_MAX_DELAY_MINUTES:-180}"

cd "$REPO_DIR" || exit 1

# Check for changes
CHANGES=$(git status --porcelain data/output/ data/articles-index.json data/recent_titles.json data/recent_outlines.json 2>/dev/null)

if [ -z "$CHANGES" ]; then
  echo "[$(date)] No new articles to publish." >> "$LOG_FILE"
  exit 0
fi

mkdir -p "$(dirname "$STATE_FILE")"

if [ -f "$STATE_FILE" ]; then
  PENDING_RUNS=$(node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(Number(p.pendingRuns)||0)" "$STATE_FILE")
  FIRST_PENDING_AT=$(node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(Number(p.firstPendingAt)||0)" "$STATE_FILE")
else
  PENDING_RUNS=0
  FIRST_PENDING_AT=0
fi

NOW_TS=$(date +%s)
PENDING_RUNS=$((PENDING_RUNS + 1))
if [ "$FIRST_PENDING_AT" -le 0 ]; then
  FIRST_PENDING_AT=$NOW_TS
fi

AGE_MINUTES=$(( (NOW_TS - FIRST_PENDING_AT) / 60 ))

if [ "$PENDING_RUNS" -lt "$BATCH_SIZE" ] && [ "$AGE_MINUTES" -lt "$MAX_DELAY_MINUTES" ]; then
  printf '{\n  "pendingRuns": %s,\n  "firstPendingAt": %s,\n  "lastCommitAt": null\n}\n' "$PENDING_RUNS" "$FIRST_PENDING_AT" > "$STATE_FILE"
  echo "[$(date)] Queued auto-publish ($PENDING_RUNS/$BATCH_SIZE, ${AGE_MINUTES}m old)." >> "$LOG_FILE"
  exit 0
fi

# Count new/modified files
NEW_COUNT=$(echo "$CHANGES" | wc -l | tr -d ' ')

# Stage, commit, push
git add data/output/ data/articles-index.json data/recent_titles.json data/recent_outlines.json 2>/dev/null

TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
git commit -m "Auto-publish: $NEW_COUNT new/updated files — $TIMESTAMP" >> "$LOG_FILE" 2>&1
git push origin main >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
  printf '{\n  "pendingRuns": 0,\n  "firstPendingAt": null,\n  "lastCommitAt": %s\n}\n' "$NOW_TS" > "$STATE_FILE"
  echo "[$(date)] Published $NEW_COUNT changes to GitHub after batching. Vercel will deploy automatically." >> "$LOG_FILE"
else
  echo "[$(date)] ERROR: git push failed." >> "$LOG_FILE"
fi
