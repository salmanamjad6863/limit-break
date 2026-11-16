// Web entry: React Native Skia captures CanvasKit at import time, so it must be
// loaded BEFORE any app module is evaluated. public/canvaskit.wasm is copied by `pnpm skia:web`.
// A deferred require (not import()) keeps the router in the main bundle but evaluates it later.
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

LoadSkiaWeb({ locateFile: (file) => `/${file}` }).then(() => {
  require('expo-router/entry');
});
