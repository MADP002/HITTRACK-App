import { useState, useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, auth } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const RED = '#E63946';

export default function AdminLayout() {
  const insets = useSafeAreaInsets();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(db, 'users'), where('role', '==', 'coach_pending'));
    const unsub = onSnapshot(q, snap => {
      setPendingCount(snap.docs.length);
    }, console.error);
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
        tabBarActiveTintColor: RED,
        tabBarInactiveTintColor: '#444444',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen name="overview"      options={{ title: 'Overview',  tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid'         : 'grid-outline'}         size={22} color={color} /> }} />
      <Tabs.Screen name="users"         options={{ title: 'Users',     tabBarBadge: pendingCount > 0 ? pendingCount : undefined, tabBarBadgeStyle: { backgroundColor: RED, fontSize: 10, minWidth: 16, height: 16 }, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people'       : 'people-outline'}       size={22} color={color} /> }} />
      <Tabs.Screen name="inbox"         options={{ title: 'Community',  tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'chatbubbles'  : 'chatbubbles-outline'}  size={22} color={color} /> }} />
      <Tabs.Screen name="leaderboard"   options={{ title: 'Rankings',  tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'trophy'       : 'trophy-outline'}       size={22} color={color} /> }} />
      <Tabs.Screen name="classes"       options={{ title: 'Classes',   tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'calendar'     : 'calendar-outline'}     size={22} color={color} /> }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notify',    tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'megaphone'    : 'megaphone-outline'}    size={22} color={color} /> }} />
      <Tabs.Screen name="member-detail" options={{ href: null }} />
    </Tabs>
  );
}