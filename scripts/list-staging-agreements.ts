#!/usr/bin/env ts-node
/**
 * List all staging agreements with their current status
 */

import axios from 'axios';

interface Agreement {
  agreementId: string;
  status: string;
  swapType: string;
  createdAt: string;
  seller: string;
  buyer: string | null;
}

async function listStagingAgreements() {
  const apiUrl = 'https://easyescrow-backend-staging-mwx9s.ondigitalocean.app';

  console.log('\n' + '='.repeat(80));
  console.log('📋 STAGING AGREEMENTS LIST');
  console.log('='.repeat(80) + '\n');

  try {
    const response = await axios.get<{ success: boolean; data: Agreement[] }>(
      `${apiUrl}/v1/agreements`,
      {
        params: {
          limit: 1000,
        }
      }
    );

    if (!response.data.success || !Array.isArray(response.data.data)) {
      console.error('❌ Failed to fetch agreements');
      process.exit(1);
    }

    const agreements = response.data.data;
    console.log(`Total agreements: ${agreements.length}\n`);

    // Group by status
    const byStatus: Record<string, Agreement[]> = {};
    for (const agreement of agreements) {
      if (!byStatus[agreement.status]) {
        byStatus[agreement.status] = [];
      }
      byStatus[agreement.status].push(agreement);
    }

    // Display grouped by status
    for (const [status, statusAgreements] of Object.entries(byStatus)) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Status: ${status} (${statusAgreements.length} agreements)`);
      console.log('='.repeat(80));
      
      for (const agreement of statusAgreements) {
        const age = Math.floor((Date.now() - new Date(agreement.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        console.log(`\n  • ${agreement.agreementId}`);
        console.log(`    Type: ${agreement.swapType || 'N/A'}`);
        console.log(`    Created: ${agreement.createdAt} (${age} days ago)`);
        console.log(`    Seller: ${agreement.seller.substring(0, 8)}...`);
        console.log(`    Buyer: ${agreement.buyer ? agreement.buyer.substring(0, 8) + '...' : 'None'}`);
      }
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error: any) {
    console.error('\n❌ Failed to fetch agreements:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

listStagingAgreements();


