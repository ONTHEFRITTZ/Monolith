import { useMemo } from "react";
import type { OnboardingState, SponsorshipPlanId } from "./types";
import styles from "./OnboardingFlow.module.css";

interface OnboardingStepGasProps {
  state: OnboardingState;
  onPlanSelect: (plan: SponsorshipPlanId) => Promise<void>;
  onContinue: () => void;
  onBack: () => void;
  onTermsChange: (value: boolean) => void;
  isProcessing: boolean;
}

const PLAN_COPY: Record<
  SponsorshipPlanId,
  { title: string; description: string; highlight: string; badge?: string }
> = {
  starter: {
    title: "Starter (Sponsored)",
    description: "Monolith pays gas for up to $50 in monthly intents. Ideal for new accounts.",
    highlight: "Covers most retail flow. Upgrade when you exceed the free tier.",
    badge: "Recommended",
  },
  pro: {
    title: "Pro (Sponsored)",
    description: "Higher limits and priority routing with $250 sponsorship each month.",
    highlight: "Great for merchant accounts and institutional desks.",
  },
  self: {
    title: "Self-Managed",
    description: "Use your own funds for gas. We intervene only for stuck transactions.",
    highlight: "Best when you already have an operational paymaster setup.",
  },
};

export function OnboardingStepGas({
  state,
  onPlanSelect,
  onContinue,
  onBack,
  onTermsChange,
  isProcessing,
}: OnboardingStepGasProps) {
  const estimate = useMemo(
    () => state.sponsorshipEstimates[state.sponsorshipPlan],
    [state.sponsorshipEstimates, state.sponsorshipPlan]
  );

  const handlePlanClick = async (plan: SponsorshipPlanId) => {
    if (state.sponsorshipPlan === plan && estimate) {
      return;
    }
    await onPlanSelect(plan);
  };

  return (
    <div className={styles.stepPanel}>
      <p className={styles.stepDescription}>
        Decide how gas fees should be handled for your smart account. You can change plans later in
        settings as your usage evolves.
      </p>

      <div className={styles.planGrid}>
        {(Object.keys(PLAN_COPY) as SponsorshipPlanId[]).map((planId) => {
          const plan = PLAN_COPY[planId];
          const isActive = state.sponsorshipPlan === planId;

          return (
            <button
              key={planId}
              type="button"
              className={`${styles.planCard} ${isActive ? styles.planCardActive : ""}`}
              onClick={() => handlePlanClick(planId)}
              disabled={isProcessing}
            >
              <div className={styles.planHeader}>
                <h3>{plan.title}</h3>
                {plan.badge ? <span className={styles.badge}>{plan.badge}</span> : null}
              </div>
              <p>{plan.description}</p>
              <p className={styles.planHighlight}>{plan.highlight}</p>
              {isActive && estimate ? (
                <dl className={styles.planDetails}>
                  <div>
                    <dt>Allowance</dt>
                    <dd>
                      ${estimate.monthlyAllowance} / month sponsored gas · {estimate.currency}
                    </dd>
                  </div>
                  <div>
                    <dt>Notes</dt>
                    <dd>{estimate.note}</dd>
                  </div>
                </dl>
              ) : null}
            </button>
          );
        })}
      </div>

      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={state.termsAccepted}
          onChange={(event) => onTermsChange(event.target.checked)}
          disabled={isProcessing}
          required
        />
        <span>
          I accept the gas sponsorship terms and understand usage may be reviewed for abuse.
        </span>
      </label>

      <div className={styles.footerActions}>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={onBack}
          disabled={isProcessing}
        >
          Back
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onContinue}
          disabled={isProcessing || !state.termsAccepted}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
