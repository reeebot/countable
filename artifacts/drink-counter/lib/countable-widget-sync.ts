import React from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { CountableHomeWidget } from '../widgets/CountableHomeWidget';
import type { CountableWidgetSnapshot } from './countable-widget-data';
import {
  COUNTABLE_COMPACT_WIDGET_NAME,
  COUNTABLE_WIDGET_NAME,
} from './countable-widget-data';

export function syncCountableWidget(
  snapshot: CountableWidgetSnapshot,
): void {
  if (Platform.OS !== 'android') return;

  void Promise.all(
    [COUNTABLE_WIDGET_NAME, COUNTABLE_COMPACT_WIDGET_NAME].map((widgetName) =>
      requestWidgetUpdate({
        widgetName,
        renderWidget: () =>
          React.createElement(CountableHomeWidget, {
            snapshot,
            compact: widgetName === COUNTABLE_COMPACT_WIDGET_NAME,
          }),
      }),
    ),
  ).catch((error: unknown) => {
    console.warn('Could not update the Countable home-screen widget.', error);
  });
}
