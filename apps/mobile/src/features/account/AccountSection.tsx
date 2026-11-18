import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSession } from '@/features/session';
import { useAnalyticsConsent } from '@/lib/analytics';
import { env } from '@/lib/env';
import { useTheme } from '@/theme';
import { Button, Card, Text } from '@/ui';
import { TextField } from '@/ui/form';
import { useAccountActions } from '@/features/account';

/** Export, sign out, delete — lives in Settings, not on the hunter card. */
export function AccountSection() {
  const { c, spacing } = useTheme();
  const { exportData, deleteAccount, signOutHere, signOutEverywhere, unsynced } = useAccountActions();
  const session = useSession();
  const [confirmOut, setConfirmOut] = useState(false);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const consent = useAnalyticsConsent((s) => s.consent);
  const setConsent = useAnalyticsConsent((s) => s.set);
  return (
    <Card>
      <Text variant="callout" dim>Your training, nutrition and progress belong to you.</Text>
      {env.posthogKey ? (
        <Button
          variant="ghost"
          size="md"
          icon={consent === 'granted' ? 'analytics' : 'analytics-outline'}
          label={consent === 'granted' ? 'Anonymous usage stats: on (tap to turn off)' : 'Anonymous usage stats: off (tap to turn on)'}
          onPress={() => setConsent(consent === 'granted' ? 'denied' : 'granted')}
        />
      ) : null}
      <Button variant="secondary" size="md" icon="download-outline" label="Export my data" loading={exportData.isPending} onPress={() => exportData.mutate()} />
      {exportData.isError ? <Text variant="caption" color={c.warning}>Export failed. Check your connection and try again.</Text> : null}
      {session.status === 'signedIn' && session.isGuest ? (
        <View style={{ gap: spacing[2] }}>
          <Text variant="callout" color={c.warning}>You’re training as a guest. Your progress lives only on this account until you save it with an email.</Text>
          <Button size="md" icon="shield-checkmark-outline" label="Save your progress" onPress={() => router.push('/sign-in?mode=save')} />
          <Button variant="ghost" size="md" icon="log-in-outline" label="Sign in to another account" onPress={() => router.push('/sign-in?mode=signin')} />
        </View>
      ) : null}
      {session.status === 'signedIn' && !session.isGuest ? (
        <View style={{ gap: spacing[2] }}>
          <Text variant="caption" dim>{`Signed in as ${session.email ?? 'your account'}`}</Text>
          {!confirmOut ? (
            <Button variant="secondary" size="md" icon="log-out-outline" label="Sign out"
              onPress={() => (unsynced() ? setConfirmOut(true) : signOutHere.mutate())} loading={signOutHere.isPending} />
          ) : (
            <>
              <Text variant="callout" color={c.warning}>Some changes haven’t synced yet. Signing out now removes them from this phone. Connect to the internet first to keep them.</Text>
              <Button size="md" icon="log-out-outline" label="Sign out anyway" loading={signOutHere.isPending} onPress={() => signOutHere.mutate()} />
              <Button variant="ghost" size="md" label="Cancel" onPress={() => setConfirmOut(false)} />
            </>
          )}
          <Button variant="ghost" size="md" icon="phone-portrait-outline" label="Sign out of all devices" loading={signOutEverywhere.isPending} onPress={() => signOutEverywhere.mutate()} />
          {signOutEverywhere.isError ? <Text variant="caption" color={c.warning}>{(signOutEverywhere.error as Error).message}</Text> : null}
        </View>
      ) : null}
      {!open ? (
        <Button variant="ghost" size="md" icon="trash-outline" label="Delete account" onPress={() => setOpen(true)} />
      ) : (
        <View style={{ gap: spacing[2] }}>
          <Text variant="callout" color={c.danger}>This permanently deletes your account and everything in it: workouts, nutrition, ranks, XP and titles. It can’t be undone.</Text>
          <TextField label="Type DELETE to confirm" value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} />
          <Button size="md" icon="trash" label="Delete my account forever" disabled={typed.trim() !== 'DELETE'} loading={deleteAccount.isPending} onPress={() => deleteAccount.mutate()} />
          <Button variant="ghost" size="md" label="Cancel" onPress={() => { setOpen(false); setTyped(''); }} />
          {deleteAccount.isError ? <Text variant="caption" color={c.warning}>Couldn’t finish. Your request is safe to retry.</Text> : null}
        </View>
      )}
    </Card>
  );
}
