/**
 * Bun-Drive Share Discovery Service
 * Discovers accessible SMB network shares in the Active Directory domain
 * using the current Windows user's credentials and security token.
 */

import { NetworkShare, ShareDiscoveryResult, WindowsIdentity } from '../types/drive.js';
import { NativeBridge } from './nativeBridge.js';
import { logger } from './logger.js';

export class ShareDiscoveryService {
  private lastResult: ShareDiscoveryResult | null = null;
  private isScanning = false;

  /**
   * Discover all accessible network shares in the domain
   */
  public async discoverShares(targetServers?: string[]): Promise<ShareDiscoveryResult> {
    if (this.isScanning) {
      logger.warn('DiscoveryService', 'Scan already in progress, awaiting current result...');
      if (this.lastResult) return this.lastResult;
    }

    this.isScanning = true;
    try {
      logger.info('DiscoveryService', 'Initiating Active Directory network share discovery...');
      const result = await NativeBridge.executeDiscovery(targetServers);
      this.lastResult = result;
      logger.info(
        'DiscoveryService',
        `Discovery finished in ${result.scanDurationMs}ms. Accessible: ${result.shares.length}, Excluded (Access Denied): ${result.inaccessibleSharesCount}`
      );
      return result;
    } catch (err) {
      logger.error('DiscoveryService', 'Active Directory share discovery encountered an error', err);
      throw err;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Get the last discovery result or trigger a fresh scan
   */
  public async getShares(forceScan = false): Promise<ShareDiscoveryResult> {
    if (!forceScan && this.lastResult) {
      return this.lastResult;
    }
    return this.discoverShares();
  }

  /**
   * Probe a specific server entered by user/admin
   */
  public async probeServer(serverHost: string): Promise<NetworkShare[]> {
    logger.info('DiscoveryService', `Probing specific server: ${serverHost}`);
    const result = await this.discoverShares([serverHost]);
    return result.shares;
  }

  /**
   * Check if a scan is currently active
   */
  public isScanActive(): boolean {
    return this.isScanning;
  }
}

export const discoveryService = new ShareDiscoveryService();
