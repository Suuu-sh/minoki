import ExpoModulesCore
import Foundation
import ActivityKit
import AlarmKit

public class OkiyoWakeActionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OkiyoWakeAction")

    Function("getConfirmedWakeId") { () -> String? in
      OkiyoWakeActionState.defaults?.string(forKey: OkiyoWakeActionState.confirmedWakeIdKey)
    }

    Function("clearConfirmedWakeId") {
      OkiyoWakeActionState.defaults?.removeObject(forKey: OkiyoWakeActionState.confirmedWakeIdKey)
    }

    Function("setPendingWake") { (wakeId: String, checkedAt: Double) in
      guard let defaults = OkiyoWakeActionState.defaults else { return }
      defaults.set(wakeId, forKey: OkiyoWakeActionState.pendingWakeIdKey)
      defaults.set(checkedAt, forKey: OkiyoWakeActionState.pendingWakeCheckedAtKey)
      defaults.removeObject(forKey: OkiyoWakeActionState.confirmedWakeIdKey)
    }

    Function("clearPendingWake") { (wakeId: String) in
      guard let defaults = OkiyoWakeActionState.defaults,
            defaults.string(forKey: OkiyoWakeActionState.pendingWakeIdKey) == wakeId else { return }
      defaults.removeObject(forKey: OkiyoWakeActionState.pendingWakeIdKey)
      defaults.removeObject(forKey: OkiyoWakeActionState.pendingWakeCheckedAtKey)
    }

    Function("areLiveActivitiesEnabled") { () -> Bool in
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    AsyncFunction("getWakeAlarmStatus") { () async -> [String: Any] in
      guard #available(iOS 26.0, *) else { return ["state": "unsupported"] }
      return await OkiyoWakeAlarmCoordinator.shared.status().dictionary
    }

    AsyncFunction("requestWakeAlarmAuthorization") { () async -> String in
      guard #available(iOS 26.0, *) else { return "unsupported" }
      return await OkiyoWakeAlarmCoordinator.shared.requestAuthorization()
    }

    AsyncFunction("scheduleWakeAlarm") { (wakeTime: String) async -> [String: Any] in
      guard #available(iOS 26.0, *) else { return ["state": "unsupported"] }
      return await OkiyoWakeAlarmCoordinator.shared.schedule(wakeTime: wakeTime).dictionary
    }

    AsyncFunction("reconcileWakeAlarms") { (alarms: [[String: Any]]) async -> [String: Any] in
      guard #available(iOS 26.0, *) else { return ["state": "unsupported", "alarms": []] }
      let entries = alarms.compactMap { item -> OkiyoDesiredWakeAlarm? in
        guard let id = item["id"] as? String, !id.isEmpty,
              let rawLabel = item["label"] as? String,
              let time = item["time"] as? String,
              let weekdays = item["weekdays"] as? [Int],
              let enabled = item["enabled"] as? Bool,
              let groupLinked = item["groupLinked"] as? Bool,
              !weekdays.isEmpty,
              time.range(of: #"^([01]\d|2[0-3]):[0-5]\d$"#, options: .regularExpression) != nil,
              weekdays.allSatisfy({ (0...6).contains($0) }) else { return nil }
        let label = String(rawLabel.trimmingCharacters(in: .whitespacesAndNewlines).prefix(32))
        guard !label.isEmpty else { return nil }
        return OkiyoDesiredWakeAlarm(id: id, label: label, time: time, weekdays: Array(Set(weekdays)).sorted(), enabled: enabled, groupLinked: groupLinked)
      }
      return await OkiyoWakeAlarmCoordinator.shared.reconcileAlarms(entries).dictionary
    }

    AsyncFunction("stopRingingWakeAlarm") { () async in
      guard #available(iOS 26.0, *) else { return }
      await OkiyoWakeAlarmCoordinator.shared.stopIfAlerting()
    }

    Function("consumeWakeAlarmStopIntent") { () -> Bool in
      guard let defaults = OkiyoWakeActionState.defaults,
            defaults.bool(forKey: OkiyoWakeActionState.pendingAlarmStopKey) else { return false }
      defaults.removeObject(forKey: OkiyoWakeActionState.pendingAlarmStopKey)
      return true
    }
  }
}
