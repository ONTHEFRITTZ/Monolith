import styles from "./BridgeFlow.module.css";

const TIERS = [
  {
    id: "starter",
    name: "Starter (Sponsored)",
    price: "$0 / mo",
    sponsorship: "$50 gas sponsorship (≈ retail flow)",
    api: "No API access",
    badge: "Recommended",
    services: [
      "Alchemy smart account onboarding",
      "Mon-olith paymaster coverage up to cap",
      "Standard bridge routing (6–12 bps)",
      "Email support & incident recovery",
    ],
    ideal: "New wallets, retail users, pilots",
  },
  {
    id: "pro",
    name: "Pro (Sponsored)",
    price: "$149 / mo",
    sponsorship: "$250 gas sponsorship + top-up packs",
    api: "Yes — authenticated bridge API & webhooks",
    services: [
      "Priority routing & dedicated RPC slice",
      "99.5% SLA with concierge support",
      "Analytics dashboard & usage alerts",
      "Programmable team wallets & recovery desk",
    ],
    ideal: "Merchants, aggregators, trading desks",
  },
  {
    id: "self",
    name: "Self-Managed",
    price: "$39 platform fee + gas",
    sponsorship: "Bring-your-own paymaster",
    api: "Optional add-on ($49) as needs grow",
    services: [
      "Health monitoring & stuck-intent rescue",
      "Access to routing marketplace",
      "Compliance-ready logging & exports",
    ],
    ideal: "Teams with existing paymaster infra",
  },
];

interface PlansPricingModalProps {
  open: boolean;
  onClose: () => void;
}

export function PlansPricingModal({ open, onClose }: PlansPricingModalProps) {
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
              Sponsorship tiers align with how deeply you need Mon-olith to cover gas, routing, and
              automation. Start free, graduate to Pro when you’re ready for higher throughput.
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
            {TIERS.map((tier) => (
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
                <td>{tier.ideal}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className={styles.modalSubtitle}>
          Expansion roadmap: fiat off-ramps, compliance tooling, analytics APIs, and a partner
          routing marketplace that can share revenue with sponsored wallets. Starter users can also
          opt-in to curated insights so we can rebate fees while aggregating anonymised flow data.
        </p>
      </div>
    </div>
  );
}
