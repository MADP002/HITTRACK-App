import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native';

export default function CoachForumScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Text style={styles.emoji}>💬</Text>
        <Text style={styles.text}>Forum</Text>
        <Text style={styles.sub}>Coming soon</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emoji:  { fontSize: 48 },
  text:   { fontSize: 24, fontWeight: '900', color: '#FFFFFF' },
  sub:    { fontSize: 14, color: '#888888' },
});