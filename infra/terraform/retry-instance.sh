#!/bin/bash
# Retry terraform apply until the ARM instance is created.
# Notifies via Telegram on success/failure.
#
# Setup:
# 1. Message @BotFather on Telegram → /newbot → get the token
# 2. Message your bot, then visit:
#    https://api.telegram.org/bot<TOKEN>/getUpdates
#    to find your chat_id
# 3. Fill in the two variables below

TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""

INTERVAL=120  # seconds between retries
LOG="/tmp/tf-retry.log"

notify() {
  local msg="$1"
  if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="$TELEGRAM_CHAT_ID" \
      -d text="$msg" > /dev/null 2>&1
  fi
  echo "$msg" | tee -a "$LOG"
}

cd "$(dirname "$0")" || exit 1

echo "Starting retry loop at $(date)" | tee "$LOG"

attempt=0
while true; do
  attempt=$((attempt + 1))
  echo "[$(date)] Attempt #$attempt" | tee -a "$LOG"

  output=$(terraform apply -auto-approve 2>&1)
  echo "$output" >> "$LOG"

  if echo "$output" | grep -q "Out of host capacity"; then
    echo "[$(date)] No capacity. Retrying in ${INTERVAL}s..." | tee -a "$LOG"
    sleep "$INTERVAL"
  elif echo "$output" | grep -q "Apply complete"; then
    notify "OCI ARM instance created! Attempt #$attempt"
    break
  else
    notify "Terraform failed with unexpected error on attempt #$attempt. Check log."
    break
  fi
done
