import { useState, useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, auth } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const BLUE = '#42a5f5';

export default function CoachLayout() {
  const insets = useSafeAreaInsets();
  const [unviewed, setUnviewed] = useState(0);

  // Live badge: training-lab reports submitted to me that I haven't opened yet.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const q = query(collection(db, 'trainingRecordings'), where('coachUid', '==', uid), where('viewed', '==', false));
    const unsub = onSnapshot(q, snap => setUnviewed(snap.docs.length), () => {});
    return () => unsub();
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#111111',
          borderTopColor: '#1E1E1E',
          borderTopWidth: 1,
          height: 68 + insets.bottom,
          paddingBottom: 12 + insets.bottom,
          paddingTop: 8,
        },
        tabBarActiveTintColor: BLUE,
        tabBarInactiveTintColor: '#444444',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen name="home"        options={{ title: 'Home',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home'         : 'home-outline'}         size={22} color={color} /> }} />
      <Tabs.Screen name="clients"     options={{ title: 'Clients',  tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people'       : 'people-outline'}       size={22} color={color} /> }} />
      <Tabs.Screen name="reports"     options={{ title: 'Reports',  tabBarBadge: unviewed > 0 ? unviewed : undefined, tabBarBadgeStyle: { backgroundColor: BLUE, fontSize: 10, minWidth: 16, height: 16 }, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="memberships" options={{ title: 'Subs',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'card'         : 'card-outline'}         size={22} color={color} /> }} />
      <Tabs.Screen name="classes"     options={{ title: 'Classes',  tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'calendar'     : 'calendar-outline'}     size={22} color={color} /> }} />
      <Tabs.Screen name="forum"       options={{ title: 'Inbox',    tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'chatbubbles'  : 'chatbubbles-outline'}  size={22} color={color} /> }} />
      {/* Hidden routes — pushed over the tabs, not shown in the bar */}
      <Tabs.Screen name="member-detail" options={{ href: null }} />
      <Tabs.Screen name="announcements" options={{ href: null }} />
    </Tabs>
  );
}
