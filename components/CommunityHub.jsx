import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ForumBoard from './ForumBoard';
import InboxScreen from './InboxScreen';
import { C } from '../lib/theme';

// Community hub — a segmented toggle between the Reddit-style Forum (synced with
// web via the `forum` collection) and the Messages inbox (DMs + group chat).
// Role-agnostic: ForumBoard + InboxScreen read the signed-in user's role, so the
// same component works for members, coaches, and admins.
export default function CommunityHub() {
  const [tab, setTab] = useState('forum'); // 'forum' | 'messages'
  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.toggleWrap}>
        <TouchableOpacity style={[s.seg, tab === 'forum' && s.segActive]} onPress={() => setTab('forum')} activeOpacity={0.85}>
          <Text style={[s.segText, tab === 'forum' && s.segTextActive]}>💬 Forum</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.seg, tab === 'messages' && s.segActive]} onPress={() => setTab('messages')} activeOpacity={0.85}>
          <Text style={[s.segText, tab === 'messages' && s.segTextActive]}>✉️ Messages</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'forum' ? <ForumBoard /> : <InboxScreen embedded />}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  toggleWrap: {
    flexDirection: 'row', gap: 6, margin: 12, padding: 4,
    backgroundColor: C.inputBg, borderRadius: 14, borderWidth: 1, borderColor: C.border,
  },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  segActive: { backgroundColor: C.red },
  segText: { fontSize: 13, fontWeight: '800', color: C.gray, letterSpacing: 0.3 },
  segTextActive: { color: '#fff' },
});
