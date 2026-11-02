const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ICONS_DIR = path.join(__dirname, "../public/icons");
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

async function generateAssets() {
  console.log("Generating PWA icons, shortcuts, and screenshots...");

  // 1. Master Icon SVG (512x512)
  const masterIconSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#020617" />
        </linearGradient>
        <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#6366f1" />
          <stop offset="100%" stop-color="#06b6d4" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#6366f1" flood-opacity="0.4" />
        </filter>
      </defs>
      <!-- Background rounded for standard and maskable safe zone -->
      <rect width="512" height="512" rx="110" fill="url(#bgGrad)" />
      <rect x="16" y="16" width="480" height="480" rx="96" fill="none" stroke="#312e81" stroke-width="2" />
      
      <!-- Shield Emblem -->
      <g filter="url(#glow)">
        <path d="M256 100 L380 156 C380 270 256 384 256 384 C256 384 132 270 132 156 Z" 
              fill="url(#shieldGrad)" />
        <path d="M256 128 L354 172 C354 262 256 352 256 352 C256 352 158 262 158 172 Z" 
              fill="#080c14" opacity="0.85" />
      </g>
      
      <!-- Checkmark -->
      <path d="M210 248 L244 282 L308 206" 
            fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `);

  // Write SVG
  fs.writeFileSync(path.join(ICONS_DIR, "icon.svg"), masterIconSvg);

  // Generate 192x192 and 512x512 icons
  await sharp(masterIconSvg).resize(192, 192).png().toFile(path.join(ICONS_DIR, "icon-192x192.png"));
  await sharp(masterIconSvg).resize(512, 512).png().toFile(path.join(ICONS_DIR, "icon-512x512.png"));
  await sharp(masterIconSvg).resize(180, 180).png().toFile(path.join(ICONS_DIR, "apple-touch-icon.png"));

  // Generate Shortcut Icons (96x96)
  // Check-in shortcut icon
  const checkinSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="24" fill="#0f172a" />
      <circle cx="48" cy="48" r="28" fill="#4f46e5" />
      <path d="M38 48 L44 54 L58 40" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `);
  await sharp(checkinSvg).resize(96, 96).png().toFile(path.join(ICONS_DIR, "shortcut-checkin.png"));

  // New invitation shortcut icon
  const inviteSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="24" fill="#0f172a" />
      <circle cx="48" cy="48" r="28" fill="#0891b2" />
      <path d="M48 34 L48 62 M34 48 L62 48" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
    </svg>
  `);
  await sharp(inviteSvg).resize(96, 96).png().toFile(path.join(ICONS_DIR, "shortcut-invite.png"));

  // Scan QR shortcut icon
  const scanSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="24" fill="#0f172a" />
      <circle cx="48" cy="48" r="28" fill="#10b981" />
      <rect x="36" y="36" width="10" height="10" fill="#ffffff" />
      <rect x="50" y="36" width="10" height="10" fill="#ffffff" />
      <rect x="36" y="50" width="10" height="10" fill="#ffffff" />
      <rect x="52" y="52" width="6" height="6" fill="#ffffff" />
    </svg>
  `);
  await sharp(scanSvg).resize(96, 96).png().toFile(path.join(ICONS_DIR, "shortcut-scan.png"));

  // Generate Screenshots for Manifest
  // Wide Screenshot (1280x720) Desktop View
  const wideSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <rect width="1280" height="720" fill="#080c14" />
      <!-- Sidebar mock -->
      <rect x="0" y="0" width="240" height="720" fill="#0b1120" />
      <rect x="24" y="24" width="36" height="36" rx="8" fill="#4f46e5" />
      <text x="70" y="48" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="bold" font-size="20">ENTRIVO</text>
      <rect x="20" y="90" width="200" height="36" rx="10" fill="#312e81" opacity="0.6" />
      <text x="40" y="113" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14">Dashboard</text>
      <rect x="20" y="136" width="200" height="36" rx="10" fill="transparent" />
      <text x="40" y="159" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="14">Visitors</text>
      <rect x="20" y="182" width="200" height="36" rx="10" fill="transparent" />
      <text x="40" y="205" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="14">Invitations</text>
      <rect x="20" y="228" width="200" height="36" rx="10" fill="transparent" />
      <text x="40" y="251" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="14">Check-In Desk</text>
      
      <!-- Main Content Header -->
      <rect x="280" y="24" width="960" height="60" rx="16" fill="#0f172a" />
      <text x="310" y="59" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="800" font-size="20">Workplace Operations Dashboard</text>
      
      <!-- KPI Cards -->
      <rect x="280" y="110" width="220" height="110" rx="16" fill="#0f172a" stroke="#1e293b" />
      <text x="300" y="140" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="12">Checked In Today</text>
      <text x="300" y="180" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="bold" font-size="28">48</text>
      
      <rect x="525" y="110" width="220" height="110" rx="16" fill="#0f172a" stroke="#1e293b" />
      <text x="545" y="140" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="12">Currently on Premises</text>
      <text x="545" y="180" fill="#38bdf8" font-family="system-ui, sans-serif" font-weight="bold" font-size="28">19</text>
      
      <rect x="770" y="110" width="220" height="110" rx="16" fill="#0f172a" stroke="#1e293b" />
      <text x="790" y="140" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="12">Pending Approvals</text>
      <text x="790" y="180" fill="#fbbf24" font-family="system-ui, sans-serif" font-weight="bold" font-size="28">3</text>
      
      <rect x="1015" y="110" width="225" height="110" rx="16" fill="#0f172a" stroke="#1e293b" />
      <text x="1035" y="140" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="12">Active Kiosks</text>
      <text x="1035" y="180" fill="#4ade80" font-family="system-ui, sans-serif" font-weight="bold" font-size="28">4</text>
      
      <!-- Chart Area -->
      <rect x="280" y="244" width="670" height="440" rx="16" fill="#0f172a" stroke="#1e293b" />
      <text x="310" y="280" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="bold" font-size="16">Hourly Visitor Traffic</text>
      <!-- Mock bars -->
      <rect x="330" y="580" width="30" height="60" rx="4" fill="#4f46e5" />
      <rect x="390" y="500" width="30" height="140" rx="4" fill="#4f46e5" />
      <rect x="450" y="420" width="30" height="220" rx="4" fill="#4f46e5" />
      <rect x="510" y="380" width="30" height="260" rx="4" fill="#6366f1" />
      <rect x="570" y="440" width="30" height="200" rx="4" fill="#4f46e5" />
      <rect x="630" y="470" width="30" height="170" rx="4" fill="#4f46e5" />
      <rect x="690" y="520" width="30" height="120" rx="4" fill="#4f46e5" />
      <rect x="750" y="590" width="30" height="50" rx="4" fill="#4f46e5" />
      
      <!-- Recent Visitors Panel -->
      <rect x="975" y="244" width="265" height="440" rx="16" fill="#0f172a" stroke="#1e293b" />
      <text x="1000" y="280" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="bold" font-size="16">Live Check-ins</text>
      <circle cx="1015" cy="325" r="14" fill="#312e81" />
      <text x="1040" y="330" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12">Rahul Gupta</text>
      <circle cx="1015" cy="375" r="14" fill="#065f46" />
      <text x="1040" y="380" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12">Elena Rostova</text>
      <circle cx="1015" cy="425" r="14" fill="#312e81" />
      <text x="1040" y="430" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12">Aksh Kanani</text>
    </svg>
  `);
  await sharp(wideSvg).resize(1280, 720).png().toFile(path.join(ICONS_DIR, "screenshot-wide.png"));

  // Narrow Screenshot (750x1334) Mobile/Kiosk View
  const narrowSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="750" height="1334" viewBox="0 0 750 1334">
      <rect width="750" height="1334" fill="#080c14" />
      <!-- Header -->
      <rect x="30" y="40" width="690" height="100" rx="24" fill="#0f172a" stroke="#1e293b" />
      <rect x="55" y="65" width="50" height="50" rx="12" fill="#4f46e5" />
      <text x="120" y="98" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="bold" font-size="24">ENTRIVO SELF-KIOSK</text>
      
      <!-- Kiosk Welcome Card -->
      <rect x="40" y="180" width="670" height="500" rx="32" fill="#0f172a" stroke="#312e81" stroke-width="2" />
      <circle cx="375" cy="320" r="70" fill="#312e81" opacity="0.6" />
      <path d="M375 280 L415 300 C415 340 375 370 375 370 C375 370 335 340 335 300 Z" fill="#6366f1" />
      <text x="375" y="440" fill="#ffffff" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="32">Welcome to Entrivo</text>
      <text x="375" y="480" fill="#94a3b8" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18">Touchless Guest &amp; Visitor Check-In</text>
      
      <!-- Option A: Scan QR -->
      <rect x="40" y="720" width="670" height="180" rx="24" fill="#1e1b4b" stroke="#6366f1" stroke-width="2" />
      <text x="80" y="780" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="bold" font-size="24">I Have an Invitation QR Pass</text>
      <text x="80" y="820" fill="#c7d2fe" font-family="system-ui, sans-serif" font-size="16">Scan your pass or type token code to print badge instantly</text>
      <text x="80" y="860" fill="#a5b4fc" font-family="system-ui, sans-serif" font-weight="bold" font-size="18">Scan Now →</text>
      
      <!-- Option B: Walk-In -->
      <rect x="40" y="930" width="670" height="180" rx="24" fill="#083344" stroke="#06b6d4" stroke-width="2" />
      <text x="80" y="990" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="bold" font-size="24">I am a Walk-In Visitor</text>
      <text x="80" y="1030" fill="#a5f3fc" font-family="system-ui, sans-serif" font-size="16">Register on touchscreen, select meeting host, take photo</text>
      <text x="80" y="1070" fill="#67e8f9" font-family="system-ui, sans-serif" font-weight="bold" font-size="18">Register Entry →</text>
      
      <!-- Footer -->
      <text x="375" y="1250" fill="#64748b" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14">Concierge Desk: Touch assistance if needed</text>
    </svg>
  `);
  await sharp(narrowSvg).resize(750, 1334).png().toFile(path.join(ICONS_DIR, "screenshot-mobile.png"));

  console.log("PWA icons, shortcuts, and screenshots generated successfully!");
}

generateAssets().catch((err) => {
  console.error("Failed to generate PWA assets:", err);
  process.exit(1);
});

