import styles from "./BridgeFlow.module.css";
import type { SponsorshipPlanId } from "../onboarding/types";

interface TierDefinition {
  id: "starter" | "pro" | "self";
  name: string;
  price: string;
  sponsorship: string;
  api: string;
  badge?: string;
  services: readonly string[];
  ideal: string;
}

const TIERS: readonly TierDefinition[] = [
  {
    id: "starter",
    name: "Starter (Sponsored)",
    price: "$0 / mo",
    sponsorship: "$50 gas sponsorship (covers most retail flow)",
    api: "No API access",
    badge: "Recommended",
    services: [
      "Alchemy smart account onboarding",
      "Monolith paymaster coverage up to cap",
      "Standard bridge routing (0.06%-0.12%)",
      "Email support and incident recovery",
    ],
    ideal: "New wallets, retail users, pilots",
  },
  {
    id: "pro",
    name: "Pro (Sponsored)",
    price: "$149 / mo",
    sponsorship: "$250 gas sponsorship plus on-demand top-ups",
    api: "Yes - authenticated bridge API and webhooks",
    badge: undefined,
    services: [
      "Priority routing and dedicated RPC slice",
      "99.5% SLA with concierge support",
      "Analytics dashboard and usage alerts",
      "Programmable team wallets and recovery desk",
    ],
    ideal: "Merchants, aggregators, trading desks",
  },
  {
    id: "self",
    name: "Self-Managed",
    price: "$39 platform fee + gas",
    sponsorship: "Bring-your-own paymaster",
    api: "Optional add-on ($49) as needs grow",
    badge: undefined,
    services: [
      "Health monitoring and stuck-intent rescue",
      "Access to routing marketplace",
      "Compliance-ready logging and exports",
    ],
    ideal: "Teams with existing paymaster infra",
  },
] as const;

interface PlansPricingModalProps {
  open: boolean;
  onClose: () => void;
  currentPlan?: SponsorshipPlanId;
  onSelectPlan?: (plan: SponsorshipPlanId) => void;
  isUpdating?: boolean;
}

export function PlansPricingModal({
  open,
  onClose,
  currentPlan,
  onSelectPlan,
  isUpdating = false,
}: PlansPricingModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalPanel}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Plans &amp; pricing</h2>
            <p className={styles.modalSubtitle}>
              Sponsorship tiers align with how deeply you need Monolith to cover gas, routing, and
              automation. Start free, graduate to Pro when you are ready for higher throughput.
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>

        <table className={styles.pricingTable}>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Monthly cost</th>
              <th>Sponsorship &amp; API</th>
              <th>Key services</th>
              <th>Best for</th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map((tier) => {
              const isCurrent = currentPlan === tier.id;
              return (
                <tr key={tier.id}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <strong>{tier.name}</strong>
                      {tier.badge ? <span className={styles.badge}>{tier.badge}</span> : null}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span>{tier.price}</span>
                      <span style={{ color: "rgba(226,220,255,0.7)", fontSize: 12 }}>
                        {tier.sponsorship}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span>{tier.api}</span>
                    </div>
                  </td>
                  <td>
                    <ul className={styles.featureList}>
                      {tier.services.map((service) => (
                        <li key={service}>{service}</li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <span>{tier.ideal}</span>
                      {onSelectPlan ? (
                        <button
                          type="button"
                          className={styles.primaryButton}
                          disabled={isCurrent || isUpdating}
                          onClick={() => onSelectPlan(tier.id)}
                        >
                          {isCurrent ? "Current plan" : "Choose plan"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className={styles.modalSubtitle}>*Subject to change</p>
      </div>
    </div>
  );
}
