#!/bin/bash

# DigitalOcean App Platform Logs Helper
# Usage: ./do-logs.sh <command> [args...]

set -e

# Script location for finding cache file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_FILE="$SCRIPT_DIR/apps-cache.json"
CACHE_MAX_AGE_DAYS=7

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

do_request() {
    local endpoint="$1"
    curl -s -X GET "${API_BASE}${endpoint}" \
        -H "Authorization: Bearer $DIGITAL_OCEAN_API_KEY" \
        -H "Content-Type: application/json"
}

get_cache_age_days() {
    if [ ! -f "$CACHE_FILE" ]; then
        echo "999999"
        return
    fi

    local last_updated=$(jq -r '.lastUpdated // empty' "$CACHE_FILE" 2>/dev/null)
    if [ -z "$last_updated" ]; then
        echo "999999"
        return
    fi

    # Convert ISO date to epoch and calculate age
    # Strip milliseconds (.xxx) and timezone (Z) for BSD date compatibility
    local date_stripped="${last_updated%%.*}"  # Remove .xxx if present
    date_stripped="${date_stripped%Z}"          # Remove trailing Z
    local cache_epoch=$(date -d "$last_updated" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$date_stripped" +%s 2>/dev/null || echo "0")
    local now_epoch=$(date +%s)
    local age_seconds=$((now_epoch - cache_epoch))
    local age_days=$((age_seconds / 86400))
    echo "$age_days"
}

update_app_cache() {
    echo "Refreshing app cache from DigitalOcean..." >&2

    local response=$(do_request "/apps")

    # Build the cache JSON using jq
    local cache=$(echo "$response" | jq '{
        lastUpdated: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
        apps: (
            .apps | map({
                key: (.spec.name | gsub("-production$"; "") | gsub("-staging$"; "-staging") | gsub("-prod-frontend$"; "")),
                value: {
                    id: .id,
                    defaultComponent: ((.spec.services[0].name // .spec.static_sites[0].name // .spec.jobs[0].name) // null),
                    fullName: .spec.name
                }
            }) | from_entries
        )
    }')

    echo "$cache" > "$CACHE_FILE"
    local app_count=$(echo "$cache" | jq '.apps | length')
    echo "Cache updated with $app_count apps" >&2
}

load_apps_from_cache() {
    local cache_age=$(get_cache_age_days)

    if [ "$cache_age" -gt "$CACHE_MAX_AGE_DAYS" ]; then
        echo "Cache is $cache_age days old (max: $CACHE_MAX_AGE_DAYS), refreshing..." >&2
        update_app_cache
    fi

    # Load apps into associative arrays
    declare -gA APPS
    declare -gA DEFAULT_COMPONENTS

    while IFS='=' read -r key value; do
        APPS["$key"]="$value"
    done < <(jq -r '.apps | to_entries[] | "\(.key)=\(.value.id)"' "$CACHE_FILE")

    while IFS='=' read -r key value; do
        DEFAULT_COMPONENTS["$key"]="$value"
    done < <(jq -r '.apps | to_entries[] | "\(.key)=\(.value.defaultComponent // "")"' "$CACHE_FILE")
}

list_apps() {
    echo "=== DigitalOcean Apps ==="
    do_request "/apps" | jq -r '.apps[] | "\(.spec.name) (\(.id)) - \(.live_url // "no url")"'
}

get_logs() {
    local app_name="$1"
    local component="${2:-}"
    local lines="${3:-100}"

    load_apps_from_cache

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

    load_apps_from_cache

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

    load_apps_from_cache

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
        components: [.app.spec.services[]?.name, .app.spec.static_sites[]?.name, .app.spec.jobs[]?.name] | map(select(. != null))
    }'
}

show_cache_status() {
    if [ ! -f "$CACHE_FILE" ]; then
        echo "No cache file found"
        return
    fi

    local last_updated=$(jq -r '.lastUpdated' "$CACHE_FILE")
    local age=$(get_cache_age_days)
    local app_count=$(jq '.apps | length' "$CACHE_FILE")

    echo "=== Cache Status ==="
    echo "Last updated: $last_updated ($age days ago)"
    echo "Apps cached: $app_count"
    echo "Auto-refresh: after $CACHE_MAX_AGE_DAYS days"
    echo ""
    echo "Cached apps:"
    jq -r '.apps | to_entries[] | "  \(.key) -> \(.value.id)"' "$CACHE_FILE"
}

show_available_apps() {
    load_apps_from_cache
    echo "${!APPS[*]}"
}

# Main command router
case "$1" in
    list)
        list_apps
        ;;
    logs)
        if [ -z "$2" ]; then
            echo "Usage: $0 logs <app-name> [component] [lines]"
            echo "Apps: $(show_available_apps)"
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
    refresh)
        update_app_cache
        ;;
    cache-status)
        show_cache_status
        ;;
    *)
        load_apps_from_cache
        echo "DigitalOcean App Platform Logs"
        echo ""
        echo "Usage: $0 <command> [args...]"
        echo ""
        echo "Commands:"
        echo "  list                          List all apps (live from API)"
        echo "  logs <app> [component] [n]    Get runtime logs (default 100 lines)"
        echo "  deploy-logs <app> [component] Get build/deploy logs"
        echo "  info <app>                    Get app info and components"
        echo "  refresh                       Force refresh app cache"
        echo "  cache-status                  Show cache info"
        echo ""
        echo "Apps: ${!APPS[*]}"
        echo ""
        echo "(Cache auto-refreshes after $CACHE_MAX_AGE_DAYS days)"
        ;;
esac
