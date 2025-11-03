/**
 * Verify S3 Backup - Download a backup file from S3 to verify upload
 */

import * as https from 'https';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production' });

const s3Bucket = process.env.AWS_S3_BUCKET!;
const s3AccessKey = process.env.AWS_S3_KEY!;
const s3SecretKey = process.env.AWS_S3_SECRET!;
const s3Region = process.env.AWS_S3_REGION || 'us-east-1';

// The S3 key from the backup output
const s3Key = 'database-backups/2025/11/03/easyescrow-staging-postgres-2025-11-03T01-17-44.dump';
const outputFile = 'temp/downloaded-backup.dump';

async function downloadFromS3() {
  console.log('\n🔍 Verifying S3 Backup Upload\n');
  console.log(`📥 Downloading: s3://${s3Bucket}/${s3Key}`);
  console.log(`📁 Saving to: ${outputFile}\n`);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substr(0, 8);

  const canonicalUri = `/${s3Key}`;
  const canonicalQuerystring = '';
  const payloadHash = crypto.createHash('sha256').update('').digest('hex');
  const canonicalHeaders = 
    `host:${s3Bucket}.s3.${s3Region}.amazonaws.com\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = 
    `GET\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${s3Region}/s3/aws4_request`;
  const stringToSign = 
    `${algorithm}\n${amzDate}\n${credentialScope}\n` +
    crypto.createHash('sha256').update(canonicalRequest).digest('hex');

  const getSignatureKey = (key: string, dateStamp: string, regionName: string, serviceName: string) => {
    const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return kSigning;
  };

  const signingKey = getSignatureKey(s3SecretKey, dateStamp, s3Region, 's3');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader = 
    `${algorithm} Credential=${s3AccessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: `${s3Bucket}.s3.${s3Region}.amazonaws.com`,
      port: 443,
      path: canonicalUri,
      method: 'GET',
      headers: {
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Authorization': authorizationHeader,
      },
    };

    const file = fs.createWriteStream(outputFile);
    const req = https.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        res.pipe(file);
        
        file.on('finish', () => {
          file.close();
          const stats = fs.statSync(outputFile);
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          
          console.log('✅ Download successful!');
          console.log(`📦 File size: ${sizeMB}MB`);
          console.log(`📁 Location: ${outputFile}\n`);
          console.log('🎉 S3 upload verified - backup is accessible!\n');
          resolve(true);
        });
      } else {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          reject(new Error(`Download failed: ${res.statusCode} ${data}`));
        });
      }
    });

    req.on('error', reject);
    req.end();
  });
}

downloadFromS3().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});

