import { Redirect } from 'expo-router';
 
export default function Index() {
  // This is the entry point of the app.
  // It immediately redirects to the login screen.
  // Later, you can add auth checks here to redirect to the
  // correct interface (member/coach/admin) if already logged in.
  return <Redirect href="/(auth)/login" />;
}