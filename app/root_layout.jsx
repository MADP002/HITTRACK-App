import '../polyfills';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar
        style="light"
        translucent={false}
        backgroundColor="#0A0A0A"
      />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}