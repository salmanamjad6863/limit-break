import { router } from 'expo-router';
import { useRef, useState, type ComponentType } from 'react';
import { Platform, View } from 'react-native';
import { useFoodDraft, useNutritionActions } from '@/features/nutrition';
import { useTheme } from '@/theme';
import { Button, Card, Page, ScreenHeader, Text } from '@/ui';
import { TextField } from '@/ui/form';

type CameraModule = {
  CameraView: ComponentType<Record<string, unknown>>;
  useCameraPermissions: () => [{ granted: boolean; canAskAgain: boolean } | null, () => Promise<unknown>];
};
let camera: CameraModule | null | undefined;
/** Loaded lazily: a dev build made before expo-camera was added simply offers manual entry. */
function loadCamera(): CameraModule | null {
  if (camera !== undefined) return camera;
  try {
    camera = Platform.OS === 'web' ? null : (require('expo-camera') as CameraModule); // eslint-disable-line @typescript-eslint/no-require-imports
  } catch {
    camera = null;
  }
  return camera;
}

/** Barcode → Open Food Facts → portion. Manual entry always works. */
export default function Scan() {
  const { c, spacing, radius } = useTheme();
  const d = useFoodDraft();
  const { lookupBarcode } = useNutritionActions();
  const [code, setCode] = useState('');
  const busy = useRef(false);
  const cam = loadCamera();

  const find = (barcode: string) => {
    if (busy.current) return;
    busy.current = true;
    lookupBarcode.mutate(barcode.trim(), {
      onSuccess: (food) => {
        d.set({ food, logId: null, grams: null, servingLabel: null });
        router.replace('/diary/portion');
      },
      onSettled: () => {
        setTimeout(() => (busy.current = false), 1500);
      },
    });
  };

  return (
    <Page accent={c.mana} header={<ScreenHeader title="Scan barcode" />}>
      {cam ? <CameraBox cam={cam} onCode={find} /> : (
        <Card>
          <Text variant="callout">Camera scanning needs the latest app build.</Text>
          <Text variant="caption" muted>Type the number under the barcode instead, it works the same.</Text>
        </Card>
      )}
      <TextField label="Barcode number" placeholder="e.g. 5000112637922" value={code} onChangeText={setCode} keyboardType="number-pad" returnKeyType="search" onSubmitEditing={() => find(code)} />
      <Button variant="secondary" size="md" icon="search" label="Look up" loading={lookupBarcode.isPending} disabled={code.trim().length < 6} onPress={() => find(code)} />
      {lookupBarcode.isError ? (
        <Card tint={c.warning}>
          <Text variant="callout">{(lookupBarcode.error as Error).message}</Text>
          <Button variant="ghost" size="md" label="Create it as a new food" onPress={() => router.replace('/diary/create')} />
        </Card>
      ) : null}
      <View style={{ height: spacing[2], borderRadius: radius.sm }} />
      <Text variant="micro" muted>Product data © Open Food Facts contributors (ODbL). Only the barcode number is sent.</Text>
    </Page>
  );
}

function CameraBox({ cam, onCode }: { cam: CameraModule; onCode: (code: string) => void }) {
  const { c, radius } = useTheme();
  const [perm, ask] = cam.useCameraPermissions();
  if (!perm?.granted) {
    return (
      <Card>
        <Text variant="callout">Allow the camera to scan barcodes.</Text>
        <Button variant="secondary" size="md" icon="camera-outline" label="Allow camera" onPress={() => ask()} />
      </Card>
    );
  }
  const View2 = cam.CameraView;
  return (
    <View style={{ height: 260, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
      <View2
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={(r: { data: string }) => onCode(r.data)}
      />
    </View>
  );
}
