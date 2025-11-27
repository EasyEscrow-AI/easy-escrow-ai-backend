/**
 * Unit Tests for Treasury Wallet Configuration
 * Tests treasury address resolution, environment variable handling, and fallbacks
 */

import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import path from 'path';
import { PublicKey } from '@solana/web3.js';
import {
  getTreasuryAddress,
  getFeeCollectorAddress,
  getProgramConfig,
  getCurrentNetwork,
  resetProgramConfig,
} from '../../src/config/constants';

describe('Treasury Wallet Configuration', () => {
  let sandbox: sinon.SinonSandbox;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalEnv = { ...process.env };
    // Reset cached config before each test
    resetProgramConfig();
  });

  afterEach(() => {
    sandbox.restore();
    process.env = originalEnv;
    resetProgramConfig();
  });

  describe('getTreasuryAddress()', () => {
    describe('Staging Environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'staging';
        process.env.SOLANA_NETWORK = 'devnet';
      });

      it('should return environment variable when DEVNET_STAGING_TREASURY_ADDRESS is set', () => {
        const customAddress = 'CustomTreasuryAddress123456789012345678901234';
        process.env.DEVNET_STAGING_TREASURY_ADDRESS = customAddress;

        const address = getTreasuryAddress();

        expect(address).to.equal(customAddress);
      });

      it('should return hardcoded fallback when no environment variable is set', () => {
        delete process.env.DEVNET_STAGING_TREASURY_ADDRESS;
        
        // Mock filesystem to simulate missing keypair file
        sandbox.stub(fs, 'existsSync').returns(false);

        const address = getTreasuryAddress();

        expect(address).to.equal('AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu');
      });

      it('should load address from keypair file when file exists', () => {
        delete process.env.DEVNET_STAGING_TREASURY_ADDRESS;
        
        // Full 64-byte keypair matching the actual staging treasury
        const mockKeypair = [141,121,226,170,132,204,72,1,249,4,69,48,193,168,158,110,164,96,176,219,30,235,102,28,201,137,164,42,183,179,205,10,140,73,23,56,188,174,100,5,167,137,42,39,63,227,167,40,111,72,98,61,235,24,3,14,89,155,146,199,0,106,206,224];
        const expectedAddress = 'AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu';
        
        sandbox.stub(fs, 'existsSync').returns(true);
        sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(mockKeypair));

        const address = getTreasuryAddress();

        expect(address).to.equal(expectedAddress);
      });

      it('should fallback to hardcoded address when keypair loading fails', () => {
        delete process.env.DEVNET_STAGING_TREASURY_ADDRESS;
        
        sandbox.stub(fs, 'existsSync').returns(true);
        sandbox.stub(fs, 'readFileSync').throws(new Error('File read error'));

        const address = getTreasuryAddress();

        expect(address).to.equal('AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu');
      });
    });

    describe('Production Environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production';
        process.env.SOLANA_NETWORK = 'mainnet-beta';
      });

      it('should return environment variable when MAINNET_PRODUCTION_TREASURY_ADDRESS is set', () => {
        const customAddress = 'ProductionTreasuryAddress123456789012345678';
        process.env.MAINNET_PRODUCTION_TREASURY_ADDRESS = customAddress;

        const address = getTreasuryAddress();

        expect(address).to.equal(customAddress);
      });

      it('should return hardcoded fallback when no environment variable is set', () => {
        delete process.env.MAINNET_PRODUCTION_TREASURY_ADDRESS;
        
        // Mock filesystem to simulate missing keypair file
        sandbox.stub(fs, 'existsSync').returns(false);

        const address = getTreasuryAddress();

        expect(address).to.equal('HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF');
      });

      it('should load address from keypair file when file exists', () => {
        delete process.env.MAINNET_PRODUCTION_TREASURY_ADDRESS;
        
        // Full 64-byte keypair matching the actual production treasury
        const mockKeypair = [140,62,47,189,37,133,75,38,8,58,197,137,35,197,120,192,29,151,91,119,219,112,121,138,16,62,145,218,120,223,101,13,126,33,136,186,167,133,40,28,80,63,3,163,122,13,164,253,168,200,19,32,158,52,129,200,102,112,19,8,202,110,116,23];
        const expectedAddress = '9VN2bzjWoF1HsmyPrNtwXbBMxCYRNsFagC6pcfLmN7LA';
        
        sandbox.stub(fs, 'existsSync').returns(true);
        sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(mockKeypair));

        const address = getTreasuryAddress();

        expect(address).to.equal(expectedAddress);
      });
    });

    describe('Local Environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'development';
        process.env.SOLANA_NETWORK = 'localnet';
      });

      it('should return LOCAL_TREASURY_ADDRESS when set', () => {
        const localAddress = 'LocalTreasuryAddress1234567890123456789012';
        process.env.LOCAL_TREASURY_ADDRESS = localAddress;

        const address = getTreasuryAddress();

        expect(address).to.equal(localAddress);
      });

      it('should fallback to DEVNET_STAGING_TREASURY_ADDRESS when LOCAL not set', () => {
        delete process.env.LOCAL_TREASURY_ADDRESS;
        const stagingAddress = 'StagingTreasuryAddress123456789012345678901';
        process.env.DEVNET_STAGING_TREASURY_ADDRESS = stagingAddress;

        const address = getTreasuryAddress();

        expect(address).to.equal(stagingAddress);
      });

      it('should fallback to hardcoded staging address when no env vars set', () => {
        delete process.env.LOCAL_TREASURY_ADDRESS;
        delete process.env.DEVNET_STAGING_TREASURY_ADDRESS;

        const address = getTreasuryAddress();

        expect(address).to.equal('AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu');
      });
    });
  });

  describe('getFeeCollectorAddress()', () => {
    describe('Staging Environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'staging';
        process.env.SOLANA_NETWORK = 'devnet';
      });

      it('should return STAGING_FEE_COLLECTOR_ADDRESS when set', () => {
        const collectorAddress = 'CustomCollectorAddress12345678901234567890';
        process.env.STAGING_FEE_COLLECTOR_ADDRESS = collectorAddress;

        const address = getFeeCollectorAddress();

        expect(address).to.equal(collectorAddress);
      });

      it('should return DEVNET_STAGING_FEE_COLLECTOR_ADDRESS when set', () => {
        delete process.env.STAGING_FEE_COLLECTOR_ADDRESS;
        const collectorAddress = 'DevnetCollectorAddress123456789012345678';
        process.env.DEVNET_STAGING_FEE_COLLECTOR_ADDRESS = collectorAddress;

        const address = getFeeCollectorAddress();

        expect(address).to.equal(collectorAddress);
      });

      it('should return hardcoded fallback when no env vars set', () => {
        delete process.env.STAGING_FEE_COLLECTOR_ADDRESS;
        delete process.env.DEVNET_STAGING_FEE_COLLECTOR_ADDRESS;
        delete process.env.PLATFORM_FEE_COLLECTOR_ADDRESS;

        const address = getFeeCollectorAddress();

        expect(address).to.equal('8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ');
      });
    });

    describe('Production Environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production';
        process.env.SOLANA_NETWORK = 'mainnet-beta';
      });

      it('should return MAINNET_PROD_FEE_COLLECTOR_ADDRESS when set', () => {
        const collectorAddress = 'MainnetCollectorAddress123456789012345678';
        process.env.MAINNET_PROD_FEE_COLLECTOR_ADDRESS = collectorAddress;

        const address = getFeeCollectorAddress();

        expect(address).to.equal(collectorAddress);
      });

      it('should throw error when MAINNET_PROD_FEE_COLLECTOR_ADDRESS not set', () => {
        delete process.env.MAINNET_PROD_FEE_COLLECTOR_ADDRESS;

        expect(() => getFeeCollectorAddress()).to.throw(
          'MAINNET_PROD_FEE_COLLECTOR_ADDRESS must be set for production environment'
        );
      });
    });
  });

  describe('getProgramConfig()', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'staging';
      process.env.SOLANA_NETWORK = 'devnet';
      // Use valid base58 addresses for testing
      process.env.DEVNET_STAGING_TREASURY_ADDRESS = 'AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu';
      process.env.STAGING_FEE_COLLECTOR_ADDRESS = '8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ';
      process.env.STAGING_PROGRAM_ID = 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei';
    });

    it('should include treasury address in program config', () => {
      const config = getProgramConfig();

      expect(config).to.have.property('treasuryAddress');
      expect(config).to.have.property('treasuryAddressString');
      expect(config.treasuryAddressString).to.equal('AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu');
    });

    it('should include fee collector address in program config', () => {
      const config = getProgramConfig();

      expect(config).to.have.property('feeCollectorAddress');
      expect(config).to.have.property('feeCollectorAddressString');
      expect(config.feeCollectorAddressString).to.equal('8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ');
    });

    it('should include both treasury and collector addresses', () => {
      const config = getProgramConfig();

      expect(config.treasuryAddressString).to.not.equal(config.feeCollectorAddressString);
      expect(config.treasuryAddressString).to.equal('AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu');
      expect(config.feeCollectorAddressString).to.equal('8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ');
    });

    it('should return PublicKey objects for addresses', () => {
      const config = getProgramConfig();

      expect(config.treasuryAddress).to.be.instanceOf(PublicKey);
      expect(config.feeCollectorAddress).to.be.instanceOf(PublicKey);
      expect(config.treasuryAddress.toBase58()).to.equal(config.treasuryAddressString);
      expect(config.feeCollectorAddress.toBase58()).to.equal(config.feeCollectorAddressString);
    });
  });

  describe('Network Detection', () => {
    it('should detect staging network from NODE_ENV', () => {
      process.env.NODE_ENV = 'staging';
      delete process.env.SOLANA_NETWORK;

      const network = getCurrentNetwork();

      expect(network).to.equal('staging');
    });

    it('should detect production network from NODE_ENV', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SOLANA_NETWORK;

      const network = getCurrentNetwork();

      expect(network).to.equal('production');
    });

    it('should prefer SOLANA_NETWORK over NODE_ENV', () => {
      process.env.NODE_ENV = 'production';
      process.env.SOLANA_NETWORK = 'devnet';

      const network = getCurrentNetwork();

      expect(network).to.equal('staging'); // devnet maps to staging
    });

    it('should default to local when neither is set', () => {
      delete process.env.NODE_ENV;
      delete process.env.SOLANA_NETWORK;

      const network = getCurrentNetwork();

      expect(network).to.equal('local');
    });
  });

  describe('Treasury vs Fee Collector', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'staging';
      process.env.SOLANA_NETWORK = 'devnet';
    });

    it('should provide different addresses for treasury and fee collector', () => {
      const treasuryAddress = getTreasuryAddress();
      const collectorAddress = getFeeCollectorAddress();

      // In staging, they should be different
      // Treasury: AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu
      // Collector: 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ
      expect(treasuryAddress).to.not.equal(collectorAddress);
    });

    it('should use treasury address for active fee collection', () => {
      // This is the address that receives fees during swaps
      const treasuryAddress = getTreasuryAddress();

      expect(treasuryAddress).to.equal('AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu');
    });

    it('should use fee collector for cold storage', () => {
      // This is the address that receives weekly transfers after prize distribution
      const collectorAddress = getFeeCollectorAddress();

      expect(collectorAddress).to.equal('8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ');
    });
  });

  describe('Environment Variable Priority', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'staging';
      process.env.SOLANA_NETWORK = 'devnet';
    });

    it('should prioritize environment variable over keypair file', () => {
      const envAddress = 'EnvTreasuryAddress1234567890123456789012345';
      process.env.DEVNET_STAGING_TREASURY_ADDRESS = envAddress;
      
      // Mock keypair file exists but should not be used
      sandbox.stub(fs, 'existsSync').returns(true);
      sandbox.stub(fs, 'readFileSync').returns(JSON.stringify([1, 2, 3]));

      const address = getTreasuryAddress();

      expect(address).to.equal(envAddress);
    });

    it('should use keypair file when environment variable not set', () => {
      delete process.env.DEVNET_STAGING_TREASURY_ADDRESS;
      
      // Full 64-byte keypair
      const mockKeypair = [141,121,226,170,132,204,72,1,249,4,69,48,193,168,158,110,164,96,176,219,30,235,102,28,201,137,164,42,183,179,205,10,140,73,23,56,188,174,100,5,167,137,42,39,63,227,167,40,111,72,98,61,235,24,3,14,89,155,146,199,0,106,206,224];
      sandbox.stub(fs, 'existsSync').returns(true);
      sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(mockKeypair));

      const address = getTreasuryAddress();

      expect(address).to.equal('AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu');
    });

    it('should use hardcoded fallback as last resort', () => {
      delete process.env.DEVNET_STAGING_TREASURY_ADDRESS;
      
      sandbox.stub(fs, 'existsSync').returns(false);

      const address = getTreasuryAddress();

      expect(address).to.equal('AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'staging';
      process.env.SOLANA_NETWORK = 'devnet';
    });

    it('should handle corrupted keypair file gracefully', () => {
      delete process.env.DEVNET_STAGING_TREASURY_ADDRESS;
      
      sandbox.stub(fs, 'existsSync').returns(true);
      sandbox.stub(fs, 'readFileSync').returns('invalid json');

      const address = getTreasuryAddress();

      // Should fallback to hardcoded address
      expect(address).to.equal('AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu');
    });

    it('should handle filesystem errors gracefully', () => {
      delete process.env.DEVNET_STAGING_TREASURY_ADDRESS;
      
      sandbox.stub(fs, 'existsSync').throws(new Error('Filesystem error'));

      const address = getTreasuryAddress();

      // Should fallback to hardcoded address
      expect(address).to.equal('AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu');
    });
  });
});

