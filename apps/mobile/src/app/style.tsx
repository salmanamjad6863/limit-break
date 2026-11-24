import { heroes, type Cosmetic } from '@lb/content';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { HunterSigil, ProfilePicture, useMyLook, useProfilePhoto, type LookItem } from '@/features/avatar';
import { useMe } from '@/features/progression';
import { useTheme } from '@/theme';
import { Bar, Button, Icon, Page, Pill, PressableScale, ScreenHeader, Text } from '@/ui';
import { Segmented } from '@/ui/form';
import { FrameRing, type FrameStyle } from '@/ui/fx';

const RARITY: Record<Cosmetic['rarity'], { label: string; color: string }> = {
  common: { label: 'Common', color: '#9CA3AF' },
  rare: { label: 'Rare', color: '#38BDF8' },
  epic: { label: 'Epic', color: '#A78BFA' },
  legendary: { label: 'Legendary', color: '#FBBF24' },
};
const ORDER: Cosmetic['rarity'][] = ['common', 'rare', 'epic', 'legendary'];
const NONE = '__none';

/** Frames and auras for the hunter sigil: preview anything, equip what you own, earn or buy the rest. */
export default function StyleScreen() {
  const { c, spacing, radius } = useTheme();
  const me = useMe().data;
  const look = useMyLook();
  const params = useLocalSearchParams<{ slot?: string; item?: string }>();
  const [slot, setSlot] = useState<'frame' | 'aura'>(params.slot === 'aura' ? 'aura' : 'frame');
  const [selected, setSelected] = useState<string | null>(params.item ?? null);

  const hero = heroes.find((h) => h.id === me?.heroId) ?? heroes[0]!;
  const initial = (me?.hunterName ?? 'H').charAt(0).toUpperCase();
  const list = look.items
    .filter((x) => x.item.slot === slot)
    .sort((a, b) => Number(b.owned) - Number(a.owned) || ORDER.indexOf(a.item.rarity) - ORDER.indexOf(b.item.rarity));
  const photo = useProfilePhoto((s) => s.photo);
  const noneSelected = selected === NONE;
  const sel = look.items.find((x) => x.item.id === selected && x.item.slot === slot) ?? null;
  const current = slot === 'frame' ? look.frame : look.aura;
  const previewFrame = slot === 'frame' ? (noneSelected ? null : sel ? sel.item : look.frame) : look.frame;
  const previewAura = slot === 'aura' ? (noneSelected ? null : sel ? sel.item : look.aura) : look.aura;

  if (!look.ready) return <Page header={<ScreenHeader title="Style" />}><Text dim>Loading…</Text></Page>;

  const action = (() => {
    if (noneSelected) {
      return current ? <Button label={`Remove ${slot}`} icon="close-circle-outline" variant="secondary" onPress={() => look.equip.mutate({ slot, id: null })} />
        : <Button label={`No ${slot}`} icon="checkmark" disabled onPress={() => {}} />;
    }
    if (!sel) return null;
    const it = sel.item;
    if (sel.equipped) return <Button label="Equipped" icon="checkmark" disabled onPress={() => {}} />;
    if (sel.owned) return <Button label={`Equip ${it.name}`} icon="sparkles" onPress={() => look.equip.mutate({ slot, id: it.id })} />;
    if (sel.lockedReason) return <Button label={sel.lockedReason} icon="lock-closed" variant="secondary" disabled onPress={() => {}} />;
    const short = look.essence < it.price;
    return (
      <Button label={short ? `Need ${it.price - look.essence} more Essence` : `Buy for ${it.price} Essence`} icon="diamond-outline" disabled={short} loading={look.buy.isPending}
        onPress={() => look.buy.mutate(it.id, { onSuccess: () => look.equip.mutate({ slot, id: it.id }) })} />
    );
  })();

  return (
    <Page header={<ScreenHeader title="Style" />} footer={action}>
      {/* live preview */}
      <View style={{ alignItems: 'center', gap: spacing[2] }}>
        {slot === 'frame'
          ? <ProfilePicture size={170} photo={photo} color={hero.accent} initial={initial} frame={previewFrame} />
          : <HunterSigil size={190} color={hero.accent} initial={initial} aura={previewAura} />}
        <Text variant="headline">{noneSelected ? `No ${slot}` : sel ? sel.item.name : (slot === 'frame' ? look.frame?.name ?? 'No frame' : look.aura?.name ?? 'No aura')}</Text>
        <Text variant="caption" muted>{slot === 'frame' ? 'Frames go around your profile picture.' : 'Auras glow around your hunter sigil.'}</Text>
        {sel ? <Text variant="caption" color={RARITY[sel.item.rarity].color}>{`${RARITY[sel.item.rarity].label} ${slot}`}</Text> : null}
        <Pill icon="diamond-outline" label={`${look.essence} Essence`} color={c.mana} />
        <Text variant="caption" muted style={{ textAlign: 'center' }}>Essence comes from workouts and achievements. It buys looks only, never XP or stats.</Text>
      </View>

      <Segmented options={[{ value: 'frame', label: 'Frames' }, { value: 'aura', label: 'Auras' }]} value={slot}
        onChange={(v) => { setSlot(v); setSelected(null); }} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing[1] }}>
        <View style={{ width: '33.333%', padding: spacing[1] }}>
          <NoneCell on={noneSelected} equipped={!current} onPress={() => setSelected(NONE)} radius={radius.lg} label={slot === 'frame' ? 'No frame' : 'No aura'} />
        </View>
        {list.map((x) => (
          <View key={x.item.id} style={{ width: '33.333%', padding: spacing[1] }}>
            <Cell x={x} on={selected === x.item.id} heroColor={hero.accent} initial={initial} onPress={() => setSelected(x.item.id)} radius={radius.lg} />
          </View>
        ))}
      </View>
      <Button variant="ghost" size="md" icon="trophy-outline" label="See achievements" onPress={() => router.push('/achievements')} />
    </Page>
  );
}

function Cell({ x, on, heroColor, initial, onPress, radius }: { x: LookItem; on: boolean; heroColor: string; initial: string; onPress: () => void; radius: number }) {
  const { c, spacing } = useTheme();
  const it = x.item;
  const rarity = RARITY[it.rarity];
  const [a, b] = it.colors ?? [heroColor, heroColor];
  const status = x.equipped ? 'Equipped' : x.owned ? 'Owned' : x.lockedReason ? x.lockedReason.replace(/^Earn /, '') : `◆ ${it.price}`;
  return (
    <PressableScale haptic="tap" onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      accessibilityLabel={`${it.name}, ${rarity.label}. ${x.equipped ? 'Equipped' : x.owned ? 'Owned' : x.lockedReason ?? `${it.price} Essence`}`}
      style={{ alignItems: 'center', gap: 6, paddingVertical: spacing[3], paddingHorizontal: spacing[2], borderRadius: radius,
        borderWidth: on ? 1.5 : 1, borderColor: on ? c.accent : x.equipped ? `${c.success}88` : c.border, backgroundColor: on ? `${c.accent}14` : c.surface }}>
      <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center', opacity: x.owned || x.progress == null ? 1 : 0.75 }}>
        {it.slot === 'frame' && it.style && it.colors ? (
          <>
            <View style={{ position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: `${heroColor}22`, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="callout" color={heroColor} style={{ fontFamily: 'Inter_700Bold' }}>{initial}</Text>
            </View>
            <FrameRing style={it.style as FrameStyle} colors={it.colors} size={64} />
          </>
        ) : (
          // aura swatch: two soft rings of its colours around the initial (no canvas: cheap in a grid)
          <View style={{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: `${b}33`, borderWidth: 2, borderColor: `${a}AA` }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: `${a}40` }}>
              <Text variant="callout" color="#FFFFFF" style={{ fontFamily: 'Inter_700Bold' }}>{initial}</Text>
            </View>
          </View>
        )}
        {!x.owned ? (
          <View style={{ position: 'absolute', right: 0, bottom: 0, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border }}>
            <Icon name={x.lockedReason ? 'lock-closed' : 'diamond-outline'} size={11} color={x.lockedReason ? c.textMuted : c.mana} />
          </View>
        ) : null}
      </View>
      <Text variant="caption" numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>{it.name}</Text>
      <Text variant="micro" color={rarity.color}>{rarity.label}</Text>
      <Text variant="micro" muted numberOfLines={2} style={{ textAlign: 'center' }}>{status}</Text>
      {!x.owned && x.progress != null ? <View style={{ width: '100%' }}><Bar ratio={x.progress} height={3} /></View> : null}
    </PressableScale>
  );
}

function NoneCell({ on, equipped, onPress, radius, label }: { on: boolean; equipped: boolean; onPress: () => void; radius: number; label: string }) {
  const { c, spacing } = useTheme();
  return (
    <PressableScale haptic="tap" onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${label}${equipped ? ', equipped' : ''}`}
      style={{ alignItems: 'center', gap: 6, paddingVertical: spacing[3], paddingHorizontal: spacing[2], borderRadius: radius,
        borderWidth: on ? 1.5 : 1, borderColor: on ? c.accent : equipped ? `${c.success}88` : c.border, backgroundColor: on ? `${c.accent}14` : c.surface }}>
      <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.textMuted }}>
          <Icon name="ban-outline" size={22} color={c.textMuted} />
        </View>
      </View>
      <Text variant="caption" style={{ fontFamily: 'Inter_600SemiBold' }}>None</Text>
      <Text variant="micro" muted>{equipped ? 'Equipped' : 'Plain'}</Text>
    </PressableScale>
  );
}
