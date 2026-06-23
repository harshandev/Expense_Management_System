export const TIERS = {
  basic: {
    label: "Basic",
    whatsapp_slots: 3,
    dashboard_admins: 1,
    dashboard_viewers: 2,
    features: { ai_report: false, nl_search: false, anomaly_alerts: true },
  },
  growth: {
    label: "Growth",
    whatsapp_slots: 8,
    dashboard_admins: 2,
    dashboard_viewers: 5,
    features: { ai_report: true, nl_search: true, anomaly_alerts: true },
  },
  business: {
    label: "Business",
    whatsapp_slots: 20,
    dashboard_admins: 5,
    dashboard_viewers: 15,
    features: { ai_report: true, nl_search: true, anomaly_alerts: true },
  },
  enterprise: {
    label: "Enterprise",
    whatsapp_slots: -1,
    dashboard_admins: -1,
    dashboard_viewers: -1,
    features: { ai_report: true, nl_search: true, anomaly_alerts: true },
  },
} as const;

export type Tier = keyof typeof TIERS;

export function getLimit(
  tier: Tier,
  key: "whatsapp_slots" | "dashboard_admins" | "dashboard_viewers"
): number {
  return TIERS[tier][key];
}

export function canAddMore(
  tier: Tier,
  key: "whatsapp_slots" | "dashboard_viewers",
  current: number
): boolean {
  const limit = TIERS[tier][key];
  return limit === -1 || current < limit;
}

export function limitLabel(n: number): string {
  return n === -1 ? "∞" : String(n);
}
