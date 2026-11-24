import { achievementById, heroes } from '@lb/content';
import { levelProgress, powerLevel, tierName } from '@lb/engine';
import { rankColor, statColors } from '@lb/tokens';
import { router } from 'expo-router';
import { Alert, View } from 'react-native';
import { RankCarousel, useMe, useProgression, useVerifyTrial } from '@/features/progression';
import { exerciseName } from '@/features/training';
import { useTheme } from '@/theme';
import { Appear, Bar, Button, Card, CountUp, Icon, Page, Pill, PressableScale, ScreenHeader, SectionHeader, SettingsGear, Text } from '@/ui';
import { AchievementBadge, RankBadge } from '@/ui/fx';
import { badgeIcon, recentUnlocks, tierCounts, useAchievements } from '@/features/achievements';
import { pickProfilePhoto, ProfilePicture, useMyLook, useProfilePhoto } from '@/features/avatar';

const STAT_INFO: Record<string, { name: string; raise: string }> = {
  STR: { name: 'Strength', raise: 'Log heavier lifts or reach harder calisthenics progressions.' },
  AGI: { name: 'Agility', raise: 'Zone 2 and interval work improve it; re-test to update.' },
  END: { name: 'Endurance', raise: 'Re-test push-ups, plank and squats, and keep weekly volume up.' },
  VIT: { name: 'Vitality', raise: 'Hit your protein target and sleep 7–9 hours.' },
  SPI: { name: 'Spirit', raise: 'Complete your planned sessions and Daily Quests consistently.' },
};

const daysUntil = (iso: string) => Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));

export default function HunterProfile() {
  const { c, spacing, radius } = useTheme();
  const { data: me } = useMe();
  const { data: prog } = useProgression();
  const { data: ach } = useAchievements();
  const look = useMyLook();
  const photo = useProfilePhoto((s) => s.photo);
  const setPhoto = useProfilePhoto((s) => s.set);
  if (!me?.state || !prog) return <Page header={<ScreenHeader title="Hunter profile" />}><Text dim>Loading…</Text></Page>;

  const hero = heroes.find((h) => h.id === me.heroId) ?? heroes[0]!;
  const lp = levelProgress(me.state.xp);
  const rank = me.state.rank;
  const s = prog.stats as Record<'STR' | 'AGI' | 'END' | 'VIT' | 'SPI', number>;
  const power = powerLevel(s, lp.level);
  const t = prog.trial;
  const maxXp = Math.max(50, ...prog.xpByDay.map((d) => d.xp));

  return (
    <Page accent={hero.accent} header={<ScreenHeader title="Hunter profile" right={<SettingsGear />} />}>
      <Appear index={0}>
        <Card tint={hero.accent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <PressableScale haptic="tap" accessibilityRole="button" accessibilityLabel="Profile picture. Change photo or frame"
              onPress={() => Alert.alert('Profile picture', 'Your photo stays on this phone. In Community, others see your initial in your frame.', [
                { text: 'Choose photo', onPress: () => void pickProfilePhoto('library') },
                { text: 'Take photo', onPress: () => void pickProfilePhoto('camera') },
                ...(photo ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => setPhoto(null) }] : []),
                { text: 'Change frame', onPress: () => router.push('/style?slot=frame') },
                { text: 'Cancel', style: 'cancel' as const },
              ])}>
              <ProfilePicture size={104} photo={photo} color={hero.accent} initial={(me.hunterName ?? 'H').charAt(0).toUpperCase()} frame={look.frame} />
              <View style={{ position: 'absolute', right: 4, bottom: 4, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border }}>
                <Icon name="camera" size={14} color={c.text} />
              </View>
            </PressableScale>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headline">{me.hunterName}</Text>
              {ach?.equippedTitle ? <Text variant="caption" color={c.accentGlow} style={{ fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }}>{ach.equippedTitle.toUpperCase()}</Text> : null}
              <Text variant="caption" color={hero.accent}>{`${hero.epithet} · ${me.heroClass?.toLowerCase().replace(/^\w/, (x) => x.toUpperCase()) ?? ''}`}</Text>
              <View style={{ flexDirection: 'row', gap: spacing[4], marginTop: spacing[1] }}>
                <View><Text variant="caption" muted>Level</Text><CountUp variant="stat" value={lp.level} style={{ fontSize: 26, lineHeight: 30 }} /></View>
                <View><Text variant="caption" muted>Power</Text><CountUp variant="stat" value={power} style={{ fontSize: 26, lineHeight: 30 }} color={c.accentGlow} /></View>
              </View>
            </View>
            <RankBadge rank={rank} size={72} />
          </View>
          <Bar ratio={lp.ratio} height={6} />
          <Text variant="caption" muted>{`${lp.intoLevel.toLocaleString()} / ${lp.needed.toLocaleString()} XP to level ${lp.level + 1}`}</Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <View style={{ flex: 1 }}><Button size="md" variant="secondary" icon="sparkles-outline" label="Style" onPress={() => router.push('/style')} /></View>
            <View style={{ flex: 1 }}><Button size="md" variant="ghost" icon="color-palette-outline" label="Identity" onPress={() => router.push('/settings/identity')} /></View>
          </View>
        </Card>
      </Appear>

      {/* Achievements showcase */}
      {ach ? (
        <Appear index={1} style={{ gap: spacing[3] }}>
          <SectionHeader title="Achievements" action="Trophy case" onAction={() => router.push('/achievements')} />
          <PressableScale haptic="tap" onPress={() => router.push('/achievements')} accessibilityRole="button" accessibilityLabel="Open trophy case">
            <Card>
              {recentUnlocks(ach.progress, 5).length ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {recentUnlocks(ach.progress, 5).map((u) => {
                    const def = achievementById.get(u.id)!;
                    return <AchievementBadge key={`${u.id}:${u.tier}`} tier={tierName(def, u.tier)} icon={badgeIcon(def)} size={56} />;
                  })}
                </View>
              ) : (
                <Text variant="callout" dim>Finish your first workout to earn your first badge.</Text>
              )}
              <Text variant="caption" muted>{`${tierCounts(ach.progress).earned} of ${tierCounts(ach.progress).total} tiers earned · ${ach.titles.length} title${ach.titles.length === 1 ? '' : 's'}`}</Text>
            </Card>
          </PressableScale>
        </Appear>
      ) : null}

      {/* Rank ladder */}
      <Appear index={1} style={{ gap: spacing[3] }}>
        <SectionHeader title="Rank mastery" />
        <RankCarousel rank={rank} level={lp.level} next={t.target ?? null} />
        {t.target ? (
          <Card tint={rankColor[t.target]}>
            <Text variant="heading">{`${t.target}-Rank Trial`}</Text>
            {t.reason === 'level' ? (
              <>
                <Text variant="callout" dim>{`Reach level ${t.levelRequired} to unlock the trial. Rank can't be bought or ground out: you have to pass a real fitness test.`}</Text>
                <Bar ratio={lp.level / (t.levelRequired ?? 1)} height={6} color={rankColor[t.target]} />
                <Text variant="caption" muted>{`Level ${lp.level} of ${t.levelRequired}`}</Text>
              </>
            ) : t.reason === 'cooldown' ? (
              <Text variant="callout" dim>{`Recover and train. You can retry in ${daysUntil(t.retryAt!)} day(s).`}</Text>
            ) : (
              <>
                <Text variant="callout" dim>{`You're eligible. Push-ups or your best lift, a plank, 60-second squats${t.runRequired ? ' and a 2.4 km run' : ' (the run is optional)'}.`}</Text>
                <Button label={`Take the ${t.target}-Rank Trial`} icon="shield-checkmark" onPress={() => router.push('/trial')} />
              </>
            )}
          </Card>
        ) : null}
      </Appear>

      {/* True Stats */}
      <Appear index={2} style={{ gap: spacing[3] }}>
        <SectionHeader title="True Stats" />
        <Card>
          {(['STR', 'AGI', 'END', 'VIT', 'SPI'] as const).map((k) => (
            <View key={k} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <Text variant="label" color={statColors[k][0]} style={{ width: 34 }}>{k}</Text>
                <Text variant="callout" style={{ flex: 1 }}>{STAT_INFO[k]!.name}</Text>
                {prog.sources[k] === 'estimated' ? <Pill label="Estimated" /> : <Pill label="Measured" color={c.success} />}
                <Text variant="heading" style={{ width: 42, textAlign: 'right', fontFamily: 'Rajdhani_700Bold', fontSize: 18 }}>{Math.round(s[k] * 10)}</Text>
              </View>
              <Bar ratio={s[k] / 100} height={5} color={statColors[k][0]} />
              <Text variant="caption" muted>{`${prog.details[k]} · ${STAT_INFO[k]!.raise}`}</Text>
            </View>
          ))}
        </Card>
      </Appear>

      {/* XP history */}
      <Appear index={3} style={{ gap: spacing[3] }}>
        <SectionHeader title="XP · last 14 days" />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 96 }} accessibilityLabel="XP per day chart">
            {prog.xpByDay.map((d) => (
              <View key={d.date} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <View style={{ width: '100%', height: `${Math.max(2, (d.xp / maxXp) * 100)}%`, borderRadius: 4, backgroundColor: d.xp ? c.accent : c.track }} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="micro" muted>{prog.xpByDay[0]?.date.slice(5)}</Text>
            <Text variant="micro" muted>{`${prog.xpByDay.reduce((s2, d) => s2 + d.xp, 0).toLocaleString()} XP total`}</Text>
            <Text variant="micro" muted>Today</Text>
          </View>
        </Card>
      </Appear>

      <Appear index={4} style={{ gap: spacing[3] }}>
        <SectionHeader title="Private progress" />
        <Card>
          <Text variant="callout" dim>Measurements, photos, Awakening frame and your weekly debrief. Never shown on ranks or the feed.</Text>
          <Button size="md" variant="secondary" icon="body-outline" label="Open progress" onPress={() => router.push('/progress')} />
          <Button size="md" variant="ghost" icon="sparkles" label="Weekly debrief" onPress={() => router.push('/progress/debrief')} />
        </Card>
      </Appear>

      {/* PRs */}
      <Appear index={5} style={{ gap: spacing[3] }}>
        <SectionHeader title="Personal records" />
        <Card padded={prog.prs.length === 0}>
          {prog.prs.length === 0 ? (
            <Text variant="callout" dim>Beat a previous best on any lift and it shows up here.</Text>
          ) : (
            prog.prs.map((p, i) => (
              <View key={p.exerciseId} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                <Icon name="trophy" size={16} color="#F5C451" />
                <Text variant="callout" style={{ flex: 1 }}>{exerciseName(p.exerciseId)}</Text>
                <Text variant="callout">{`${p.e1rmKg} kg`}</Text>
              </View>
            ))
          )}
        </Card>
      </Appear>

      {prog.attempts.length ? (
        <Appear index={6} style={{ gap: spacing[3] }}>
          <SectionHeader title="Trial history" />
          <Card padded={false}>
            {prog.attempts.map((a, i) => (
              <View key={a.id} style={{ gap: spacing[2], padding: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                  <Icon name={a.passed ? 'checkmark-circle' : 'close-circle'} size={18} color={a.passed ? c.success : c.danger} />
                  <Text variant="callout" style={{ flex: 1 }}>{`${a.target}-Rank Trial`}</Text>
                  <Text variant="caption" muted>{`Score ${a.composite} · ${new Date(a.at).toLocaleDateString()}`}</Text>
                </View>
                {a.verification !== 'none' ? <VerifyRow id={a.id} status={a.verification} note={a.reviewNote} /> : null}
              </View>
            ))}
          </Card>
        </Appear>
      ) : null}
      <View style={{ height: radius.sm }} />
      <Button size="md" variant="secondary" icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
    </Page>
  );
}

/** A/S passes: leaderboard verification status and the video upload (SYSTEMS.md §4.4). */
function VerifyRow({ id, status, note }: { id: string; status: 'required' | 'pending' | 'verified' | 'rejected'; note: string | null }) {
  const { c, spacing } = useTheme();
  const verify = useVerifyTrial();
  const pill = {
    required: { label: 'Not yet on leaderboards', color: c.warning, icon: 'videocam-outline' as const },
    pending: { label: 'Video in review', color: c.mana, icon: 'time-outline' as const },
    verified: { label: 'Verified', color: c.success, icon: 'shield-checkmark' as const },
    rejected: { label: 'Needs a new video', color: c.danger, icon: 'alert-circle-outline' as const },
  }[status];
  return (
    <View style={{ gap: spacing[2] }}>
      <Pill icon={pill.icon} label={pill.label} color={pill.color} />
      {status === 'rejected' && note ? <Text variant="caption" color={c.textDim}>{`Reviewer: ${note}`}</Text> : null}
      {status === 'required' || status === 'rejected' ? (
        <>
          <Text variant="caption" muted>Your rank is yours. To appear on A/S leaderboards, upload one uncut video of the trial (under 3 min). A moderator checks form and counts.</Text>
          <Button variant="secondary" size="md" icon="cloud-upload-outline" label="Upload trial video" loading={verify.isPending} onPress={() => verify.mutate(id)} />
          {verify.isError ? <Text variant="caption" color={c.warning}>{(verify.error as Error).message}</Text> : null}
        </>
      ) : null}
    </View>
  );
}
