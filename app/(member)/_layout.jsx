import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';

const COLORS = {
  bg: '#0A0A0A',
  tabBar: '#111111',
  border: '#1E1E1E',
  red: '#E63946',
  inactive: '#444444',
  white: '#FFFFFF',
};

export default function MemberLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.tabBar,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 68,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarActiveTintColor: COLORS.red,
        tabBarInactiveTintColor: COLORS.inactive,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.3,
        },
      }}
    >
      {/* Profile */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* Achievements */}
      <Tabs.Screen
        name="achievements"
        options={{
          title: 'Achievements',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'trophy' : 'trophy-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* Home — center tab */}
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.homeBtn, focused && styles.homeBtnActive]}>
              <Ionicons name="home" size={22} color={COLORS.white} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />

      {/* Leaderboard */}
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Leaderboard',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'podium' : 'podium-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* Boxing Training */}
      <Tabs.Screen
        name="boxing-training"
        options={{
          title: 'Training',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'fitness' : 'fitness-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* Forum — hidden from tab bar, accessed via home page icon */}
      <Tabs.Screen
        name="forum"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  homeBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  homeBtnActive: {
    backgroundColor: '#E63946',
    shadowColor: '#E63946',
    shadowOpacity: 0.5,
  },
});