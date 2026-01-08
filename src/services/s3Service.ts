/**
 * S3 Service for DataSales Digital Bucket Storage
 *
 * Provides secure file storage operations for DataSales escrow:
 * - Per-transaction bucket isolation
 * - Presigned URL generation for uploads/downloads
 * - Server-side encryption (SSE-S3)
 * - Bucket lifecycle management
 * - CORS configuration for DataSales frontend
 *
 * @see DataSales Settlement Layer Implementation Plan
 */

import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from './logger.service';

// ============================================
// Types
// ============================================

export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketPrefix: string;
}

export interface PresignedUrl {
  url: string;
  key: string;
  expiresAt: Date;
  method: 'PUT' | 'GET';
}

export interface FileUploadRequest {
  key: string;
  contentType?: string;
  contentLength?: number;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
}

export interface S3ObjectMeta {
  key: string;
  size: number;
  contentType?: string;
  lastModified?: Date;
  etag?: string;
  metadata?: Record<string, string>;
}

// ============================================
// Service Implementation
// ============================================

export class S3Service {
  private client: S3Client;
  private config: S3Config;
  private static instance: S3Service | null = null;

  constructor(config?: Partial<S3Config>) {
    this.config = {
      region: config?.region || process.env.AWS_S3_REGION || 'us-east-1',
      accessKeyId: config?.accessKeyId || process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: config?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '',
      bucketPrefix: config?.bucketPrefix || process.env.AWS_S3_BUCKET_PREFIX || 'datasales-',
    };

    this.client = new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): S3Service {
    if (!S3Service.instance) {
      S3Service.instance = new S3Service();
    }
    return S3Service.instance;
  }

  /**
   * Generate a unique bucket name for a DataSales agreement
   */
  generateBucketName(agreementId: string): string {
    // S3 bucket names must be lowercase, 3-63 chars, no underscores
    const sanitized = agreementId.toLowerCase().replace(/_/g, '-').substring(0, 32);
    return `${this.config.bucketPrefix}${sanitized}`;
  }

  /**
   * Create a new S3 bucket for a DataSales agreement
   */
  async createBucket(bucketName: string): Promise<void> {
    try {
      const command = new CreateBucketCommand({
        Bucket: bucketName,
        // Note: LocationConstraint is not needed for us-east-1
        ...(this.config.region !== 'us-east-1' && {
          CreateBucketConfiguration: {
            LocationConstraint: this.config.region as any,
          },
        }),
      });

      await this.client.send(command);
      logger.info(`S3 bucket created: ${bucketName}`);

      // Configure CORS for uploads from DataSales frontend
      await this.setBucketCors(bucketName);
    } catch (error: any) {
      if (error.name === 'BucketAlreadyOwnedByYou') {
        logger.warn(`Bucket already exists: ${bucketName}`);
        return;
      }
      logger.error(`Failed to create S3 bucket: ${bucketName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Delete an S3 bucket (must be empty)
   */
  async deleteBucket(bucketName: string): Promise<void> {
    try {
      // First, empty the bucket
      await this.emptyBucket(bucketName);

      const command = new DeleteBucketCommand({
        Bucket: bucketName,
      });

      await this.client.send(command);
      logger.info(`S3 bucket deleted: ${bucketName}`);
    } catch (error: any) {
      if (error.name === 'NoSuchBucket') {
        logger.warn(`Bucket does not exist: ${bucketName}`);
        return;
      }
      logger.error(`Failed to delete S3 bucket: ${bucketName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Generate presigned URLs for file uploads
   */
  async generateUploadUrls(
    bucketName: string,
    files: FileUploadRequest[],
    expiresIn: number = 3600 // 1 hour default
  ): Promise<PresignedUrl[]> {
    const urls: PresignedUrl[] = [];
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    for (const file of files) {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: file.key,
        ContentType: file.contentType || 'application/octet-stream',
        ServerSideEncryption: 'AES256', // SSE-S3 encryption
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });

      urls.push({
        url,
        key: file.key,
        expiresAt,
        method: 'PUT',
      });
    }

    logger.debug(`Generated ${urls.length} upload URLs for bucket: ${bucketName}`);
    return urls;
  }

  /**
   * Generate presigned URLs for file downloads
   */
  async generateDownloadUrls(
    bucketName: string,
    keys: string[],
    expiresIn: number = 86400 // 24 hours default
  ): Promise<PresignedUrl[]> {
    const urls: PresignedUrl[] = [];
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    for (const key of keys) {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });

      urls.push({
        url,
        key,
        expiresAt,
        method: 'GET',
      });
    }

    logger.debug(`Generated ${urls.length} download URLs for bucket: ${bucketName}`);
    return urls;
  }

  /**
   * List all objects in a bucket
   */
  async listObjects(bucketName: string, prefix?: string): Promise<S3Object[]> {
    const objects: S3Object[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await this.client.send(command);

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key && obj.Size !== undefined) {
            objects.push({
              key: obj.Key,
              size: obj.Size,
              lastModified: obj.LastModified || new Date(),
              etag: obj.ETag,
            });
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }

  /**
   * Get metadata for a single object
   */
  async headObject(bucketName: string, key: string): Promise<S3ObjectMeta> {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await this.client.send(command);

    return {
      key,
      size: response.ContentLength || 0,
      contentType: response.ContentType,
      lastModified: response.LastModified,
      etag: response.ETag,
      metadata: response.Metadata,
    };
  }

  /**
   * Delete a single object
   */
  async deleteObject(bucketName: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await this.client.send(command);
    logger.debug(`Deleted object: ${bucketName}/${key}`);
  }

  /**
   * Empty a bucket by deleting all objects
   */
  async emptyBucket(bucketName: string): Promise<void> {
    const objects = await this.listObjects(bucketName);

    if (objects.length === 0) {
      return;
    }

    // Delete in batches of 1000 (S3 limit)
    const batchSize = 1000;
    for (let i = 0; i < objects.length; i += batchSize) {
      const batch = objects.slice(i, i + batchSize);
      const command = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: batch.map((obj) => ({ Key: obj.key })),
        },
      });

      await this.client.send(command);
    }

    logger.info(`Emptied bucket: ${bucketName} (${objects.length} objects deleted)`);
  }

  /**
   * Configure CORS for the bucket (allows uploads from DataSales frontend)
   */
  async setBucketCors(bucketName: string): Promise<void> {
    const allowedOrigins = process.env.DATASALES_ALLOWED_ORIGINS?.split(',') || [
      'https://datasales.ai',
      'https://www.datasales.ai',
      'http://localhost:3000', // Development
    ];

    const command = new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            AllowedOrigins: allowedOrigins,
            ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    });

    await this.client.send(command);
    logger.debug(`CORS configured for bucket: ${bucketName}`);
  }

  /**
   * Set bucket lifecycle policy for auto-deletion
   */
  async setBucketLifecycle(bucketName: string, expirationDays: number): Promise<void> {
    const command = new PutBucketLifecycleConfigurationCommand({
      Bucket: bucketName,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'auto-delete',
            Status: 'Enabled',
            Filter: {
              Prefix: '', // Apply to all objects
            },
            Expiration: {
              Days: expirationDays,
            },
          },
        ],
      },
    });

    await this.client.send(command);
    logger.info(`Lifecycle policy set for bucket: ${bucketName} (expires in ${expirationDays} days)`);
  }

  /**
   * Check if a bucket exists
   */
  async bucketExists(bucketName: string): Promise<boolean> {
    try {
      await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          MaxKeys: 1,
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'NoSuchBucket') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get the total size of all objects in a bucket
   */
  async getBucketSize(bucketName: string): Promise<number> {
    const objects = await this.listObjects(bucketName);
    return objects.reduce((total, obj) => total + obj.size, 0);
  }
}

// Export singleton for convenience
export const s3Service = S3Service.getInstance();
