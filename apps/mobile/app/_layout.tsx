import { Stack } from 'expo-router';
import { MessagesProvider } from '../src/i18n/provider';

export default function Layout() {
  return <MessagesProvider><Stack screenOptions={{ headerShown: false }} /></MessagesProvider>;
}
