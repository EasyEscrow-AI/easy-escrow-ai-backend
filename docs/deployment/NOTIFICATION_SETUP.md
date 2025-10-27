# Deployment Notification Setup Guide

## Overview

This guide walks you through setting up deployment notifications for the STAGING CI/CD pipeline. Notifications keep the team informed about build status, deployment progress, and any issues that occur.

## Supported Platforms

- **Slack** (Recommended)
- **Discord**
- **Microsoft Teams** (via webhook)
- **Email** (via GitHub Actions)

## Table of Contents

- [Slack Integration](#slack-integration)
- [Discord Integration](#discord-integration)
- [Microsoft Teams Integration](#microsoft-teams-integration)
- [Email Notifications](#email-notifications)
- [Testing Notifications](#testing-notifications)
- [Customizing Notifications](#customizing-notifications)
- [Troubleshooting](#troubleshooting)

## Slack Integration

### Step 1: Create Slack App

1. Go to [Slack API Apps](https://api.slack.com/apps)

2. Click **Create New App**

3. Choose **From scratch**

4. Enter app details:
   - **App Name**: `EasyEscrow Deployments`
   - **Workspace**: Select your workspace

5. Click **Create App**

### Step 2: Enable Incoming Webhooks

1. In your app's settings, go to **Incoming Webhooks**

2. Toggle **Activate Incoming Webhooks** to **On**

3. Scroll down and click **Add New Webhook to Workspace**

4. Select the channel where notifications should be posted:
   - Recommended: `#deployments` or `#staging-deployments`
   - You can change this later

5. Click **Allow**

6. Copy the **Webhook URL**:
   ```
   https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX
   ```

### Step 3: Add Webhook to GitHub Secrets

1. Go to your GitHub repository

2. Navigate to **Settings** → **Secrets and variables** → **Actions**

3. Click **New repository secret**

4. Add the secret:
   - **Name**: `SLACK_WEBHOOK`
   - **Secret**: Paste the webhook URL from Step 2
   - Click **Add secret**

### Step 4: Customize Slack Notifications (Optional)

Edit the notification steps in workflow files to customize the message:

```yaml
- name: Notify deployment success
  if: success()
  uses: 8398a7/action-slack@v3
  with:
    status: custom
    custom_payload: |
      {
        text: ':rocket: STAGING Deployment Successful',
        attachments: [{
          color: 'good',
          fields: [
            {
              title: 'Branch',
              value: '${{ github.ref_name }}',
              short: true
            },
            {
              title: 'Commit',
              value: '${{ github.sha }}',
              short: true
            },
            {
              title: 'Deployed By',
              value: '${{ github.actor }}',
              short: true
            },
            {
              title: 'Environment',
              value: 'STAGING (devnet)',
              short: true
            },
            {
              title: 'URL',
              value: '<${{ secrets.STAGING_API_URL }}|View App>',
              short: false
            }
          ],
          footer: 'EasyEscrow Deployments',
          footer_icon: 'https://github.com/favicon.ico',
          ts: '${{ github.event.head_commit.timestamp }}'
        }]
      }
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### Step 5: Test Slack Integration

1. Trigger a test deployment:
   ```bash
   git checkout staging
   git commit --allow-empty -m "test: slack notification"
   git push origin staging
   ```

2. Check your Slack channel for notifications

3. You should see messages for:
   - ✅ Build completion
   - ✅ Deployment start (waiting for approval)
   - ✅ Deployment success/failure
   - ✅ Smoke test results

## Discord Integration

### Step 1: Create Discord Webhook

1. Open Discord and go to your server

2. Go to **Server Settings** → **Integrations**

3. Click **Webhooks** → **New Webhook**

4. Configure the webhook:
   - **Name**: `EasyEscrow Deployments`
   - **Channel**: Select target channel (e.g., `#deployments`)
   - **Avatar**: Upload EasyEscrow logo (optional)

5. Click **Copy Webhook URL**:
   ```
   https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz
   ```

### Step 2: Add Webhook to GitHub Secrets

1. Go to GitHub repository **Settings** → **Secrets and variables** → **Actions**

2. Click **New repository secret**

3. Add the secret:
   - **Name**: `DISCORD_WEBHOOK`
   - **Secret**: Paste the Discord webhook URL
   - Click **Add secret**

### Step 3: Update Workflow Files

Replace Slack notification steps with Discord notifications:

```yaml
- name: Notify deployment success
  if: success()
  run: |
    curl -X POST "${{ secrets.DISCORD_WEBHOOK }}" \
      -H "Content-Type: application/json" \
      -d '{
        "embeds": [{
          "title": "🚀 STAGING Deployment Successful",
          "color": 3066993,
          "fields": [
            {
              "name": "Branch",
              "value": "${{ github.ref_name }}",
              "inline": true
            },
            {
              "name": "Commit",
              "value": "`${{ github.sha }}`",
              "inline": true
            },
            {
              "name": "Deployed By",
              "value": "${{ github.actor }}",
              "inline": true
            },
            {
              "name": "Environment",
              "value": "STAGING (devnet)",
              "inline": true
            },
            {
              "name": "URL",
              "value": "${{ secrets.STAGING_API_URL }}"
            }
          ],
          "timestamp": "${{ github.event.head_commit.timestamp }}"
        }]
      }'
```

### Step 4: Test Discord Integration

1. Trigger a test deployment

2. Check your Discord channel for notifications

3. Verify all notification types appear correctly

## Microsoft Teams Integration

### Step 1: Create Teams Incoming Webhook

1. Open Microsoft Teams

2. Navigate to the channel where you want notifications

3. Click **...** (More options) → **Connectors**

4. Search for **Incoming Webhook** and click **Configure**

5. Enter details:
   - **Name**: `EasyEscrow Deployments`
   - **Upload Image**: EasyEscrow logo (optional)

6. Click **Create**

7. Copy the webhook URL

### Step 2: Add Webhook to GitHub Secrets

1. Add to GitHub repository secrets:
   - **Name**: `TEAMS_WEBHOOK`
   - **Secret**: Teams webhook URL

### Step 3: Update Workflow Files

Replace notification steps with Teams format:

```yaml
- name: Notify deployment success
  if: success()
  run: |
    curl -X POST "${{ secrets.TEAMS_WEBHOOK }}" \
      -H "Content-Type: application/json" \
      -d '{
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": "STAGING Deployment Successful",
        "themeColor": "00FF00",
        "title": "🚀 STAGING Deployment Successful",
        "sections": [{
          "facts": [
            {
              "name": "Branch:",
              "value": "${{ github.ref_name }}"
            },
            {
              "name": "Commit:",
              "value": "${{ github.sha }}"
            },
            {
              "name": "Deployed By:",
              "value": "${{ github.actor }}"
            },
            {
              "name": "Environment:",
              "value": "STAGING (devnet)"
            }
          ]
        }],
        "potentialAction": [{
          "@type": "OpenUri",
          "name": "View App",
          "targets": [{
            "os": "default",
            "uri": "${{ secrets.STAGING_API_URL }}"
          }]
        }]
      }'
```

## Email Notifications

GitHub Actions automatically sends email notifications to:

- **Workflow author** (person who triggered the workflow)
- **Repository watchers** (if configured)

### Configure Email Preferences

1. Go to [GitHub Notification Settings](https://github.com/settings/notifications)

2. Under **Actions**, configure:
   - ✅ **Only notify for failed workflows**
   - ⬜ **Notify for all workflow runs**

3. Choose notification method:
   - ✅ **Email**
   - ✅ **Web** (GitHub notifications)

### Advanced: Custom Email Notifications

For custom email notifications, use a third-party action:

```yaml
- name: Send email notification
  if: failure()
  uses: dawidd6/action-send-mail@v3
  with:
    server_address: smtp.gmail.com
    server_port: 465
    username: ${{ secrets.EMAIL_USERNAME }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: '[STAGING] Deployment Failed - ${{ github.ref_name }}'
    to: devops@easyescrow.ai
    from: GitHub Actions <noreply@github.com>
    body: |
      Deployment to STAGING failed.
      
      Branch: ${{ github.ref_name }}
      Commit: ${{ github.sha }}
      Triggered by: ${{ github.actor }}
      
      View logs: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
```

## Testing Notifications

### Test Checklist

Test all notification scenarios:

- [ ] **Build Success**: Push to staging branch
- [ ] **Build Failure**: Push broken code to staging branch
- [ ] **Deployment Pending**: Verify approval request notification
- [ ] **Deployment Success**: Approve and complete deployment
- [ ] **Deployment Failure**: Test with invalid secrets/config
- [ ] **Smoke Test Failure**: Temporarily break an endpoint
- [ ] **Rollback Success**: Trigger a rollback workflow
- [ ] **Rollback Failure**: Trigger rollback with invalid deployment ID

### Manual Testing Commands

#### Test Slack Webhook

```bash
curl -X POST $SLACK_WEBHOOK \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Test notification from EasyEscrow Deployments",
    "attachments": [{
      "color": "good",
      "text": "This is a test message. If you see this, Slack integration is working!"
    }]
  }'
```

#### Test Discord Webhook

```bash
curl -X POST $DISCORD_WEBHOOK \
  -H 'Content-Type: application/json' \
  -d '{
    "embeds": [{
      "title": "Test Notification",
      "description": "This is a test message from EasyEscrow Deployments",
      "color": 3066993
    }]
  }'
```

#### Test Teams Webhook

```bash
curl -X POST $TEAMS_WEBHOOK \
  -H 'Content-Type: application/json' \
  -d '{
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    "summary": "Test Notification",
    "title": "Test Message",
    "text": "This is a test from EasyEscrow Deployments"
  }'
```

## Customizing Notifications

### Notification Content

Customize what information is included in notifications:

**Basic Information** (Always include):
- Deployment status (success/failure)
- Environment (STAGING, production, etc.)
- Branch/commit that triggered deployment
- User who triggered deployment

**Optional Information**:
- Smoke test results summary
- Build duration
- Deployment duration
- Link to logs
- Link to deployed app
- Changelog/commit messages
- Migration status

### Notification Timing

Control when notifications are sent:

```yaml
# Only on failure
- name: Notify failure
  if: failure()
  # notification step

# Only on success
- name: Notify success
  if: success()
  # notification step

# Always (success or failure)
- name: Notify always
  if: always()
  # notification step

# Only on specific conditions
- name: Notify on main branch
  if: github.ref == 'refs/heads/main'
  # notification step
```

### Rich Formatting

#### Slack Rich Format

```yaml
custom_payload: |
  {
    "blocks": [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": "🚀 Deployment Complete"
        }
      },
      {
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "text": "*Environment:*\nSTAGING"
          },
          {
            "type": "mrkdwn",
            "text": "*Status:*\n✅ Success"
          }
        ]
      },
      {
        "type": "actions",
        "elements": [
          {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": "View App"
            },
            "url": "${{ secrets.STAGING_API_URL }}"
          },
          {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": "View Logs"
            },
            "url": "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
          }
        ]
      }
    ]
  }
```

#### Discord Rich Embed

```json
{
  "embeds": [{
    "title": "🚀 Deployment Complete",
    "description": "STAGING deployment completed successfully",
    "color": 3066993,
    "fields": [
      {
        "name": "Environment",
        "value": "STAGING",
        "inline": true
      },
      {
        "name": "Status",
        "value": "✅ Success",
        "inline": true
      },
      {
        "name": "Duration",
        "value": "5m 23s",
        "inline": true
      }
    ],
    "footer": {
      "text": "EasyEscrow Deployments"
    },
    "timestamp": "2025-10-26T12:00:00.000Z"
  }]
}
```

## Notification Best Practices

### Do's ✅

1. **Include actionable information**
   - Links to logs for failures
   - Links to deployed app
   - Next steps or resolution suggestions

2. **Use appropriate channels**
   - Critical alerts: High-priority channel + email
   - Routine deployments: General deployments channel
   - Test deployments: Separate test channel

3. **Maintain signal-to-noise ratio**
   - Only notify on important events
   - Combine related notifications
   - Use threading for updates

4. **Format for readability**
   - Use emojis for quick visual identification
   - Color-code by severity (green=success, red=failure)
   - Include timestamps

5. **Test thoroughly**
   - Verify all notification types work
   - Check formatting on mobile devices
   - Ensure links are accessible

### Don'ts ❌

1. **Don't spam channels**
   - Avoid duplicate notifications
   - Don't notify on every build (only deployments)
   - Consider using notification aggregation

2. **Don't include sensitive data**
   - No secrets or API keys
   - No full database credentials
   - Mask sensitive URLs if needed

3. **Don't use vague messages**
   - Bad: "Deployment failed"
   - Good: "STAGING deployment failed: Smoke tests returned 500 errors"

4. **Don't ignore failures**
   - Always send failure notifications
   - Include troubleshooting links
   - Tag relevant team members

## Troubleshooting

### Notifications Not Sent

**Symptom**: No notifications appear in Slack/Discord

**Possible Causes:**
1. Invalid webhook URL
2. Webhook expired or revoked
3. Channel deleted or moved
4. Network connectivity issues
5. Webhook rate limit reached

**Resolution:**
```bash
# Test webhook manually
curl -X POST $WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test message"}'

# Check response:
# - 200 OK = Working
# - 404 = Invalid URL
# - 401 = Unauthorized (expired)
# - 429 = Rate limited
```

### Malformed Notifications

**Symptom**: Notifications appear but formatting is broken

**Possible Causes:**
1. Invalid JSON in payload
2. Unsupported formatting syntax
3. Special characters not escaped
4. Missing required fields

**Resolution:**
1. Validate JSON payload with online validator
2. Check platform-specific formatting docs
3. Escape special characters properly
4. Test with minimal payload first

### Delayed Notifications

**Symptom**: Notifications arrive late

**Possible Causes:**
1. Webhook provider rate limiting
2. Network congestion
3. GitHub Actions queue delays
4. Webhook endpoint slow to respond

**Resolution:**
1. Use faster webhook endpoint
2. Check webhook provider status
3. Consider batch notifications for multiple events
4. Monitor GitHub Actions queue times

### Duplicate Notifications

**Symptom**: Same notification sent multiple times

**Possible Causes:**
1. Workflow re-runs
2. Multiple notification steps in workflow
3. Both job-level and step-level notifications

**Resolution:**
1. Use `continue-on-error: true` for notifications
2. Consolidate notification steps
3. Add unique identifiers to track duplicates

## Monitoring and Maintenance

### Regular Checks

Schedule monthly reviews:

- [ ] Verify webhooks are still valid
- [ ] Test all notification types
- [ ] Review notification channels (still appropriate?)
- [ ] Update notification content if needed
- [ ] Check for new features in notification platforms

### Webhook Rotation

Rotate webhooks quarterly for security:

1. Create new webhook in Slack/Discord
2. Update GitHub secret with new URL
3. Test new webhook
4. Revoke old webhook
5. Document rotation in audit log

### Notification Analytics

Track notification effectiveness:

- Response time to deployment failures
- Average time from notification to resolution
- Number of false positives
- Team feedback on notification usefulness

## Additional Resources

- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)
- [Discord Webhooks](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks)
- [Microsoft Teams Webhooks](https://docs.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook)
- [GitHub Actions Notification](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/notifications-for-workflow-runs)

## Checklist

- [ ] Created webhook in notification platform (Slack/Discord/Teams)
- [ ] Added webhook URL to GitHub secrets as `SLACK_WEBHOOK` or equivalent
- [ ] Updated workflow files with notification steps
- [ ] Tested notification for build success
- [ ] Tested notification for build failure
- [ ] Tested notification for deployment success
- [ ] Tested notification for deployment failure
- [ ] Tested notification for rollback
- [ ] Customized notification format (optional)
- [ ] Documented webhook rotation schedule
- [ ] Added notification channel to team documentation
- [ ] Configured appropriate notification thresholds

---

**Last Updated**: 2025-10-26  
**Version**: 1.0.0  
**Maintained by**: DevOps Team

