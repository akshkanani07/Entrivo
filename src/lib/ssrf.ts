import "server-only";
import dns from "dns";
import net from "net";

/**
 * Checks if an IP address belongs to loopback, private, link-local,
 * cloud metadata, or reserved networks.
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;

  // IPv4 Check
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }

    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;

    // 10.0.0.0/8 (Private Class A)
    if (parts[0] === 10) return true;

    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;

    // 169.254.0.0/16 (Link-local & AWS/GCP/Azure instance metadata 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;

    // 172.16.0.0/12 (Private Class B: 172.16.0.0 - 172.31.255.255)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

    // 192.168.0.0/16 (Private Class C)
    if (parts[0] === 192 && parts[1] === 168) return true;

    // 100.64.0.0/10 (Shared Address Space / CGNAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;

    // 192.0.0.0/24, 192.0.2.0/24 (TEST-NET-1), 198.51.100.0/24 (TEST-NET-2), 203.0.113.0/24 (TEST-NET-3)
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true;
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;

    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (parts[0] >= 224) return true;

    // 255.255.255.255 (Broadcast)
    if (ip === "255.255.255.255") return true;

    return false;
  }

  // IPv6 Check
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();

    // ::1 (Loopback)
    if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;

    // :: (Unspecified)
    if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;

    // ::ffff:127.0.0.1 (IPv4-mapped)
    if (normalized.startsWith("::ffff:")) {
      const ipv4 = normalized.substring(7);
      if (net.isIPv4(ipv4)) {
        return isPrivateIp(ipv4);
      }
    }

    // fe80::/10 (Link-local)
    if (
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    ) {
      return true;
    }

    // fc00::/7 (Unique Local Address - ULA)
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
      return true;
    }

    // ff00::/8 (Multicast)
    if (normalized.startsWith("ff")) {
      return true;
    }

    return false;
  }

  // Unrecognized IP format
  return true;
}

export interface SsrCheckResult {
  safe: boolean;
  error?: string;
  resolvedIps?: string[];
}

/**
 * Validates a destination URL against SSRF attack vectors:
 * 1. Protocol must be https:
 * 2. No embedded user credentials
 * 3. No custom port (standard 443 only)
 * 4. Resolves DNS at call time and asserts that NO resolved IP addresses reside
 *    in loopback, private, or link-local ranges (defeats DNS rebinding).
 */
export async function assertSafeUrl(urlString: string): Promise<SsrCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, error: "Invalid URL syntax" };
  }

  // 1. HTTPS only
  if (parsed.protocol !== "https:") {
    return { safe: false, error: "Only secure HTTPS protocol is permitted" };
  }

  // 2. Reject credentials
  if (parsed.username || parsed.password) {
    return { safe: false, error: "URL credentials are strictly forbidden" };
  }

  // 3. Reject custom ports
  if (parsed.port && parsed.port !== "443") {
    return { safe: false, error: "Custom ports are forbidden; only standard HTTPS port 443 is allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Obvious hostname blocks
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".home.arpa")
  ) {
    return { safe: false, error: "Destination host points to loopback or private network namespace" };
  }

  // Direct IP in hostname
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { safe: false, error: `Target IP ${hostname} is in a reserved private range` };
    }
    return { safe: true, resolvedIps: [hostname] };
  }

  // 4. DNS Resolution Check to prevent DNS rebinding attacks
  try {
    const lookups = await dns.promises.lookup(hostname, { all: true });
    if (!lookups || lookups.length === 0) {
      return { safe: false, error: "Unable to resolve target hostname via DNS" };
    }

    const resolvedIps = lookups.map((l) => l.address);
    for (const ip of resolvedIps) {
      if (isPrivateIp(ip)) {
        return {
          safe: false,
          error: `DNS rebinding detected: host resolves to private/loopback IP address (${ip})`,
          resolvedIps,
        };
      }
    }

    return { safe: true, resolvedIps };
  } catch (err: any) {
    return { safe: false, error: `DNS resolution failed: ${err.message || "Host not found"}` };
  }
}

/**
 * Executes an HTTP fetch request guaranteed safe against SSRF:
 * - Pre-validates URL & DNS
 * - Enforces redirect: "manual" (no redirects)
 * - Enforces 5-second timeout
 */
export async function safeFetch(
  urlString: string,
  init: RequestInit = {}
): Promise<Response> {
  const check = await assertSafeUrl(urlString);
  if (!check.safe) {
    throw new Error(`SSRF validation blocked request: ${check.error}`);
  }

  // Enforce manual redirects & 5s timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(urlString, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

