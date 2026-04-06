-- AlterEnum: Add REMOVING status to PoolMemberStatus
-- Prevents double-refund when on-chain cancel succeeds but DB update fails
ALTER TYPE "PoolMemberStatus" ADD VALUE 'REMOVING';
