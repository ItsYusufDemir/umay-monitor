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
    # React connects directly to the container via HTTP
    FULL_API_URL="http://localhost:5123"
    
    echo ""
    echo "-> Mode: Localhost"
    echo "-> Frontend will talk to: ${FULL_API_URL}"

else
    # --- Domain Mode ---
    read -p "Enter your Domain (e.g. example.com): " USER_DOMAIN
    
    # Clean input (remove http/https and trailing slashes)
    CLEAN_DOMAIN="${USER_DOMAIN#http://}"
    CLEAN_DOMAIN="${CLEAN_DOMAIN#https://}"
    CLEAN_DOMAIN="${CLEAN_DOMAIN%/}"

    # React connects to the HTTPS SUBDOMAIN
    FULL_API_URL="https://api.${CLEAN_DOMAIN}"

    echo ""
    echo "-> Mode: Domain (${CLEAN_DOMAIN})"
    echo "-> Frontend will talk to: ${FULL_API_URL}"
fi

echo ""
echo "-> Building containers..."
# Export the URL so Docker picks it up during build
export UMAY_API_URL="${FULL_API_URL}"
docker compose up -d --build

echo ""
echo "✅ Umay Monitor Installed Successfully!"
echo "------------------------------------------"

if [[ "$MODE" == "1" ]]; then
    echo "Access Dashboard: http://localhost:3000"
else
    echo "⚠️  ACTION REQUIRED: Configure Nginx/Apache (SSL Termination)"
    echo ""
    echo "1. Map 'https://${CLEAN_DOMAIN}'     -> http://localhost:3000"
    echo "2. Map 'https://api.${CLEAN_DOMAIN}' -> http://localhost:5123"
    echo ""
    echo "Once configured, access: https://${CLEAN_DOMAIN}"
fi
echo "------------------------------------------"