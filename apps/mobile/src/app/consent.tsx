import { CONSENT_VERSION, type MeResponse } from '@lb/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useAccountActions } from '@/features/account';
import { ConsentTerms } from '@/features/onboarding/steps';
import { progressionKeys } from '@/features/progression/keys';
import { api, unwrap } from '@/lib/api';
import { useTheme } from '@/theme';
import { Button, Page, Text } from '@/ui';

/**
 * Shown to existing hunters when the privacy/health-data terms change (CONSENT_VERSION), before the app.
 * GDPR Art. 9: health data needs explicit, versioned consent. Declining leaves two honest choices:
 * export the data, or delete the account.
 */
export default function ConsentScreen() {
  const { c, spacing } = useTheme();
  const qc = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [declined, setDeclined] = useState(false);
  const { exportData, deleteAccount } = useAccountActions();

  const accept = useMutation({
    mutationFn: async () => unwrap(await api.me.consent.$post({ json: { version: CONSENT_VERSION } })),
    onSuccess: () => {
      // Update the cached profile at once so the guard opens the app without waiting for a refetch.
      qc.setQueryData<MeResponse>(progressionKeys.me(), (m) => (m ? { ...m, consentVersion: CONSENT_VERSION } : m));
      void qc.invalidateQueries({ queryKey: progressionKeys.me() });
    },
  });

  return (
    <Page>
      <View style={{ gap: spacing[2], marginTop: spacing[6] }}>
        <Text variant="label" color={c.accentGlow}>SYSTEM UPDATE</Text>
        <Text variant="title">We updated our terms</Text>
        <Text dim>Please review how LIMITBREAK uses your data. Nothing changes about your progress.</Text>
      </View>

      <ConsentTerms checked={checked} onToggle={() => setChecked((v) => !v)} />

      <Button label="Continue" onPress={() => accept.mutate()} disabled={!checked} loading={accept.isPending} />
      {accept.isError ? <Text variant="caption" color={c.warning}>Couldn’t save. Check your connection and try again.</Text> : null}

      {!declined ? (
        <Button variant="ghost" label="I don’t agree" onPress={() => setDeclined(true)} />
      ) : (
        <View style={{ gap: spacing[2] }}>
          <Text variant="callout" dim>Without this consent the app can’t build your plan. You can download your data or delete your account.</Text>
          <Button variant="secondary" size="md" icon="download-outline" label="Export my data" loading={exportData.isPending} onPress={() => exportData.mutate()} />
          <Button variant="ghost" size="md" icon="trash-outline" label="Delete my account" loading={deleteAccount.isPending} onPress={() => deleteAccount.mutate()} />
          <Button variant="ghost" size="md" label="Back" onPress={() => setDeclined(false)} />
        </View>
      )}
    </Page>
  );
}
