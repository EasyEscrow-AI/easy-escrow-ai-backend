export const testCorridors = {
  sgCh: {
    code: 'SG-CH',
    name: 'Singapore → Switzerland',
    minAmount: 100,
    maxAmount: 1000000,
    riskLevel: 'LOW',
    status: 'ACTIVE',
    dailyLimit: 5000000,
    monthlyLimit: 50000000,
    sourceCountry: 'SG',
    destCountry: 'CH',
    requiredDocuments: ['INVOICE'],
  },
  usMx: {
    code: 'US-MX',
    name: 'United States → Mexico',
    minAmount: 100,
    maxAmount: 500000,
    riskLevel: 'MEDIUM',
    status: 'ACTIVE',
    dailyLimit: 2000000,
    monthlyLimit: 20000000,
    sourceCountry: 'US',
    destCountry: 'MX',
    requiredDocuments: ['INVOICE'],
  },
};

export const testWallets = {
  payer: '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u',
  recipient: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
  invalid: 'not-a-valid-wallet',
};
