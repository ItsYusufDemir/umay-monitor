#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "      UMAY MONITOR - Setup Wizard"
echo "=========================================="
echo ""
echo "How will you access this server?"
echo "1) Localhost (Testing on this machine)"
echo "2) Domain Name (e.g. example.com)"
read -p "Select [1/2]: " MODE

if [[ "$MODE" == "1" ]]; then
    # --- Localhost Mode ---
    FULL_API_URL="http://localhost:5123"
    DASHBOARD_URL="http://localhost:3000"
    
    echo ""
    echo "-> Mode: Localhost"

else
    # --- Domain Mode ---
    echo ""
    echo "--- Dashboard Configuration ---"
    read -p "Enter the Domain for the DASHBOARD (e.g. monitor.example.com): " USER_DASH_INPUT
    
    # Clean input
    CLEAN_DASH="${USER_DASH_INPUT#http://}"
    CLEAN_DASH="${CLEAN_DASH#https://}"
    CLEAN_DASH="${CLEAN_DASH%/}"

    echo ""
    echo "--- API Configuration ---"
    # Smart default: api. + the dashboard domain
    DEFAULT_API="api.${CLEAN_DASH}"
    
    echo "The standard API domain is: ${DEFAULT_API}"
    read -p "Press ENTER to use this, or type a custom API domain: " CUSTOM_API_INPUT

    if [[ -z "$CUSTOM_API_INPUT" ]]; then
        FINAL_API_DOMAIN="${DEFAULT_API}"
    else
        FINAL_API_DOMAIN="${CUSTOM_API_INPUT#http://}"
        FINAL_API_DOMAIN="${FINAL_API_DOMAIN#https://}"
        FINAL_API_DOMAIN="${FINAL_API_DOMAIN%/}"
    fi

    # HTTPS is assumed for domains
    FULL_API_URL="https://${FINAL_API_DOMAIN}"
    DASHBOARD_URL="https://${CLEAN_DASH}"

    echo ""
    echo "-> Mode: Domain"
    echo "-> Dashboard: ${DASHBOARD_URL}"
    echo "-> API:       ${FULL_API_URL}"
fi

echo ""
echo "-> Building containers..."
export UMAY_API_URL="${FULL_API_URL}"

export UMAY_DASHBOARD_URL="${DASHBOARD_URL}

docker compose up -d --build

echo ""
echo "✅ Umay Monitor Installed Successfully!"
echo "------------------------------------------"

if [[ "$MODE" == "1" ]]; then
    echo "Access Dashboard: ${DASHBOARD_URL}"
else
    echo "⚠️  ACTION REQUIRED: Configure Nginx/Apache (SSL Termination)"
    echo ""
    echo "1. Map '${DASHBOARD_URL}' -> http://localhost:3000"
    echo "2. Map '${FULL_API_URL}' -> http://localhost:5123"
    echo ""
    echo "Once configured, access: ${DASHBOARD_URL}"
fi
echo "------------------------------------------"