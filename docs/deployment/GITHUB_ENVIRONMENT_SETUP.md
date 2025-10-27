# GitHub Environment Protection Rules Setup Guide

## Overview

This guide walks you through configuring GitHub environment protection rules for the STAGING environment. These rules enforce manual approval before deployments can proceed, providing an additional safety layer for the CI/CD pipeline.

## Prerequisites

- **Repository admin access** to configure environments and protection rules
- **GitHub Actions enabled** in the repository
- CI/CD workflows already committed to repository

## Table of Contents

- [Step 1: Create Staging Environment](#step-1-create-staging-environment)
- [Step 2: Configure Protection Rules](#step-2-configure-protection-rules)
- [Step 3: Add Required Reviewers](#step-3-add-required-reviewers)
- [Step 4: Configure Environment Secrets](#step-4-configure-environment-secrets)
- [Step 5: Test Protection Rules](#step-5-test-protection-rules)
- [Troubleshooting](#troubleshooting)

## Step 1: Create Staging Environment

1. Navigate to your GitHub repository

2. Go to **Settings** tab (top navigation)

3. In the left sidebar, click **Environments**

4. Click **New environment** button

5. Enter environment name: `staging`

6. Click **Configure environment**

You'll now see the environment configuration page where you can set protection rules.

## Step 2: Configure Protection Rules

On the `staging` environment configuration page:

### Required Reviewers

1. Check **Required reviewers** checkbox

2. Click in the **Reviewers** field and search for team members

3. Select reviewers who should approve deployments:
   - ✅ Add at least 2 senior developers
   - ✅ Add DevOps team members
   - ✅ Add technical leads

4. **Best Practice**: Require at least 1-2 reviewers

### Wait Timer (Optional)

1. Check **Wait timer** checkbox if you want a delay

2. Enter delay in minutes (e.g., `5` for 5-minute delay)

3. **Use case**: Allows time for stakeholders to be notified before auto-deployment

4. **Recommendation**: Start without wait timer, add later if needed

### Deployment Branches (Optional)

1. Under **Deployment branches**, select one of:
   - **All branches**: Any branch can deploy (more flexible)
   - **Protected branches only**: Only protected branches can deploy
   - **Selected branches**: Specific branches can deploy

2. **Recommendation for STAGING**: Use **Selected branches**
   - Add `staging` branch
   - Add `main` or `master` (for hotfixes)

### Environment Variables (Optional)

You can restrict which branches can access environment variables:

- Leave as default (all branches) for STAGING
- This can be tightened for production environments

## Step 3: Add Required Reviewers

### Selecting Reviewers

When choosing reviewers, consider:

1. **Technical Knowledge**
   - ✅ Familiar with the codebase
   - ✅ Understand deployment implications
   - ✅ Can identify breaking changes

2. **Availability**
   - ✅ Available during deployment windows
   - ✅ Responsive to approval requests
   - ✅ In appropriate timezone

3. **Authority**
   - ✅ Authorized to approve deployments
   - ✅ Understand business impact
   - ✅ Can make risk decisions

### Example Reviewer Configuration

**Small Team (2-5 people):**
- Require: 1 reviewer
- Add: All senior developers and DevOps

**Medium Team (6-20 people):**
- Require: 2 reviewers
- Add: Technical leads, senior developers, DevOps team

**Large Team (20+ people):**
- Require: 2 reviewers
- Add: Specific approval group or team
- Use GitHub teams for easier management

### Setting Up Review Teams

For better organization, create GitHub teams:

1. Go to your **Organization** settings (not repository)

2. Click **Teams** in sidebar

3. Create teams like:
   - `staging-approvers`
   - `devops-team`
   - `tech-leads`

4. Add members to teams

5. Use team names as reviewers in environment configuration

## Step 4: Configure Environment Secrets

Environment-specific secrets can be configured to override repository secrets:

1. On the `staging` environment page, scroll to **Environment secrets**

2. Click **Add secret**

3. Add the following secrets (if not using repository-level secrets):

| Secret Name | Description | Required |
|------------|-------------|----------|
| `STAGING_DEPLOYER_KEYPAIR` | Solana deployer keypair JSON | ✅ Yes |
| `STAGING_RPC_URL` | Solana RPC endpoint | ✅ Yes |
| `STAGING_PROGRAM_ID` | Program public key | ✅ Yes |
| `STAGING_APP_ID` | DigitalOcean App Platform ID | ✅ Yes |
| `STAGING_API_URL` | Backend API URL | ✅ Yes |
| `DIGITALOCEAN_ACCESS_TOKEN` | DO API token | ✅ Yes |
| `SLACK_WEBHOOK` | Slack notification webhook | ⬜ Optional |

### Secret Management Best Practices

- ✅ Use environment secrets for environment-specific values
- ✅ Use repository secrets for values shared across environments
- ✅ Rotate secrets regularly (quarterly minimum)
- ✅ Use meaningful secret names
- ✅ Document secret purpose and format
- ❌ Never commit secrets to version control
- ❌ Never share secrets via chat/email

## Step 5: Test Protection Rules

After configuration, test that protection rules work correctly:

### Test 1: Trigger a Deployment

1. Push a change to the `staging` branch:
   ```bash
   git checkout staging
   git commit --allow-empty -m "test: trigger deployment"
   git push origin staging
   ```

2. Navigate to **Actions** tab

3. Watch for:
   - ✅ Build workflow completes successfully
   - ✅ Deploy workflow starts automatically
   - ✅ Workflow pauses at "Review deployments" step
   - ✅ Notification sent to required reviewers

### Test 2: Approve Deployment

1. Click on the pending workflow run

2. You should see **Waiting for review** status

3. Click **Review deployments** button

4. Add a comment (e.g., "Approving test deployment")

5. Click **Approve and deploy**

6. Verify:
   - ✅ Workflow continues execution
   - ✅ Deployment completes successfully
   - ✅ Smoke tests run and pass
   - ✅ Notification sent on completion

### Test 3: Reject Deployment

1. Trigger another deployment (push to staging branch)

2. When approval is requested, click **Review deployments**

3. Select **Reject**

4. Add reason for rejection

5. Click **Reject**

6. Verify:
   - ✅ Workflow is cancelled
   - ✅ Deployment does not proceed
   - ✅ Notification sent about rejection

### Test 4: Rollback Protection

1. Go to **Actions** → **Rollback STAGING**

2. Click **Run workflow**

3. Enter a valid deployment ID and reason

4. Verify:
   - ✅ Approval required before rollback proceeds
   - ✅ Same reviewers can approve
   - ✅ Notification sent on completion

## Advanced Configuration

### Multiple Environments

For projects with multiple environments (dev, staging, prod):

1. Create separate environments for each:
   - `dev` - no protection (auto-deploy)
   - `staging` - require 1-2 reviewers
   - `production` - require 2+ reviewers + wait timer

2. Configure different reviewer groups:
   - Staging: developers + DevOps
   - Production: tech leads + senior management

3. Use environment-specific secrets for each

### Scheduled Deployments

To allow deployments only during specific hours:

1. Use GitHub Actions scheduling in workflow:
   ```yaml
   on:
     schedule:
       - cron: '0 9-17 * * 1-5'  # Mon-Fri, 9am-5pm UTC
   ```

2. Combine with environment protection for safety

### Emergency Bypasses

For critical hotfixes that need rapid deployment:

**Option 1: Bypass Approvals (NOT RECOMMENDED)**
- Temporarily remove protection rules
- Deploy hotfix
- Re-enable protection rules
- ⚠️ High risk, should be documented

**Option 2: Fast-Track Approval Process**
- Keep protection rules enabled
- Have on-call reviewer ready
- Use workflow_dispatch for manual trigger
- Document emergency in approval comment
- ✅ Recommended approach

## Troubleshooting

### Issue: Workflow Not Waiting for Approval

**Symptom**: Deployment proceeds without approval request

**Causes:**
1. Environment name mismatch (check workflow uses `environment: staging`)
2. Protection rules not saved properly
3. User triggering deployment is also a required reviewer (auto-approved)

**Resolution:**
1. Verify environment name in workflow matches GitHub environment name exactly
2. Check protection rules are enabled and saved
3. Add multiple reviewers to prevent self-approval

### Issue: Unable to Approve Deployment

**Symptom**: User cannot approve deployment when requested

**Causes:**
1. User not in required reviewers list
2. Insufficient repository permissions
3. Already approved by user (if multiple approvals required)

**Resolution:**
1. Add user to required reviewers in environment settings
2. Grant user at least **Write** access to repository
3. Check if additional approvals are needed

### Issue: Deployment Times Out Waiting for Approval

**Symptom**: Workflow cancelled after waiting too long

**Causes:**
1. No reviewers available to approve
2. Approval request notification missed
3. GitHub Actions timeout reached (default: 72 hours)

**Resolution:**
1. Ensure at least one reviewer is always available
2. Set up proper notification channels (email, Slack)
3. Consider reducing timeout with workflow timeout setting:
   ```yaml
   jobs:
     deploy:
       timeout-minutes: 60  # 1 hour
   ```

### Issue: Secrets Not Available in Workflow

**Symptom**: Workflow fails with missing environment variables

**Causes:**
1. Secrets not configured in environment
2. Environment name mismatch
3. Secret names don't match workflow expectations

**Resolution:**
1. Verify all required secrets are added to `staging` environment
2. Check environment name in workflow matches exactly
3. Verify secret names match those referenced in workflow YAML

## Security Best Practices

### Reviewer Security

- ✅ **Rotate reviewers** periodically
- ✅ **Remove access** when team members leave
- ✅ **Audit reviewer activity** regularly
- ✅ **Use 2FA** for all reviewers
- ❌ Don't use personal accounts for automation
- ❌ Don't share reviewer credentials

### Secret Security

- ✅ **Rotate secrets** quarterly or when compromised
- ✅ **Use least-privilege** secrets (only needed permissions)
- ✅ **Monitor secret usage** in GitHub audit logs
- ✅ **Separate secrets** per environment
- ❌ Never hardcode secrets in workflows
- ❌ Never log secret values

### Access Control

- ✅ **Limit admin access** to repository settings
- ✅ **Use branch protection** on staging branch
- ✅ **Require status checks** before merge
- ✅ **Enable audit logging** for all changes
- ❌ Don't allow force pushes to protected branches
- ❌ Don't disable branch protection for convenience

## Maintenance

### Regular Reviews

Schedule quarterly reviews of:

1. **Reviewer list**: Are all members still appropriate?
2. **Protection rules**: Are they still effective?
3. **Secrets**: Do they need rotation?
4. **Workflows**: Are they up to date?

### Audit Trail

GitHub maintains audit logs for:

- Environment configuration changes
- Deployment approvals/rejections
- Secret access
- Workflow runs

Access audit logs:
1. Go to **Settings** → **Security** → **Audit log**
2. Filter by environment or workflow
3. Export for compliance/reporting

## Additional Resources

- [GitHub Environments Documentation](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [GitHub Teams Documentation](https://docs.github.com/en/organizations/organizing-members-into-teams/about-teams)

## Checklist

Use this checklist to verify environment setup:

- [ ] Created `staging` environment in GitHub
- [ ] Configured required reviewers (minimum 1-2)
- [ ] Added appropriate team members as reviewers
- [ ] Configured deployment branch restrictions (optional)
- [ ] Added all required secrets to environment
- [ ] Tested approval workflow with test deployment
- [ ] Tested rejection workflow
- [ ] Verified rollback protection works
- [ ] Documented reviewer roles and responsibilities
- [ ] Set up rotation schedule for secret rotation
- [ ] Configured notification channels for approvals
- [ ] Documented emergency deployment procedures

---

**Last Updated**: 2025-10-26  
**Version**: 1.0.0  
**Maintained by**: DevOps Team

