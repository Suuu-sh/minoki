import ExpoModulesCore
import ExpoWidgets
import ExpoNotifications
import Foundation
import UserNotifications

enum OkiyoWakeActionState {
  static let confirmedWakeIdKey = "okiyo.wake-followup.confirmed-wake-id"
  static let pendingWakeIdKey = "okiyo.wake-followup.pending-wake-id"
  static let pendingWakeCheckedAtKey = "okiyo.wake-followup.pending-wake-checked-at"
  static let wakeAlarmIdKey = "okiyo.wake-alarm.id"
  static let wakeAlarmTimeKey = "okiyo.wake-alarm.time"
  static let pendingAlarmStopKey = "okiyo.wake-alarm.stop-requested"
  static let actionIdentifier = "okiyo_wake_confirm"
  static let notificationKind = "wake-followup"
  static let notificationPrefix = "okiyo-wake-followup-"
  static let liveActivityInteraction = Notification.Name("onExpoWidgetsUserInteraction")
  static var defaults: UserDefaults? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String else { return nil }
    return UserDefaults(suiteName: group)
  }

  static func isWithinConfirmationWindow(checkedAt: Double, now: Double = Date().timeIntervalSince1970 * 1000) -> Bool {
    now >= checkedAt + 5 * 60_000 && now < checkedAt + 15 * 60_000
  }
}

private final class OkiyoWakeActionNotificationDelegate: NSObject, NotificationDelegate, @unchecked Sendable {
  static let shared = OkiyoWakeActionNotificationDelegate()

  func didReceive(_ response: UNNotificationResponse, completionHandler: @escaping () -> Void) -> Bool {
    guard response.actionIdentifier == OkiyoWakeActionState.actionIdentifier,
          let data = response.notification.request.content.userInfo as? [String: Any],
          data["kind"] as? String == OkiyoWakeActionState.notificationKind,
          let wakeId = data["wakeId"] as? String,
          let checkedAt = data["checkedAt"] as? NSNumber,
          OkiyoWakeActionState.isWithinConfirmationWindow(checkedAt: checkedAt.doubleValue) else {
      return false
    }

    OkiyoWakeActionState.defaults?.set(wakeId, forKey: OkiyoWakeActionState.confirmedWakeIdKey)
    let identifiers = [5, 10, 15].map { "\(OkiyoWakeActionState.notificationPrefix)\(wakeId)-\($0)" }
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: identifiers)
    center.removeDeliveredNotifications(withIdentifiers: identifiers)
    Task { await OkiyoWakeActivityLifecycle.endConfirmed(wakeId: wakeId) }
    return true
  }
}

private final class OkiyoWakeActivityIntentObserver: NSObject, @unchecked Sendable {
  static let shared = OkiyoWakeActivityIntentObserver()

  @objc func handle(_ notification: Notification) {
    guard let eventData = notification.userInfo?["eventData"] as? [String: Any],
          eventData["type"] as? String == "ExpoWidgetsUserInteraction",
          let wakeId = eventData["target"] as? String,
          let defaults = OkiyoWakeActionState.defaults,
          defaults.string(forKey: OkiyoWakeActionState.pendingWakeIdKey) == wakeId,
          let checkedAt = defaults.object(forKey: OkiyoWakeActionState.pendingWakeCheckedAtKey) as? NSNumber,
          OkiyoWakeActionState.isWithinConfirmationWindow(checkedAt: checkedAt.doubleValue) else {
      return
    }

    // Expo Widgets' LiveActivityIntent runs in the app process without opening
    // the foreground app. Persist the result in the shared App Group before it
    // returns so a later JS launch can reconcile SecureStore and streak state.
    defaults.set(wakeId, forKey: OkiyoWakeActionState.confirmedWakeIdKey)
    defaults.removeObject(forKey: OkiyoWakeActionState.pendingWakeIdKey)
    defaults.removeObject(forKey: OkiyoWakeActionState.pendingWakeCheckedAtKey)
    let identifiers = [5, 10, 15].map { "\(OkiyoWakeActionState.notificationPrefix)\(wakeId)-\($0)" }
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: identifiers)
    center.removeDeliveredNotifications(withIdentifiers: identifiers)
  }
}

public class OkiyoWakeActionAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func subscriberDidRegister() {
    NotificationCenterManager.shared.addDelegate(OkiyoWakeActionNotificationDelegate.shared)
    NotificationCenter.default.addObserver(
      OkiyoWakeActivityIntentObserver.shared,
      selector: #selector(OkiyoWakeActivityIntentObserver.handle(_:)),
      name: OkiyoWakeActionState.liveActivityInteraction,
      object: nil
    )
  }
}
