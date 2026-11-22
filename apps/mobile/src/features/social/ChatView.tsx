/**
 * One chat layout for DMs and guild chat: messages fill the screen with the newest at the bottom
 * (inverted list), the composer stays pinned above the keyboard, and a sent message shows at once.
 */
import { useState, type ReactNode } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '@/ui/fx/ScreenBackground';
import { useTheme } from '@/theme';
import { Icon, PressableScale, Text } from '@/ui';

export interface ChatRow {
  id: string;
  body: string;
  mine: boolean;
  status: 'pending' | 'visible' | 'hidden';
  createdAt: string;
  /** shown above others' messages (guild chat) */
  author?: string;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function ChatView({ header, note, rows, onSend, placeholder, maxLength, error, empty, canSend = true }: {
  header: ReactNode;
  note?: string;
  /** newest first */
  rows: ChatRow[];
  onSend: (text: string) => void;
  placeholder: string;
  maxLength: number;
  error?: string | null;
  empty: string;
  canSend?: boolean;
}) {
  const { c, spacing, radius, type } = useTheme();
  const [body, setBody] = useState('');
  const send = () => {
    const text = body.trim();
    if (!text || !canSend) return;
    setBody('');
    onSend(text);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {header}
          {note ? <Text variant="caption" muted style={{ paddingHorizontal: spacing[4], paddingBottom: spacing[2] }}>{note}</Text> : null}
          <FlatList
            inverted
            data={rows}
            keyExtractor={(m) => m.id}
            style={{ flex: 1 }}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: spacing[2], padding: spacing[4], flexGrow: 1 }}
            ListEmptyComponent={
              // inverted lists draw the empty state upside down; flip it back
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[2], transform: [{ scaleY: -1 }] }}>
                <Icon name="chatbubbles-outline" size={28} color={c.textMuted} />
                <Text variant="callout" muted style={{ textAlign: 'center' }}>{empty}</Text>
              </View>
            }
            renderItem={({ item: m }) => (
              <View style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '82%', gap: 2 }}>
                {!m.mine && m.author ? <Text variant="micro" color={c.accentGlow} style={{ marginLeft: 4 }}>{`@${m.author}`}</Text> : null}
                <View style={{
                  paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.lg,
                  borderBottomRightRadius: m.mine ? 6 : radius.lg, borderBottomLeftRadius: m.mine ? radius.lg : 6,
                  backgroundColor: m.mine ? c.accent : c.surfaceRaised,
                }}>
                  <Text variant="callout" color={m.mine ? '#FFFFFF' : c.text}>{m.body}</Text>
                </View>
                <Text variant="micro" muted style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', marginHorizontal: 4 }}>
                  {m.status === 'pending' ? 'Pending review' : m.id.startsWith('sending:') ? 'Sending…' : time(m.createdAt)}
                </Text>
              </View>
            )}
          />
          {error ? <Text variant="caption" color={c.danger} style={{ paddingHorizontal: spacing[4] }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'flex-end', paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderTopWidth: 1, borderColor: c.border }}>
            <TextInput
              value={body} onChangeText={setBody} placeholder={placeholder} placeholderTextColor={c.textMuted} multiline maxLength={maxLength}
              editable={canSend} accessibilityLabel="Message"
              style={{ flex: 1, minHeight: 44, maxHeight: 120, color: c.text, fontFamily: type.body.font, fontSize: 16, paddingHorizontal: spacing[3], paddingTop: 12, paddingBottom: 12, borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}
            />
            <PressableScale haptic="tap" onPress={send} disabled={!body.trim() || !canSend} accessibilityRole="button" accessibilityLabel="Send"
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: body.trim() && canSend ? c.accent : c.surfaceRaised }}>
              <Icon name="arrow-up" size={20} color={body.trim() && canSend ? '#FFFFFF' : c.textMuted} />
            </PressableScale>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
