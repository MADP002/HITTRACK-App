import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const RED = '#E63946';

export default function AdminLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#111111',
          borderTopColor: '#1E1E1E',
          borderTopWidth: 1,
          height: 68,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarActiveTintColor: RED,
        tabBarInactiveTintColor: '#444444',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen name="overview"      options={{ title: 'Overview',   tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid'         : 'grid-outline'}         size={22} color={color} /> }} />
      <Tabs.Screen name="users"         options={{ title: 'Users',      tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people'       : 'people-outline'}       size={22} color={color} /> }} />
      <Tabs.Screen name="inbox"         options={{ title: 'Inbox',      tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'chatbubbles'  : 'chatbubbles-outline'}  size={22} color={color} /> }} />
      <Tabs.Screen name="leaderboard"   options={{ title: 'Rankings',   tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'trophy'       : 'trophy-outline'}       size={22} color={color} /> }} />
      <Tabs.Screen name="classes"       options={{ title: 'Classes',    tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'calendar'     : 'calendar-outline'}     size={22} color={color} /> }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notify',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'megaphone'    : 'megaphone-outline'}    size={22} color={color} /> }} />
      {/* Hidden routes */}
      <Tabs.Screen name="member-detail" options={{ href: null }} />
    </Tabs>
  );
}