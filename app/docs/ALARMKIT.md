# Wake alarm behavior

- AlarmKit is opt-in from the Today screen. The app asks for authorization only after the explicit enable action; hydration checks authorization and reconciles persisted alarms without prompting.
- The Today screen supports up to eight alarms with labels, minute-level times, selected weekdays, and enable/disable/delete. The group-linked primary alarm remains synchronized to the user's group wake target; personal alarms never create a group report or five-minute follow-up.
- The linked primary alarm cannot be deleted because it represents the group wake target, but it can be disabled; its saved off state survives hydration. Personal alarm deletion is confirmed before schedules are reconciled.
- Alarm definitions are serialized in SecureStore. iOS 26+ uses per-alarm UUIDs in the existing App Group and timezone-aware weekly relative schedules; updates schedule the replacement before cancelling the prior alarm, and cancellation errors remain visible rather than claiming an alarm is off. Legacy single-primary UUIDs migrate to the linked primary without re-enabling a saved disabled alarm.
- Older iOS, denied permission, or AlarmKit scheduling failure uses per-alarm local notification fallbacks when notification permission is granted. A successful AlarmKit schedule replaces that alarm's fallback. Fallback identifiers are isolated by alarm, time, weekday, and label revision.
- The Members screen owns “今朝のようす” and displays each member's awake/sleeping/late report, including the current user's follow-up outcome. Today retains only aggregate awake counts and the alarm list.
- The system stop action opens `/checkin`; it does not write a wake report. The report is still created only after the existing explicit long-press succeeds. That check-in stops the currently alerting alarm if necessary and starts the existing wake-follow-up unchanged; it does not cancel the recurring schedule.

## Simulator verification (2026-10-19)

- On iPhone 17 Pro simulator (iOS 26.3.1), a real UI-selected 03:35 alarm appeared in SpringBoard at 03:35; stopping it opened check-in. The long-press report completed at 03:36:04, and the app was backgrounded before the 03:41:39 SpringBoard `Yes、起きてる！` action (>5 minutes later). The app remained in background through the action; after reopening, Today showed `二度寝確認済み` for the same wake record at 03:46:37.
- This verifies the simulator UI/AlarmKit-to-check-in/follow-up path, not physical-device audio or lock-screen hardware behavior.

The AlarmKit APIs are guarded for iOS 26. The notification path remains available on older systems. Simulator builds validate integration, not physical-device alarm sound or delivery behavior.
