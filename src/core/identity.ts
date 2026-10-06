/**
 * Bun-Drive Windows Identity Service
 * Retrieves and validates the current logged-in Windows user's domain identity,
 * Active Directory security groups, and Windows authentication token.
 */

import { WindowsIdentity } from '../types/drive.js';
import { NativeBridge } from './nativeBridge.js';
import { logger } from './logger.js';

export class WindowsIdentityService {
  private cachedIdentity: WindowsIdentity | null = null;
  private lastFetched = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  /**
   * Get the current Windows user identity and AD domain context
   */
  public async getCurrentIdentity(forceRefresh = false): Promise<WindowsIdentity> {
    const now = Date.now();
    if (!forceRefresh && this.cachedIdentity && (now - this.lastFetched < this.CACHE_TTL_MS)) {
      return this.cachedIdentity;
    }

    try {
      logger.info('IdentityService', 'Querying current Windows security context...');
      const identity = await NativeBridge.getWindowsIdentity();
      this.cachedIdentity = identity;
      this.lastFetched = now;
      logger.info('IdentityService', `Resolved user: ${identity.username} (Domain: ${identity.domain})`);
      return identity;
    } catch (err) {
      logger.error('IdentityService', 'Failed to resolve Windows Identity', err);
      if (this.cachedIdentity) {
        return this.cachedIdentity;
      }
      throw err;
    }
  }

  /**
   * Invalidate identity cache (useful after gpupdate or group changes)
   */
  public invalidateCache(): void {
    this.cachedIdentity = null;
    this.lastFetched = 0;
  }
}

export const identityService = new WindowsIdentityService();
