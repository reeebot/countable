import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  requestWidgetUpdate,
  type WidgetTaskHandlerProps,
} from 'react-native-android-widget';
import {
  addLastDrinkFromWidget,
  COUNTABLE_COMPACT_WIDGET_NAME,
  COUNTABLE_WIDGET_NAME,
  readCountableWidgetSnapshot,
  type CountableWidgetSnapshot,
} from './countable-widget-data';
import { CountableHomeWidget } from '../widgets/CountableHomeWidget';

const errorSnapshot: CountableWidgetSnapshot = {
  drinkCount: 0,
  standardDrinks: 0,
  dailyGoal: null,
  percentComplete: null,
  isOverGoal: false,
  hasLastDrink: false,
  error: true,
};

function widgetForName(widgetName: string, snapshot: CountableWidgetSnapshot) {
  return (
    <CountableHomeWidget
      snapshot={snapshot}
      compact={widgetName === COUNTABLE_COMPACT_WIDGET_NAME}
    />
  );
}

async function renderCurrentWidget(
  props: WidgetTaskHandlerProps,
): Promise<void> {
  try {
    const snapshot = await readCountableWidgetSnapshot(AsyncStorage);
    props.renderWidget(widgetForName(props.widgetInfo.widgetName, snapshot));
  } catch (error) {
    console.warn('Could not refresh the Countable home-screen widget.', error);
    props.renderWidget(
      widgetForName(props.widgetInfo.widgetName, errorSnapshot),
    );
  }
}

export async function countableWidgetTaskHandler(
  props: WidgetTaskHandlerProps,
): Promise<void> {
  const widgetName = props.widgetInfo.widgetName;
  if (
    widgetName !== COUNTABLE_WIDGET_NAME &&
    widgetName !== COUNTABLE_COMPACT_WIDGET_NAME
  ) {
    return;
  }

  if (
    props.widgetAction === 'WIDGET_CLICK' &&
    props.clickAction === 'ADD_LAST_DRINK'
  ) {
    try {
      await addLastDrinkFromWidget(AsyncStorage);
      const snapshot = await readCountableWidgetSnapshot(AsyncStorage);
      props.renderWidget(widgetForName(widgetName, snapshot));
      await Promise.all(
        [COUNTABLE_WIDGET_NAME, COUNTABLE_COMPACT_WIDGET_NAME].map(
          (widgetToUpdate) =>
            requestWidgetUpdate({
              widgetName: widgetToUpdate,
              renderWidget: () =>
                widgetForName(widgetToUpdate, snapshot),
            }),
        ),
      );
    } catch (error) {
      console.warn('Could not add a drink from the Countable widget.', error);
      props.renderWidget(widgetForName(widgetName, errorSnapshot));
    }
    return;
  }

  if (
    props.widgetAction === 'WIDGET_ADDED' ||
    props.widgetAction === 'WIDGET_UPDATE' ||
    props.widgetAction === 'WIDGET_RESIZED'
  ) {
    await renderCurrentWidget(props);
  }
}
