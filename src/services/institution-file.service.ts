import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaClient, DocumentType } from '../generated/prisma';
import { getInstitutionEscrowConfig } from '../config/institution-escrow.config';
import { escrowWhere } from '../utils/uuid-conversion';
import multer from 'multer';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv', // .csv
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * Sanitize a filename by stripping path traversal characters, control chars,
 * and null bytes. Only alphanumeric, dash, underscore, and dot are kept.
 */
function sanitizeFileName(name: string): string {
  // Remove path traversal patterns
  let sanitized = name.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');
  // Remove directory separators
  sanitized = sanitized.replace(/[/\\]/g, '');
  // Keep only alphanumeric, dash, underscore, dot
  sanitized = sanitized.replace(/[^a-zA-Z0-9\-_.]/g, '');
  // Prevent empty result
  if (!sanitized) {
    sanitized = 'unnamed';
  }
  return sanitized;
}

/**
 * Map a string document type to the Prisma DocumentType enum
 */
function toDocumentType(value: string): DocumentType {
  const upper = value.toUpperCase();
  const mapping: Record<string, DocumentType> = {
    INVOICE: DocumentType.INVOICE,
    CONTRACT: DocumentType.CONTRACT,
    SHIPPING_DOC: DocumentType.SHIPPING_DOC,
    LETTER_OF_CREDIT: DocumentType.LETTER_OF_CREDIT,
    OTHER: DocumentType.OTHER,
  };
  return mapping[upper] || DocumentType.OTHER;
}

/**
 * Institution File Service
 *
 * Handles file uploads, downloads, and management for institution clients
 * using DigitalOcean Spaces (S3-compatible object storage).
 */
export class InstitutionFileService {
  private s3Client: S3Client;
  private prisma: PrismaClient;
  private bucket: string;

  constructor() {
    this.prisma = new PrismaClient();
    const spacesConfig = getInstitutionEscrowConfig().doSpaces;
    const endpoint = spacesConfig.endpoint;
    const region = spacesConfig.region || 'nyc3';
    this.bucket = spacesConfig.bucket;

    this.s3Client = new S3Client({
      endpoint: endpoint ? `https://${endpoint}` : undefined,
      region,
      credentials: {
        accessKeyId: spacesConfig.key,
        secretAccessKey: spacesConfig.secret,
      },
      forcePathStyle: false,
    });
  }

  /**
   * Upload a file to DO Spaces and create a database record
   */
  async uploadFile(
    clientId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    documentType: string,
    escrowId?: string,
  ) {
    // Validate mime type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new Error(
        `Invalid file type: ${file.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `File too large: ${file.size} bytes. Maximum: ${MAX_FILE_SIZE} bytes (25MB)`,
      );
    }

    // Resolve escrow code to UUID if needed
    let resolvedEscrowId = escrowId;
    if (escrowId?.startsWith('EE-')) {
      const esc = await this.prisma.institutionEscrow.findUnique({
        where: { escrowCode: escrowId },
        select: { escrowId: true },
      });
      if (!esc) throw new Error(`Escrow not found: ${escrowId}`);
      resolvedEscrowId = esc.escrowId;
    }

    // Sanitize filename
    const sanitizedFileName = sanitizeFileName(file.originalname);

    // Generate structured S3 key: institution/{clientId}/{YYYY-MM-DD}/{escrowId|general}/{timestamp}_{filename}
    const date = new Date();
    const dateFolder = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    const folder = escrowId || 'general';
    const key = `institution/${clientId}/${dateFolder}/${folder}/${Date.now()}_${sanitizedFileName}`;

    // Upload to S3
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          clientId,
          documentType,
        },
      }),
    );

    // Create database record
    const fileRecord = await this.prisma.institutionFile.create({
      data: {
        clientId,
        escrowId: resolvedEscrowId || null,
        fileName: sanitizedFileName,
        fileKey: key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        documentType: toDocumentType(documentType),
      },
    });

    return fileRecord;
  }

  /**
   * Generate a presigned URL for downloading a file
   */
  async getFileUrl(fileId: string, clientId: string) {
    const file = await this.prisma.institutionFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error('File not found');
    }

    if (file.clientId !== clientId) {
      throw new Error('Unauthorized: file does not belong to this client');
    }

    const url = await getSignedUrl(
      this.s3Client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: file.fileKey,
      }),
      { expiresIn: 3600 },
    );

    return { url, expiresIn: 3600 };
  }

  /**
   * List files for a client, optionally filtered by escrowId
   */
  async listFiles(clientId: string, escrowIdOrCode?: string) {
    const where: { clientId: string; escrowId?: string } = { clientId };
    if (escrowIdOrCode) {
      if (escrowIdOrCode.startsWith('EE-')) {
        const esc = await this.prisma.institutionEscrow.findUnique({
          where: { escrowCode: escrowIdOrCode },
          select: { escrowId: true },
        });
        if (esc) where.escrowId = esc.escrowId;
      } else {
        where.escrowId = escrowIdOrCode;
      }
    }

    const files = await this.prisma.institutionFile.findMany({
      where,
      orderBy: { uploadedAt: 'desc' },
    });

    return files;
  }

  /**
   * Delete a file from S3 and the database
   */
  async deleteFile(fileId: string, clientId: string) {
    const file = await this.prisma.institutionFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error('File not found');
    }

    if (file.clientId !== clientId) {
      throw new Error('Unauthorized: file does not belong to this client');
    }

    // Delete from S3
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: file.fileKey,
      }),
    );

    // Delete from database
    await this.prisma.institutionFile.delete({
      where: { id: fileId },
    });

    return { success: true };
  }

  /**
   * Download a file's raw buffer from S3
   */
  async getFileBuffer(fileId: string, clientId: string) {
    const file = await this.prisma.institutionFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error('File not found');
    }

    if (file.clientId !== clientId) {
      throw new Error('Unauthorized: file does not belong to this client');
    }

    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: file.fileKey,
      }),
    );

    // Stream body to buffer
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    return {
      buffer,
      mimeType: file.mimeType,
      fileName: file.fileName,
    };
  }
}

// Multer middleware configuration for institution file uploads
export const institutionFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid file type: ${file.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
        ),
      );
    }
  },
});

// Singleton accessor
let instance: InstitutionFileService | null = null;

export function getInstitutionFileService(): InstitutionFileService {
  if (!instance) {
    instance = new InstitutionFileService();
  }
  return instance;
}
