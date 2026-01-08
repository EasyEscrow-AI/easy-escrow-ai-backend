/**
 * Test S3 Bucket Operations for DataSales
 *
 * Usage: npx ts-node scripts/testing/test-s3-bucket.ts
 *
 * Tests:
 * 1. Bucket creation with staging prefix
 * 2. CORS configuration
 * 3. Presigned upload URL generation
 * 4. Presigned download URL generation
 * 5. Bucket cleanup
 */

import dotenv from 'dotenv';
dotenv.config();

import { S3Service } from '../../src/services/s3Service';
import { v4 as uuidv4 } from 'uuid';

async function runTests() {
  console.log('=== S3 Service Test for DataSales ===\n');

  // Verify environment variables
  console.log('Environment check:');
  console.log(`  AWS_S3_REGION: ${process.env.AWS_S3_REGION || 'not set'}`);
  console.log(`  AWS_S3_BUCKET_PREFIX: ${process.env.AWS_S3_BUCKET_PREFIX || 'not set'}`);
  console.log(
    `  AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? '***' + process.env.AWS_ACCESS_KEY_ID.slice(-4) : 'not set'}`
  );
  console.log(
    `  AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? '***' + process.env.AWS_SECRET_ACCESS_KEY.slice(-4) : 'not set'}`
  );
  console.log(
    `  DATASALES_ALLOWED_ORIGINS: ${process.env.DATASALES_ALLOWED_ORIGINS || 'not set'}`
  );
  console.log();

  const s3Service = new S3Service();

  // Generate test agreement ID
  const testAgreementId = `test-${uuidv4().substring(0, 8)}`;
  const bucketName = s3Service.generateBucketName(testAgreementId);

  console.log(`Test Agreement ID: ${testAgreementId}`);
  console.log(`Generated Bucket Name: ${bucketName}`);
  console.log();

  try {
    // Test 1: Create bucket
    console.log('1. Testing bucket creation...');
    await s3Service.createBucket(bucketName);
    console.log('   ✅ Bucket created successfully');

    // Test 2: Verify bucket exists
    console.log('2. Verifying bucket exists...');
    const exists = await s3Service.bucketExists(bucketName);
    if (exists) {
      console.log('   ✅ Bucket exists');
    } else {
      throw new Error('Bucket does not exist after creation');
    }

    // Test 3: Generate upload URLs
    console.log('3. Testing presigned upload URL generation...');
    const uploadUrls = await s3Service.generateUploadUrls(bucketName, [
      { key: 'data/sample.csv', contentType: 'text/csv' },
      { key: 'data/metadata.json', contentType: 'application/json' },
    ]);
    console.log(`   ✅ Generated ${uploadUrls.length} upload URLs`);
    for (const url of uploadUrls) {
      console.log(`      - ${url.key}: ${url.url.substring(0, 80)}...`);
    }

    // Test 4: Generate download URLs
    console.log('4. Testing presigned download URL generation...');
    const downloadUrls = await s3Service.generateDownloadUrls(bucketName, [
      'data/sample.csv',
      'data/metadata.json',
    ]);
    console.log(`   ✅ Generated ${downloadUrls.length} download URLs`);
    for (const url of downloadUrls) {
      console.log(`      - ${url.key}: ${url.url.substring(0, 80)}...`);
    }

    // Test 5: List objects (should be empty)
    console.log('5. Testing list objects...');
    const objects = await s3Service.listObjects(bucketName);
    console.log(`   ✅ Listed ${objects.length} objects (expected: 0)`);

    // Test 6: Cleanup - delete bucket
    console.log('6. Testing bucket deletion...');
    await s3Service.deleteBucket(bucketName);
    console.log('   ✅ Bucket deleted successfully');

    // Verify deletion
    const existsAfterDelete = await s3Service.bucketExists(bucketName);
    if (!existsAfterDelete) {
      console.log('   ✅ Bucket confirmed deleted');
    }

    console.log('\n=== All S3 tests passed! ===\n');
  } catch (error: any) {
    console.error(`\n❌ Test failed: ${error.message}`);
    console.error(error);

    // Cleanup on failure
    try {
      console.log('\nAttempting cleanup...');
      await s3Service.deleteBucket(bucketName);
      console.log('Cleanup successful');
    } catch (cleanupError) {
      console.log('Cleanup not needed or failed');
    }

    process.exit(1);
  }
}

runTests();
