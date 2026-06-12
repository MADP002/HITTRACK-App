import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from 'react-native';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* translucent=false prevents content going under the status bar on Android */}
      <StatusBar
        style="light"
        translucent={false}
        backgroundColor="#0A0A0A"
      />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}