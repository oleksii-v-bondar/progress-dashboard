#!/bin/bash
# Retry terraform apply cycling through all 3 availability domains.
# Notifies via Telegram on success/failure.
# Sends a status update every hour if still retrying.
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
AD_COUNT=3    # Frankfurt has 3 ADs (index 0, 1, 2)
STATUS_INTERVAL=3600  # send status update every hour

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
notify "Retry script started."

attempt=0
last_status=$(date +%s)

while true; do
  for ad in $(seq 0 $((AD_COUNT - 1))); do
    attempt=$((attempt + 1))
    echo "[$(date)] Attempt #$attempt (AD index: $ad)" | tee -a "$LOG"

    output=$(terraform apply -auto-approve -var="ad_index=$ad" 2>&1)
    echo "$output" >> "$LOG"

    if echo "$output" | grep -q "Out of host capacity"; then
      echo "[$(date)] No capacity in AD $ad." | tee -a "$LOG"
    elif echo "$output" | grep -q "Apply complete"; then
      notify "OCI ARM instance created in AD $ad! Attempt #$attempt"
      exit 0
    else
      notify "Terraform failed with unexpected error on attempt #$attempt (AD $ad). Check log."
      exit 1
    fi
  done

  # Hourly status update
  now=$(date +%s)
  elapsed=$((now - last_status))
  if [ "$elapsed" -ge "$STATUS_INTERVAL" ]; then
    notify "Still retrying... $attempt attempts so far. No capacity in any AD."
    last_status=$now
  fi

  echo "[$(date)] All ADs exhausted. Waiting ${INTERVAL}s before next round..." | tee -a "$LOG"
  sleep "$INTERVAL"
done
