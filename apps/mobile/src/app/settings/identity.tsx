import { heroes } from '@lb/content';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useUpdateIdentity } from '@/features/settings/api';
import { useMe } from '@/features/progression';
import { useTheme } from '@/theme';
import { Button, Page, PressableScale, ScreenHeader, Text } from '@/ui';
import { TextField } from '@/ui/form';
import { HeroEmblem } from '@/ui/fx';

/** Rename + pick a new sigil. Class and stats stay on this hunter. */
export default function IdentitySettings() {
  const { c, spacing } = useTheme();
  const { data: me } = useMe();
  const save = useUpdateIdentity();
  const [name, setName] = useState(me?.hunterName ?? '');
  const [heroId, setHeroId] = useState(me?.heroId ?? heroes[0]!.id);
  const valid = name.trim().length >= 2 && name.trim().length <= 20;
  const current = heroes.find((h) => h.id === heroId) ?? heroes[0]!;
  const classLabel = (me?.heroClass ?? current.heroClass).toLowerCase().replace(/^\w/, (x) => x.toUpperCase());

  return (
    <Page
      accent={current.accent}
      header={<ScreenHeader title="Name & sigil" />}
      footer={
        <Button
          label="Save"
          icon="checkmark"
          disabled={!valid}
          loading={save.isPending}
          onPress={() => {
            save.mutate(
              { hunterName: name.trim(), heroId },
              { onSuccess: () => router.back() },
            );
          }}
        />
      }
    >
      <Text variant="callout" dim>
        Your sigil is cosmetic. Class ({classLabel}), XP and rank do not change.
      </Text>
      {save.isError ? <Text variant="caption" color={c.warning}>Couldn’t save. Check your connection and try again.</Text> : null}
      <TextField
        label="Hunter name"
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        maxLength={20}
        autoCapitalize="words"
        autoCorrect={false}
      />
      <Text variant="label" dim>Hero sigil</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], justifyContent: 'space-between' }}>
        {heroes.map((h) => {
          const on = heroId === h.id;
          return (
            <PressableScale
              key={h.id}
              haptic="tap"
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${h.name}, ${h.epithet}`}
              onPress={() => setHeroId(h.id)}
              style={{
                width: '47%',
                alignItems: 'center',
                paddingVertical: spacing[3],
                borderRadius: 16,
                borderWidth: 1.5,
                borderColor: on ? h.accent : 'rgba(255,255,255,0.07)',
                backgroundColor: on ? `${h.accent}14` : '#121219',
              }}
            >
              <HeroEmblem size={88} color={h.accent} initial={h.name.charAt(0)} />
              <Text variant="heading" style={{ marginTop: spacing[1] }}>{h.name}</Text>
              <Text variant="caption" color={h.accent}>{h.epithet}</Text>
            </PressableScale>
          );
        })}
      </View>
    </Page>
  );
}
