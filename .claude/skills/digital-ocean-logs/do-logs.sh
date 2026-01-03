#!/bin/bash

# DigitalOcean App Platform Logs Helper
# Usage: ./do-logs.sh <command> [args...]

set -e

# Load API key from .env if not already set
if [ -z "$DIGITAL_OCEAN_API_KEY" ]; then
    if [ -f ".env" ]; then
        export DIGITAL_OCEAN_API_KEY=$(grep "^DIGITAL_OCEAN_API_KEY=" .env | cut -d'=' -f2)
    fi
fi

if [ -z "$DIGITAL_OCEAN_API_KEY" ]; then
    echo "Error: DIGITAL_OCEAN_API_KEY not found in environment or .env"
    exit 1
fi

API_BASE="https://api.digitalocean.com/v2"

# App ID mappings
declare -A APPS=(
    ["easyescrow-backend"]="a6e6452b-1ec6-4316-82fe-e4069d089b49"
    ["easyescrow-staging"]="ea13cdbb-c74e-40da-a0eb-6c05b0d0432d"
    ["easyescrow-frontend"]="26b10833-0b7f-4c80-b4d6-be71c4513e79"
    ["nftswap-gg"]="77e46321-1661-4faa-b257-9c8db2d604fa"
    ["datasales"]="038c152b-f1a8-421b-b97d-a3340ea19667"
)

# Default components for each app
declare -A DEFAULT_COMPONENTS=(
    ["easyescrow-backend"]="api"
    ["easyescrow-staging"]="api-staging"
    ["easyescrow-frontend"]="easyescrow-api"
    ["nftswap-gg"]="backend"
    ["datasales"]="datasales-website"
)

do_request() {
    local endpoint="$1"
    curl -s -X GET "${API_BASE}${endpoint}" \
        -H "Authorization: Bearer $DIGITAL_OCEAN_API_KEY" \
        -H "Content-Type: application/json"
}

list_apps() {
    echo "=== DigitalOcean Apps ==="
    do_request "/apps" | jq -r '.apps[] | "\(.spec.name) (\(.id)) - \(.live_url // "no url")"'
}

get_logs() {
    local app_name="$1"
    local component="${2:-}"
    local lines="${3:-100}"

    local app_id="${APPS[$app_name]}"
    if [ -z "$app_id" ]; then
        echo "Error: Unknown app '$app_name'. Available apps:"
        for key in "${!APPS[@]}"; do
            echo "  - $key"
        done
        exit 1
    fi

    # Use default component if not specified
    if [ -z "$component" ]; then
        component="${DEFAULT_COMPONENTS[$app_name]}"
    fi

    echo "=== Logs for $app_name / $component (last $lines lines) ===" >&2

    # Get logs URL
    local response=$(do_request "/apps/$app_id/components/$component/logs?type=RUN&follow=false&tail_lines=$lines")
    local logs_url=$(echo "$response" | jq -r '.url // empty')

    if [ -z "$logs_url" ]; then
        echo "Error getting logs URL. Response:"
        echo "$response" | jq .
        exit 1
    fi

    # Fetch actual logs
    curl -s "$logs_url"
}

get_deploy_logs() {
    local app_name="$1"
    local component="${2:-}"

    local app_id="${APPS[$app_name]}"
    if [ -z "$app_id" ]; then
        echo "Error: Unknown app '$app_name'"
        exit 1
    fi

    # Use default component if not specified
    if [ -z "$component" ]; then
        component="${DEFAULT_COMPONENTS[$app_name]}"
    fi

    echo "=== Deploy Logs for $app_name / $component ===" >&2

    # Get logs URL for BUILD type
    local response=$(do_request "/apps/$app_id/components/$component/logs?type=BUILD&follow=false&tail_lines=500")
    local logs_url=$(echo "$response" | jq -r '.url // empty')

    if [ -z "$logs_url" ]; then
        echo "Error getting deploy logs. Response:"
        echo "$response" | jq .
        exit 1
    fi

    curl -s "$logs_url"
}

get_app_info() {
    local app_name="$1"
    local app_id="${APPS[$app_name]}"

    if [ -z "$app_id" ]; then
        echo "Error: Unknown app '$app_name'"
        exit 1
    fi

    echo "=== App Info: $app_name ===" >&2
    do_request "/apps/$app_id" | jq '{
        name: .app.spec.name,
        region: .app.region.slug,
        live_url: .app.live_url,
        last_deployment: .app.last_deployment_active_at,
        components: [.app.spec.services[].name, .app.spec.static_sites[]?.name, .app.spec.jobs[]?.name] | map(select(. != null))
    }'
}

# Main command router
case "$1" in
    list)
        list_apps
        ;;
    logs)
        if [ -z "$2" ]; then
            echo "Usage: $0 logs <app-name> [component] [lines]"
            echo "Apps: ${!APPS[*]}"
            exit 1
        fi
        # Handle both "logs app lines" and "logs app component lines" formats
        if [[ "$3" =~ ^[0-9]+$ ]]; then
            get_logs "$2" "" "$3"
        else
            get_logs "$2" "$3" "${4:-100}"
        fi
        ;;
    deploy-logs)
        if [ -z "$2" ]; then
            echo "Usage: $0 deploy-logs <app-name> [component]"
            exit 1
        fi
        get_deploy_logs "$2" "$3"
        ;;
    info)
        if [ -z "$2" ]; then
            echo "Usage: $0 info <app-name>"
            exit 1
        fi
        get_app_info "$2"
        ;;
    *)
        echo "DigitalOcean App Platform Logs"
        echo ""
        echo "Usage: $0 <command> [args...]"
        echo ""
        echo "Commands:"
        echo "  list                          List all apps"
        echo "  logs <app> [component] [n]    Get runtime logs (default 100 lines)"
        echo "  deploy-logs <app> [component] Get build/deploy logs"
        echo "  info <app>                    Get app info and components"
        echo ""
        echo "Apps: ${!APPS[*]}"
        ;;
esac
