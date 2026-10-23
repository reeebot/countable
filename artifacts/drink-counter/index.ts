import 'expo-router/entry';
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { countableWidgetTaskHandler } from './lib/countable-widget-task-handler';

if (Platform.OS === 'android') {
  registerWidgetTaskHandler(countableWidgetTaskHandler);
}
