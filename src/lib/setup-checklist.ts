export interface SetupChecklistState {
  organizationProfile: boolean;
  timezone: boolean;
  offices: boolean;
  floors: boolean;
  zones: boolean;
  visitorTypes: boolean;
  hosts: boolean;
  ndaTemplate: boolean;
  emailChannel: boolean;
  pairedKiosk: boolean;
  selfCheckInPoint: boolean;
  musterPoints: boolean;
}

export interface SetupChecklistItem {
  key: keyof SetupChecklistState;
  title: string;
  href: string;
}

export const setupChecklistItems: SetupChecklistItem[] = [
  { key: "organizationProfile", title: "Complete organization profile", href: "/organization" },
  { key: "timezone", title: "Set organization timezone", href: "/organization" },
  { key: "offices", title: "Add an office", href: "/organization" },
  { key: "floors", title: "Add floors", href: "/organization" },
  { key: "zones", title: "Add security zones", href: "/organization" },
  { key: "visitorTypes", title: "Configure visitor types", href: "/settings" },
  { key: "hosts", title: "Add host employees", href: "/employees" },
  { key: "ndaTemplate", title: "Configure an NDA template", href: "/organization" },
  { key: "emailChannel", title: "Verify email notifications", href: "/integrations" },
  { key: "pairedKiosk", title: "Pair a check-in kiosk", href: "/settings" },
  { key: "selfCheckInPoint", title: "Configure a self check-in point", href: "/self-checkin/points" },
  { key: "musterPoints", title: "Add muster points", href: "/muster" },
];

export function buildSetupChecklist(state: SetupChecklistState) {
  const steps = setupChecklistItems.map((item) => ({
    ...item,
    complete: state[item.key],
  }));
  const completed = steps.filter((step) => step.complete).length;

  return {
    steps,
    completed,
    total: steps.length,
    progress: steps.length === 0 ? 100 : Math.round((completed / steps.length) * 100),
  };
}
