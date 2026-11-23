import "server-only";

export interface AntivirusScanResult {
  isClean: boolean;
  threatName?: string;
  engine: string;
  scannedAt: Date;
}

export interface AntivirusScanner {
  readonly name: string;
  scan(buffer: Buffer, filename?: string): Promise<AntivirusScanResult>;
}

/**
 * Standard No-Op Antivirus Scanner
 * Clearly labelled development/default scanner that marks all uploaded buffers as clean.
 * Can be swapped with ClamAV or commercial virus scanning APIs in enterprise environments.
 */
export class NoOpAntivirusScanner implements AntivirusScanner {
  readonly name = "No-Op Dev Scanner (Default: Always Clean)";

  async scan(_buffer: Buffer, _filename?: string): Promise<AntivirusScanResult> {
    return {
      isClean: true,
      engine: this.name,
      scannedAt: new Date(),
    };
  }
}

/**
 * Factory for creating the active antivirus scanner
 */
function createAntivirusScanner(): AntivirusScanner {
  const driver = (process.env.ANTIVIRUS_DRIVER || "noop").toLowerCase();

  switch (driver) {
    case "noop":
    default:
      return new NoOpAntivirusScanner();
  }
}

export const antivirus = createAntivirusScanner();

