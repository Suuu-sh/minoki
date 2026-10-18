import { Button, HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  background,
  buttonBorderShape,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

export type WakeFollowupActivityProps = {
  wakeId: string;
  checkedAt: number;
};

const WakeFollowupActivity = (props: WakeFollowupActivityProps) => {
  'widget';

  const ink = '#3A2F27';
  const mutedInk = '#806F63';
  const morningOrange = '#B86B00';
  const cardCream = '#FFF8EC';
  const butterYellow = '#F4D17A';
  const islandInk = '#FFF8EC';
  const islandMutedInk = '#D8CBBB';
  const timer = new Date(props.checkedAt);

  const confirmButton = (
    <Button
      target={props.wakeId}
      modifiers={[buttonStyle('plain'), buttonBorderShape('roundedRectangle', 14)]}>
      <HStack
        alignment="center"
        spacing={8}
        modifiers={[
          frame({ maxWidth: 360, minHeight: 48 }),
          padding({ horizontal: 14 }),
          background(butterYellow, shapes.roundedRectangle({ cornerRadius: 14, roundedCornerStyle: 'continuous' })),
        ]}>
        <Spacer minLength={0} />
        <Text modifiers={[font({ size: 16, weight: 'bold', design: 'rounded' }), foregroundStyle(ink)]}>Yes、起きてる！</Text>
        <Spacer minLength={0} />
      </HStack>
    </Button>
  );

  const titleAndTimer = (
    <HStack alignment="center" spacing={10}>
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 12, weight: 'bold', design: 'rounded' }), foregroundStyle(morningOrange)]}>
          おはよう！
        </Text>
        <Text modifiers={[font({ size: 17, weight: 'bold', design: 'rounded' }), foregroundStyle(ink)]}>
          二度寝してない？
        </Text>
      </VStack>
      <Spacer minLength={8} />
      <VStack alignment="trailing" spacing={2} modifiers={[frame({ width: 86, alignment: 'trailing' })]}>
        <Text modifiers={[font({ size: 10, weight: 'medium' }), foregroundStyle(mutedInk), frame({ width: 86, alignment: 'trailing' })]}>起床から</Text>
        <Text
          date={timer}
          dateStyle="timer"
          modifiers={[font({ size: 15, weight: 'semibold', design: 'rounded' }), foregroundStyle(ink), monospacedDigit(), frame({ width: 86, alignment: 'trailing' })]}
        />
      </VStack>
    </HStack>
  );

  return {
    banner: (
      <VStack alignment="leading" spacing={12} modifiers={[padding({ horizontal: 16, top: 16, bottom: 16 }), activityBackgroundTint(cardCream)]}>
        {titleAndTimer}
        {confirmButton}
      </VStack>
    ),
    compactLeading: <Text modifiers={[font({ size: 12, weight: 'bold', design: 'rounded' }), foregroundStyle(morningOrange)]}>起床</Text>,
    compactTrailing: <Text modifiers={[font({ size: 12, weight: 'bold', design: 'rounded' })]}>確認中</Text>,
    minimal: <Text modifiers={[font({ size: 11, weight: 'bold', design: 'rounded' }), foregroundStyle(morningOrange)]}>起床</Text>,
    // Dynamic Island regions are narrow and independently sized. Keep the
    // side regions short, and put the full-width action in the bottom region.
    expandedLeading: <Text modifiers={[font({ size: 12, weight: 'bold', design: 'rounded' }), foregroundStyle(butterYellow)]}>起床確認</Text>,
    expandedCenter: (
      <Text modifiers={[font({ size: 14, weight: 'bold', design: 'rounded' }), foregroundStyle(islandInk)]}>二度寝してない？</Text>
    ),
    expandedTrailing: (
      <Text date={timer} dateStyle="timer" modifiers={[font({ size: 12, weight: 'semibold', design: 'rounded' }), foregroundStyle(islandInk), monospacedDigit()]} />
    ),
    expandedBottom: (
      <VStack alignment="center" spacing={7}>
        {confirmButton}
        <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(islandMutedInk)]}>確認は5〜15分のあいだ</Text>
      </VStack>
    ),
  };
};

export default createLiveActivity('WakeFollowupActivity', WakeFollowupActivity);
