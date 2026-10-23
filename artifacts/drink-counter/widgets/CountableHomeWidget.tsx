'use no memo';

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { formatStandardDrinkCount } from '../lib/drink-data';
import {
  COUNTABLE_COMPACT_WIDGET_NAME,
  COUNTABLE_WIDGET_NAME,
  type CountableWidgetSnapshot,
} from '../lib/countable-widget-data';

type Props = {
  snapshot: CountableWidgetSnapshot;
  compact?: boolean;
};

const colors = {
  normal: {
    background: '#1c312a',
    foreground: '#f1ede2',
    secondary: '#a8b5a9',
    track: '#54806b',
    progress: '#91c4a7',
    button: '#91c4a7',
    buttonText: '#14251f',
  },
  exceeded: {
    background: '#6e263b',
    foreground: '#fff8fa',
    secondary: '#f2d5de',
    track: '#9f5268',
    progress: '#fff8fa',
    button: '#fff8fa',
    buttonText: '#6e263b',
  },
} as const;

export function CountableHomeWidget({ snapshot, compact = false }: Props) {
  const palette = snapshot.isOverGoal ? colors.exceeded : colors.normal;
  const progressWidth =
    snapshot.percentComplete === null
      ? 0
      : Math.max(0, Math.min(snapshot.percentComplete, 100));
  const percentLabel = snapshot.error
    ? 'Open Countable to refresh'
    : snapshot.dailyGoal === null
      ? 'No daily goal set'
      : snapshot.percentComplete === null
        ? 'Over a zero-drink goal'
        : `${snapshot.percentComplete}% of daily goal`;
  const detailsLabel =
    snapshot.dailyGoal === null || snapshot.error
      ? 'Set a goal to track progress'
      : `${formatStandardDrinkCount(snapshot.standardDrinks)} / ${formatStandardDrinkCount(snapshot.dailyGoal)} standard drinks`;
  const plusAction = snapshot.error
    ? 'OPEN_APP'
    : snapshot.hasLastDrink
      ? 'ADD_LAST_DRINK'
      : 'OPEN_URI';
  const openAddDrinkUri = `countable:///?widgetAdd=${Date.now()}`;
  const widgetName = compact
    ? COUNTABLE_COMPACT_WIDGET_NAME
    : COUNTABLE_WIDGET_NAME;

  if (compact) {
    return (
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          paddingVertical: 6,
          backgroundColor: palette.background,
          borderRadius: 18,
        }}
        clickAction="OPEN_APP"
        accessibilityLabel={`${widgetName}. ${snapshot.error ? 'Drink total unavailable.' : `${snapshot.drinkCount} drinks today.`} ${percentLabel}.`}
      >
        <FlexWidget
          style={{
            flex: 1,
            flexDirection: 'column',
            justifyContent: 'center',
            marginRight: 8,
          }}
        >
          <FlexWidget
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <TextWidget
              text="TODAY"
              style={{
                color: palette.secondary,
                fontSize: 9,
                fontWeight: '700',
                letterSpacing: 0.6,
              }}
            />
            <TextWidget
              text={snapshot.dailyGoal === null ? '—' : `${snapshot.percentComplete ?? 0}%`}
              style={{
                color: palette.foreground,
                fontSize: 10,
                fontWeight: '700',
              }}
            />
          </FlexWidget>
          <FlexWidget
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 1,
            }}
          >
            <TextWidget
              text={snapshot.error ? '—' : String(snapshot.drinkCount)}
              style={{
                color: palette.foreground,
                fontSize: 26,
                fontWeight: '800',
                lineHeight: 29,
              }}
            />
            <TextWidget
              text={snapshot.drinkCount === 1 ? 'drink' : 'drinks'}
              style={{
                color: palette.foreground,
                fontSize: 10,
                fontWeight: '600',
                marginLeft: 4,
              }}
            />
          </FlexWidget>
          <TextWidget
            text={
              snapshot.dailyGoal === null || snapshot.error
                ? 'Set a daily goal'
                : `${formatStandardDrinkCount(snapshot.standardDrinks)} / ${formatStandardDrinkCount(snapshot.dailyGoal)} std. drinks`
            }
            truncate="END"
            maxLines={1}
            style={{
              color: palette.secondary,
              fontSize: 9,
              lineHeight: 11,
            }}
          />
          <FlexWidget
            style={{
              width: 'match_parent',
              height: 4,
              flexDirection: 'row',
              marginTop: 3,
              backgroundColor: palette.track,
              borderRadius: 4,
            }}
          >
            {progressWidth > 0 ? (
              <FlexWidget
                style={{
                  flex: progressWidth,
                  height: 'match_parent',
                  backgroundColor: palette.progress,
                  borderRadius: 4,
                }}
              />
            ) : null}
            {progressWidth < 100 ? (
              <FlexWidget
                style={{
                  flex: 100 - progressWidth,
                  height: 'match_parent',
                }}
              />
            ) : null}
          </FlexWidget>
        </FlexWidget>
        <FlexWidget
          style={{
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.button,
            borderRadius: 19,
          }}
          clickAction={plusAction}
          clickActionData={
            plusAction === 'OPEN_URI' ? { uri: openAddDrinkUri } : undefined
          }
          accessibilityLabel={
            snapshot.hasLastDrink
              ? 'Add one more of your last drink'
              : 'Open Countable to add a drink'
          }
        >
          <TextWidget
            text="+"
            style={{
              color: palette.buttonText,
              fontSize: 26,
              fontWeight: '500',
              lineHeight: 30,
            }}
          />
        </FlexWidget>
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: palette.background,
        borderRadius: 20,
      }}
      clickAction="OPEN_APP"
      accessibilityLabel={`${widgetName}. ${snapshot.error ? 'Drink total unavailable.' : `${snapshot.drinkCount} drinks today.`} ${percentLabel}.`}
    >
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'column',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <TextWidget
          text="TODAY"
          style={{
            color: palette.secondary,
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 0.8,
            lineHeight: 12,
          }}
        />
        <FlexWidget
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 2,
            marginBottom: 2,
          }}
        >
          <TextWidget
            text={snapshot.error ? '—' : String(snapshot.drinkCount)}
            style={{
              color: palette.foreground,
              fontSize: 36,
              fontWeight: '800',
              lineHeight: 40,
            }}
          />
          <TextWidget
            text={snapshot.drinkCount === 1 ? 'drink' : 'drinks'}
            style={{
              color: palette.foreground,
              fontSize: 13,
              fontWeight: '600',
              marginLeft: 6,
            }}
          />
        </FlexWidget>
        <TextWidget
          text={percentLabel}
          truncate="END"
          maxLines={1}
          style={{
            color: palette.foreground,
            fontSize: 12,
            fontWeight: '700',
            lineHeight: 15,
          }}
        />
        <TextWidget
          text={detailsLabel}
          truncate="END"
          maxLines={1}
          style={{
            color: palette.secondary,
            fontSize: 10,
            lineHeight: 13,
          }}
        />
        <FlexWidget
          style={{
            width: 'match_parent',
            height: 5,
            flexDirection: 'row',
            marginTop: 6,
            backgroundColor: palette.track,
            borderRadius: 5,
          }}
        >
          {progressWidth > 0 ? (
            <FlexWidget
              style={{
                flex: progressWidth,
                height: 'match_parent',
                backgroundColor: palette.progress,
                borderRadius: 5,
              }}
            />
          ) : null}
          {progressWidth < 100 ? (
            <FlexWidget
              style={{
                flex: 100 - progressWidth,
                height: 'match_parent',
              }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>
      <FlexWidget
        style={{
          width: 48,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.button,
          borderRadius: 24,
        }}
        clickAction={plusAction}
        clickActionData={
          plusAction === 'OPEN_URI' ? { uri: openAddDrinkUri } : undefined
        }
        accessibilityLabel={
          snapshot.hasLastDrink
            ? 'Add one more of your last drink'
            : 'Open Countable to add a drink'
        }
      >
        <TextWidget
          text="+"
          style={{
            color: palette.buttonText,
            fontSize: 32,
            fontWeight: '500',
            lineHeight: 36,
          }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
