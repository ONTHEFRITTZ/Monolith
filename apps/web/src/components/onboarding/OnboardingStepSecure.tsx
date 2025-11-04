import { useMemo, useState } from "react";
import type { OnboardingState } from "./types";
import styles from "./OnboardingFlow.module.css";

interface OnboardingStepSecureProps {
  state: OnboardingState;
  onContinue: (payload: {
    contacts: string[];
    passkeyEnrolled: boolean;
    threshold: number;
  }) => Promise<void>;
  onBack: () => void;
  isProcessing: boolean;
}

export function OnboardingStepSecure({
  state,
  onContinue,
  onBack,
  isProcessing,
}: OnboardingStepSecureProps) {
  const defaultContacts = useMemo(() => {
    if (state.contacts.length > 0) {
      return state.contacts.map((contact) => contact.value);
    }
    return ["", ""];
  }, [state.contacts]);

  const [contacts, setContacts] = useState<string[]>(defaultContacts);
  const [threshold, setThreshold] = useState(state.recoveryThreshold);
  const [passkey, setPasskey] = useState(state.passkeyEnrolled);
  const [localError, setLocalError] = useState<string>();

  const handleAddContact = () => {
    setContacts((prev) => [...prev, ""]);
  };

  const handleContactChange = (value: string, index: number) => {
    setContacts((prev) => prev.map((contact, i) => (i === index ? value : contact)));
  };

  const handleContinue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(undefined);

    const filtered = contacts.filter((contact) => contact.trim().length > 0);

    if (filtered.length === 0) {
      setLocalError("Add at least one recovery contact email.");
      return;
    }

    if (threshold > filtered.length) {
      setLocalError("Threshold cannot exceed the number of recovery contacts.");
      return;
    }

    await onContinue({
      contacts: filtered,
      passkeyEnrolled: passkey,
      threshold,
    });
  };

  return (
    <form className={styles.stepPanel} onSubmit={handleContinue}>
      <p className={styles.stepDescription}>
        Recovery contacts help you regain access to your smart account if you lose devices. We
        recommend listing trusted teammates or a backup email.
      </p>

      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Recovery contacts</span>
        {contacts.map((contact, index) => (
          <input
            key={`contact-${index}`}
            type="email"
            placeholder="guardian@example.com"
            value={contact}
            onChange={(event) => handleContactChange(event.target.value, index)}
            disabled={isProcessing}
            className={styles.input}
          />
        ))}
        <button
          type="button"
          onClick={handleAddContact}
          className={styles.ghostButton}
          disabled={isProcessing || contacts.length >= 5}
        >
          Add another contact
        </button>
      </div>

      <label className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Recovery threshold</span>
        <select
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
          disabled={isProcessing}
          className={styles.select}
        >
          {Array.from({ length: Math.max(contacts.length, 2) }, (_, index) => index + 1).map(
            (value) => (
              <option key={value} value={value}>
                {value}-of-{Math.max(contacts.length, 1)} approvals required
              </option>
            )
          )}
        </select>
      </label>

      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={passkey}
          onChange={(event) => setPasskey(event.target.checked)}
          disabled={isProcessing}
        />
        <span>Enable passkey login (recommended for passwordless fallback).</span>
      </label>

      {localError ? <p className={styles.errorInline}>{localError}</p> : null}

      <div className={styles.footerActions}>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={onBack}
          disabled={isProcessing}
        >
          Back
        </button>
        <button type="submit" className={styles.primaryButton} disabled={isProcessing}>
          {isProcessing ? "Saving..." : "Continue"}
        </button>
      </div>
    </form>
  );
}
