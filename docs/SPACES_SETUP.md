# DigitalOcean Spaces Setup Guide

## Overview
DigitalOcean Spaces is S3-compatible object storage for files, images, and documents.

## Create Spaces Bucket

### Via Web Console (Recommended)

1. Go to: https://cloud.digitalocean.com/spaces
2. Click **"Create a Space"**
3. Choose region: **Singapore (sgp1)**
4. Name: `easyescrow-storage`
5. Enable CDN: **Yes** (optional, adds $0.01/GB bandwidth)
6. File Listing: **Private** (recommended)
7. Click **Create**

### Via API (Alternative)

Spaces creation via `doctl` requires Spaces access keys. Create keys first:

1. Go to: https://cloud.digitalocean.com/account/api/spaces
2. Click **"Generate New Key"**
3. Name: `easyescrow-app`
4. Save the **Access Key** and **Secret Key**

Then create bucket using AWS CLI or s3cmd:

```bash
# Install AWS CLI
# Windows: choco install awscli
# Mac: brew install awscli

# Configure
aws configure
# AWS Access Key ID: YOUR_SPACES_KEY
# AWS Secret Access Key: YOUR_SPACES_SECRET
# Default region: sgp1
# Default output format: json

# Create bucket
aws s3 mb s3://easyescrow-storage --endpoint-url=https://sgp1.digitaloceanspaces.com --region=sgp1
```

---

## Generate Access Keys

After creating the Space:

1. Go to **Settings** → **API**
2. Scroll to **Spaces access keys**
3. Click **Generate New Key**
4. Name: `easyescrow-backend`
5. Save:
   - **Access Key ID** (starts with `DO00...`)
   - **Secret Key** (long random string)

---

## Environment Variables

Add these to your `.env` files:

```bash
# Spaces Configuration
SPACES_ENDPOINT=https://sgp1.digitaloceanspaces.com
SPACES_REGION=sgp1
SPACES_BUCKET=easyescrow-storage
SPACES_ACCESS_KEY_ID=DO00XXXXXXXXXXXXXXXXX
SPACES_SECRET_ACCESS_KEY=your_secret_key_here

# CDN URL (if enabled)
SPACES_CDN_URL=https://easyescrow-storage.sgp1.cdn.digitaloceanspaces.com

# Public URL (if public access enabled)
SPACES_PUBLIC_URL=https://easyescrow-storage.sgp1.digitaloceanspaces.com
```

---

## Usage in Code

### Install AWS SDK

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### Configure S3 Client

```typescript
// src/config/spaces.ts
import { S3Client } from '@aws-sdk/client-s3';

export const spacesClient = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT!,
  region: process.env.SPACES_REGION || 'sgp1',
  credentials: {
    accessKeyId: process.env.SPACES_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: false, // Use virtual-hosted-style URLs
});
```

### Upload File

```typescript
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { spacesClient } from './config/spaces';

async function uploadFile(file: Buffer, key: string) {
  const command = new PutObjectCommand({
    Bucket: process.env.SPACES_BUCKET!,
    Key: key,
    Body: file,
    ACL: 'private', // or 'public-read' for public files
    ContentType: 'image/jpeg', // Set appropriate content type
  });

  await spacesClient.send(command);
  
  return {
    url: `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/${key}`,
    cdnUrl: process.env.SPACES_CDN_URL 
      ? `${process.env.SPACES_CDN_URL}/${key}` 
      : null,
  };
}
```

### Generate Presigned URL (Temporary Access)

```typescript
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

async function getPresignedUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: process.env.SPACES_BUCKET!,
    Key: key,
  });

  return await getSignedUrl(spacesClient, command, { expiresIn });
}
```

### Delete File

```typescript
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

async function deleteFile(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: process.env.SPACES_BUCKET!,
    Key: key,
  });

  await spacesClient.send(command);
}
```

---

## File Organization

Recommended folder structure in Spaces:

```
easyescrow-storage/
├── escrow/
│   ├── documents/
│   │   ├── {escrowId}/
│   │   │   ├── contract.pdf
│   │   │   └── invoice.pdf
│   ├── attachments/
│   └── receipts/
├── users/
│   ├── avatars/
│   │   └── {userId}.jpg
│   └── verification/
│       └── {userId}/
│           ├── id-front.jpg
│           └── id-back.jpg
├── temp/
│   └── uploads/
└── backups/
```

---

## CORS Configuration

If accessing Spaces from frontend:

1. Go to Spaces → Settings
2. Enable **CORS**
3. Add rules:

```json
[
  {
    "AllowedOrigins": ["https://yourdomain.com", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

---

## Pricing

- **Storage**: $5/month for 250GB
- **Bandwidth**: $0.01/GB (free if not using CDN)
- **CDN**: $0.01/GB (optional, recommended for public files)

**Estimated Costs:**
- Low usage (< 10GB, < 100GB bandwidth): **$5/month**
- Medium (50GB, 500GB bandwidth): **$10/month**
- High (200GB, 2TB bandwidth): **$30/month**

---

## Backup Strategy

### Automatic Backups
- DigitalOcean doesn't provide automatic backups for Spaces
- Implement your own backup solution:

```bash
# Sync to another Space or S3 bucket
aws s3 sync s3://easyescrow-storage s3://easyescrow-backup \
  --endpoint-url=https://sgp1.digitaloceanspaces.com \
  --region=sgp1
```

### Lifecycle Policies
Not yet supported by DigitalOcean Spaces. Implement manual cleanup:

```typescript
// Clean up temp files older than 7 days
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

async function cleanupOldFiles(prefix: string, daysOld: number) {
  const list = await spacesClient.send(new ListObjectsV2Command({
    Bucket: process.env.SPACES_BUCKET!,
    Prefix: prefix,
  }));

  const oldDate = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  const filesToDelete = list.Contents?.filter(
    obj => obj.LastModified && obj.LastModified.getTime() < oldDate
  );

  if (filesToDelete && filesToDelete.length > 0) {
    await spacesClient.send(new DeleteObjectsCommand({
      Bucket: process.env.SPACES_BUCKET!,
      Delete: {
        Objects: filesToDelete.map(obj => ({ Key: obj.Key! })),
      },
    }));
  }
}
```

---

## Security Best Practices

1. **Never expose access keys in code**
   - Use environment variables
   - Rotate keys regularly

2. **Use private ACL by default**
   - Only make files public when necessary
   - Use presigned URLs for temporary access

3. **Implement file upload limits**
   ```typescript
   const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
   const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
   ```

4. **Scan uploaded files**
   - Use antivirus scanning
   - Validate file types
   - Check for malicious content

5. **Monitor usage**
   - Track storage and bandwidth
   - Set up alerts for unusual activity

---

## Testing

### Test Connection

```typescript
import { HeadBucketCommand } from '@aws-sdk/client-s3';

async function testConnection() {
  try {
    await spacesClient.send(new HeadBucketCommand({
      Bucket: process.env.SPACES_BUCKET!,
    }));
    console.log('✅ Connected to Spaces successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to Spaces:', error);
    return false;
  }
}
```

---

## Next Steps

1. ✅ Create Spaces bucket via web console
2. ✅ Generate access keys
3. ✅ Add credentials to environment variables
4. ✅ Install AWS SDK: `npm install @aws-sdk/client-s3`
5. ✅ Create Spaces client configuration
6. ✅ Test file upload
7. ✅ Implement file organization structure
8. ✅ Set up CORS if needed
9. ✅ Monitor usage and costs

## Support

- Spaces Documentation: https://docs.digitalocean.com/products/spaces/
- AWS SDK for JavaScript: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/

