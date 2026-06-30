import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';

export default function MemberLayout() {
  const insets = useSafeAreaInsets();
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
        tabBarActiveTintColor: '#E63946',
        tabBarInactiveTintColor: '#444444',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="achievements"
        options={{
          title: 'Awards',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'trophy' : 'trophy-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <View style={[st.homeBtn, focused && st.homeBtnActive]}>
              <Ionicons name="home" size={22} color="#FFFFFF" />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Rankings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'podium' : 'podium-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="forum"
        options={{
          title: 'Community',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={22} color={color} />
          ),
        }}
      />
      {/* Hidden routes */}
      <Tabs.Screen name="boxing-training" options={{ href: null }} />
      <Tabs.Screen name="about"                options={{ href: null }} />
      <Tabs.Screen name="medical-certificate"  options={{ href: null }} />
      <Tabs.Screen name="training-lab"         options={{ href: null }} />
      <Tabs.Screen name="training-detail"      options={{ href: null }} />
      <Tabs.Screen name="training-camera"      options={{ href: null }} />
      <Tabs.Screen name="training-complete"    options={{ href: null }} />
      <Tabs.Screen name="training-report"      options={{ href: null }} />
      <Tabs.Screen name="todays-workout"       options={{ href: null }} />
    </Tabs>
  );
}

const st = StyleSheet.create({
  homeBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#333333',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 6,
  },
  homeBtnActive: {
    backgroundColor: '#E63946',
    shadowColor: '#E63946', shadowOpacity: 0.5,
  },
});