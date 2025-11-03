/**
 * Test S3 Permissions
 * 
 * Verifies that S3 backup credentials have write-only access (best practice)
 * Tests: PUT (should work), GET/DELETE/LIST (should fail)
 * 
 * Usage:
 *   ts-node scripts/utilities/test-s3-permissions.ts
 */

import * as https from 'https';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production' });

class S3PermissionTester {
  private s3Bucket: string;
  private s3AccessKey: string;
  private s3SecretKey: string;
  private s3Region: string;
  private testKey = 'security-tests/permission-test.txt';
  private testContent = 'S3 permission test file';

  constructor() {
    this.s3Bucket = process.env.AWS_S3_BUCKET || '';
    this.s3AccessKey = process.env.AWS_S3_KEY || '';
    this.s3SecretKey = process.env.AWS_S3_SECRET || '';
    this.s3Region = process.env.AWS_S3_REGION || 'us-east-1';

    if (!this.s3Bucket || !this.s3AccessKey || !this.s3SecretKey) {
      throw new Error('Missing AWS S3 credentials in .env.production');
    }
  }

  /**
   * Generate AWS Signature V4
   */
  private generateSignature(
    method: string,
    uri: string,
    querystring: string,
    headers: Record<string, string>,
    payload: string
  ): { authorization: string; amzDate: string; contentSha256: string } {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substr(0, 8);

    const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

    // Create canonical headers
    const sortedHeaders = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaders
      .map(key => `${key.toLowerCase()}:${headers[key]}\n`)
      .join('');
    const signedHeaders = sortedHeaders.map(key => key.toLowerCase()).join(';');

    // Create canonical request
    const canonicalRequest = 
      `${method}\n${uri}\n${querystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${this.s3Region}/s3/aws4_request`;
    const stringToSign = 
      `${algorithm}\n${amzDate}\n${credentialScope}\n` +
      crypto.createHash('sha256').update(canonicalRequest).digest('hex');

    // Calculate signature
    const getSignatureKey = (key: string, dateStamp: string, regionName: string, serviceName: string) => {
      const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
      const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
      const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
      const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
      return kSigning;
    };

    const signingKey = getSignatureKey(this.s3SecretKey, dateStamp, this.s3Region, 's3');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    // Create authorization header
    const authorization = 
      `${algorithm} Credential=${this.s3AccessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return { authorization, amzDate, contentSha256: payloadHash };
  }

  /**
   * Make S3 request
   */
  private async makeRequest(
    method: string,
    key: string,
    payload: string = ''
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const uri = `/${key}`;
      const host = `${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com`;

      // First, compute the signature with placeholder values for headers
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
      const contentSha256 = crypto.createHash('sha256').update(payload).digest('hex');

      const headers: Record<string, string> = {
        'host': host,
        'x-amz-content-sha256': contentSha256,
        'x-amz-date': amzDate,
      };

      const { authorization } = this.generateSignature(
        method,
        uri,
        '',
        headers,
        payload
      );

      const requestHeaders: Record<string, string | number> = {
        'host': host,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': contentSha256,
        'Authorization': authorization,
      };

      if (method === 'PUT') {
        requestHeaders['Content-Type'] = 'text/plain';
        requestHeaders['Content-Length'] = Buffer.byteLength(payload);
      }

      const options: https.RequestOptions = {
        hostname: host,
        port: 443,
        path: uri,
        method,
        headers: requestHeaders,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body: data,
          });
        });
      });

      req.on('error', reject);
      
      if (method === 'PUT') {
        req.write(payload);
      }
      
      req.end();
    });
  }

  /**
   * Test PUT (upload) - should succeed
   */
  async testPut(): Promise<boolean> {
    console.log('1️⃣  Testing PUT (upload) permission...');
    console.log(`   Uploading: s3://${this.s3Bucket}/${this.testKey}`);
    
    try {
      const result = await this.makeRequest('PUT', this.testKey, this.testContent);
      
      if (result.statusCode >= 200 && result.statusCode < 300) {
        console.log('   ✅ PUT succeeded (status: ' + result.statusCode + ')');
        console.log('   👍 Credentials CAN upload files\n');
        return true;
      } else {
        console.log('   ❌ PUT failed (status: ' + result.statusCode + ')');
        console.log('   Response:', result.body.substring(0, 200));
        console.log('   ⚠️  Credentials CANNOT upload files\n');
        return false;
      }
    } catch (error) {
      console.log('   ❌ PUT error:', error);
      console.log('   ⚠️  Credentials CANNOT upload files\n');
      return false;
    }
  }

  /**
   * Test GET (download) - should fail with 403
   */
  async testGet(): Promise<boolean> {
    console.log('2️⃣  Testing GET (download) permission...');
    console.log(`   Downloading: s3://${this.s3Bucket}/${this.testKey}`);
    
    try {
      const result = await this.makeRequest('GET', this.testKey);
      
      if (result.statusCode === 403) {
        console.log('   ✅ GET denied with 403 Forbidden');
        console.log('   🔒 Credentials CANNOT download files (GOOD!)\n');
        return true;
      } else if (result.statusCode >= 200 && result.statusCode < 300) {
        console.log('   ❌ GET succeeded (status: ' + result.statusCode + ')');
        console.log('   ⚠️  SECURITY ISSUE: Credentials CAN download files\n');
        return false;
      } else {
        console.log('   ⚠️  Unexpected status:', result.statusCode);
        console.log('   Response:', result.body.substring(0, 200), '\n');
        return false;
      }
    } catch (error) {
      console.log('   ❌ GET error:', error, '\n');
      return false;
    }
  }

  /**
   * Test DELETE - should fail with 403
   */
  async testDelete(): Promise<boolean> {
    console.log('3️⃣  Testing DELETE permission...');
    console.log(`   Deleting: s3://${this.s3Bucket}/${this.testKey}`);
    
    try {
      const result = await this.makeRequest('DELETE', this.testKey);
      
      if (result.statusCode === 403) {
        console.log('   ✅ DELETE denied with 403 Forbidden');
        console.log('   🔒 Credentials CANNOT delete files (GOOD!)\n');
        return true;
      } else if (result.statusCode >= 200 && result.statusCode < 300) {
        console.log('   ❌ DELETE succeeded (status: ' + result.statusCode + ')');
        console.log('   ⚠️  SECURITY ISSUE: Credentials CAN delete files\n');
        return false;
      } else {
        console.log('   ⚠️  Unexpected status:', result.statusCode);
        console.log('   Response:', result.body.substring(0, 200), '\n');
        return false;
      }
    } catch (error) {
      console.log('   ❌ DELETE error:', error, '\n');
      return false;
    }
  }

  /**
   * Test LIST - should fail with 403
   */
  async testList(): Promise<boolean> {
    console.log('4️⃣  Testing LIST (bucket listing) permission...');
    console.log(`   Listing: s3://${this.s3Bucket}/`);
    
    try {
      const result = await this.makeRequest('GET', '');  // Empty key = list bucket
      
      if (result.statusCode === 403) {
        console.log('   ✅ LIST denied with 403 Forbidden');
        console.log('   🔒 Credentials CANNOT list files (GOOD!)\n');
        return true;
      } else if (result.statusCode >= 200 && result.statusCode < 300) {
        console.log('   ❌ LIST succeeded (status: ' + result.statusCode + ')');
        console.log('   ⚠️  SECURITY ISSUE: Credentials CAN list files\n');
        return false;
      } else {
        console.log('   ⚠️  Unexpected status:', result.statusCode);
        console.log('   Response:', result.body.substring(0, 200), '\n');
        return false;
      }
    } catch (error) {
      console.log('   ❌ LIST error:', error, '\n');
      return false;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║       S3 Backup Credentials Security Test                 ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('🔐 Testing IAM permissions for write-only access\n');
    console.log('Expected results:');
    console.log('  ✅ PUT (upload) should SUCCEED');
    console.log('  ✅ GET (download) should FAIL with 403');
    console.log('  ✅ DELETE should FAIL with 403');
    console.log('  ✅ LIST should FAIL with 403\n');
    console.log('─────────────────────────────────────────────────────────────\n');

    const results = {
      put: false,
      get: false,
      delete: false,
      list: false,
    };

    // Test PUT (should succeed)
    results.put = await this.testPut();

    // Test GET (should fail)
    results.get = await this.testGet();

    // Test DELETE (should fail)
    results.delete = await this.testDelete();

    // Test LIST (should fail)
    results.list = await this.testList();

    // Summary
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                  Security Test Results                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const allPassed = results.put && results.get && results.delete && results.list;

    if (allPassed) {
      console.log('✅ ALL TESTS PASSED');
      console.log('🔒 Credentials are properly restricted to write-only access\n');
      console.log('Security Status: EXCELLENT 🎯\n');
      console.log('Permissions Summary:');
      console.log('  ✅ Can upload backups (PUT)');
      console.log('  🔒 Cannot download backups (GET)');
      console.log('  🔒 Cannot delete backups (DELETE)');
      console.log('  🔒 Cannot list backups (LIST)\n');
      console.log('This is the recommended security configuration for backup credentials.');
      console.log('If credentials are compromised, attackers cannot steal or destroy backups.\n');
    } else {
      console.log('❌ SOME TESTS FAILED\n');
      
      if (!results.put) {
        console.log('⚠️  PUT failed - Credentials cannot upload backups');
        console.log('   Fix: Add s3:PutObject permission\n');
      }
      
      if (!results.get) {
        console.log('⚠️  GET succeeded - Credentials CAN download backups');
        console.log('   Security Issue: Compromised credentials can steal backups');
        console.log('   Fix: Remove s3:GetObject permission\n');
      }
      
      if (!results.delete) {
        console.log('⚠️  DELETE succeeded - Credentials CAN delete backups');
        console.log('   Security Issue: Compromised credentials can destroy backups');
        console.log('   Fix: Remove s3:DeleteObject permission\n');
      }
      
      if (!results.list) {
        console.log('⚠️  LIST succeeded - Credentials CAN list bucket contents');
        console.log('   Security Issue: Compromised credentials can discover backup structure');
        console.log('   Fix: Remove s3:ListBucket permission\n');
      }

      console.log('Recommended IAM Policy:');
      console.log('```json');
      console.log(JSON.stringify({
        "Version": "2012-10-17",
        "Statement": [{
          "Effect": "Allow",
          "Action": ["s3:PutObject", "s3:PutObjectAcl"],
          "Resource": `arn:aws:s3:::${this.s3Bucket}/*`
        }]
      }, null, 2));
      console.log('```\n');
    }

    process.exit(allPassed ? 0 : 1);
  }
}

// Main execution
async function main() {
  try {
    const tester = new S3PermissionTester();
    await tester.runAllTests();
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { S3PermissionTester };

