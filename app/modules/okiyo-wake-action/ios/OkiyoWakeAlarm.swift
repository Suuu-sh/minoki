@preconcurrency import AlarmKit
import AppIntents
import ExpoWidgets
import Foundation
import SwiftUI

private struct OkiyoWakeAlarmMetadata: AlarmMetadata {}
private struct OkiyoStoredWakeAlarm: Codable, Equatable {
  var id: String
  var nativeID: String
  var label: String
  var time: String
  var weekdays: [Int]
  var groupLinked: Bool
}

struct OkiyoDesiredWakeAlarm: Sendable {
  let id: String
  let label: String
  let time: String
  let weekdays: [Int]
  let enabled: Bool
  let groupLinked: Bool
}
struct OkiyoWakeAlarmDelivery: Sendable {
  let id: String
  let state: String
}
struct OkiyoWakeAlarmsReconcileResult: Sendable {
  let state: String
  let alarms: [OkiyoWakeAlarmDelivery]

  var dictionary: [String: Any] {
    ["state": state, "alarms": alarms.map { ["id": $0.id, "state": $0.state] }]
  }
}
struct OkiyoWakeAlarmResult: Sendable {
  let state: String
  let wakeTime: String?

  var dictionary: [String: Any] {
    var result: [String: Any] = ["state": state]
    if let wakeTime { result["wakeTime"] = wakeTime }
    return result
  }
}

@available(iOS 26.0, *)
actor OkiyoWakeAlarmCoordinator {
  static let shared = OkiyoWakeAlarmCoordinator()
  private let manager = AlarmManager.shared
  private let registryKey = "okiyo.wake-alarms.registry-v1"

  func status() -> OkiyoWakeAlarmResult {
    guard #available(iOS 26.0, *) else { return .init(state: "unsupported", wakeTime: nil) }
    let authorization = authorizationName(manager.authorizationState)
    let defaults = OkiyoWakeActionState.defaults
    let idString = defaults?.string(forKey: OkiyoWakeActionState.wakeAlarmIdKey)
    let wakeTime = defaults?.string(forKey: OkiyoWakeActionState.wakeAlarmTimeKey)
    let exists = (try? manager.alarms.contains { $0.id.uuidString == idString }) ?? false
    let state = authorization == "authorized" && exists ? "scheduled" : authorization
    return .init(state: state, wakeTime: wakeTime)
  }

  func requestAuthorization() async -> String {
    do {
      return authorizationName(try await manager.requestAuthorization())
    } catch {
      return "error"
    }
  }

  func reconcileAlarms(_ input: [OkiyoDesiredWakeAlarm]) async -> OkiyoWakeAlarmsReconcileResult {
    guard #available(iOS 26.0, *) else { return .init(state: "unsupported", alarms: []) }
    let authorization = authorizationName(manager.authorizationState)
    guard let defaults = OkiyoWakeActionState.defaults else { return .init(state: "error", alarms: []) }
    var registry = loadRegistry(from: defaults)
    let systemAlarms = (try? manager.alarms) ?? []
    if registry.isEmpty,
       let oldID = defaults.string(forKey: OkiyoWakeActionState.wakeAlarmIdKey),
       let oldUUID = UUID(uuidString: oldID),
       let oldTime = defaults.string(forKey: OkiyoWakeActionState.wakeAlarmTimeKey),
       systemAlarms.contains(where: { $0.id == oldUUID }) {
      registry["group-primary"] = OkiyoStoredWakeAlarm(
        id: "group-primary", nativeID: oldID, label: "みんなの起床", time: oldTime,
        weekdays: [0, 1, 2, 3, 4, 5, 6], groupLinked: true
      )
    }

    let desiredByID = Dictionary(input.map { ($0.id, $0) }, uniquingKeysWith: { _, latest in latest })
    let canSchedule = authorization == "authorized"

    var deliveries: [String: String] = [:]
    var failed = false
    for alarm in desiredByID.values where alarm.enabled {
      let current = registry[alarm.id]
      let currentID = current.flatMap { UUID(uuidString: $0.nativeID) }
      let exists = currentID.map { id in systemAlarms.contains(where: { $0.id == id }) } ?? false
      if !canSchedule {
        if let currentID, exists {
          do { try manager.cancel(id: currentID) }
          catch { deliveries[alarm.id] = "error"; failed = true; continue }
        }
        registry.removeValue(forKey: alarm.id)
        if alarm.groupLinked {
          defaults.removeObject(forKey: OkiyoWakeActionState.wakeAlarmIdKey)
          defaults.removeObject(forKey: OkiyoWakeActionState.wakeAlarmTimeKey)
        }
        deliveries[alarm.id] = "error"
        failed = true
        continue
      }
      if let current, exists, current.label == alarm.label, current.time == alarm.time,
         current.weekdays == alarm.weekdays, current.groupLinked == alarm.groupLinked {
        deliveries[alarm.id] = "scheduled"
        continue
      }

      guard let timeParts = parseTime(alarm.time) else {
        deliveries[alarm.id] = "error"
        failed = true
        continue
      }
      let nativeID = UUID()
      let time = Alarm.Schedule.Relative.Time(hour: timeParts.hour, minute: timeParts.minute)
      let selectedDays = alarm.weekdays.compactMap(localeWeekday)
      let repeats: Alarm.Schedule.Relative.Recurrence = selectedDays.isEmpty ? .never : .weekly(selectedDays)
      let schedule = Alarm.Schedule.relative(.init(time: time, repeats: repeats))
      let alert: AlarmPresentation.Alert
      if #available(iOS 26.1, *) {
        alert = .init(title: LocalizedStringResource(stringLiteral: alarm.label))
      } else {
        alert = .init(
          title: LocalizedStringResource(stringLiteral: alarm.label),
          stopButton: AlarmButton(text: alarm.groupLinked ? "アプリで報告" : "停止", textColor: .white, systemImageName: alarm.groupLinked ? "sun.max.fill" : "stop.circle")
        )
      }
      let presentation = AlarmPresentation(alert: alert)
      let attributes = AlarmAttributes(presentation: presentation, metadata: OkiyoWakeAlarmMetadata(), tintColor: Color(red: 0.78, green: 0.22, blue: 0.0))
      let stopIntent: (any LiveActivityIntent)? = alarm.groupLinked ? OkiyoWakeAlarmStopIntent() : OkiyoPersonalWakeAlarmStopIntent()
      let configuration = AlarmManager.AlarmConfiguration.alarm(schedule: schedule, attributes: attributes, stopIntent: stopIntent)

      do {
        _ = try await manager.schedule(id: nativeID, configuration: configuration)
      } catch {
        deliveries[alarm.id] = "error"
        failed = true
        continue
      }
      if let currentID, exists {
        do {
          try manager.cancel(id: currentID)
        } catch {
          try? manager.cancel(id: nativeID)
          deliveries[alarm.id] = "error"
          failed = true
          continue
        }
      }
      let record = OkiyoStoredWakeAlarm(id: alarm.id, nativeID: nativeID.uuidString, label: alarm.label, time: alarm.time, weekdays: alarm.weekdays, groupLinked: alarm.groupLinked)
      registry[alarm.id] = record
      if alarm.groupLinked {
        defaults.set(nativeID.uuidString, forKey: OkiyoWakeActionState.wakeAlarmIdKey)
        defaults.set(alarm.time, forKey: OkiyoWakeActionState.wakeAlarmTimeKey)
      }
      deliveries[alarm.id] = "scheduled"
      persistRegistry(registry, to: defaults)
    }

    let staleIDs = registry.keys.filter { desiredByID[$0]?.enabled != true }
    for id in staleIDs {
      guard let record = registry[id] else { continue }
      if let nativeID = UUID(uuidString: record.nativeID), systemAlarms.contains(where: { $0.id == nativeID }) {
        do { try manager.cancel(id: nativeID) }
        catch { deliveries[id] = "error"; failed = true; continue }
      }
      registry.removeValue(forKey: id)
      deliveries[id] = "disabled"
      if id == "group-primary" {
        defaults.removeObject(forKey: OkiyoWakeActionState.wakeAlarmIdKey)
        defaults.removeObject(forKey: OkiyoWakeActionState.wakeAlarmTimeKey)
      }
    }

    for (id, alarm) in desiredByID where !alarm.enabled {
      if deliveries[id] != "error" { deliveries[id] = "disabled" }
    }
    persistRegistry(registry, to: defaults)
    let response = input.map { item in
      OkiyoWakeAlarmDelivery(id: item.id, state: deliveries[item.id] ?? (item.enabled ? "error" : "disabled"))
    }
    return OkiyoWakeAlarmsReconcileResult(state: failed ? "error" : "scheduled", alarms: response)
  }

  func schedule(wakeTime: String) async -> OkiyoWakeAlarmResult {
    guard #available(iOS 26.0, *) else { return .init(state: "unsupported", wakeTime: nil) }
    guard manager.authorizationState == .authorized else {
      return .init(state: authorizationName(manager.authorizationState), wakeTime: nil)
    }
    let pieces = wakeTime.split(separator: ":")
    guard pieces.count == 2, let hour = Int(pieces[0]), let minute = Int(pieces[1]), (0...23).contains(hour), (0...59).contains(minute) else {
      return .init(state: "error", wakeTime: nil)
    }

    guard let defaults = OkiyoWakeActionState.defaults else { return .init(state: "error", wakeTime: nil) }
    let previousID = defaults.string(forKey: OkiyoWakeActionState.wakeAlarmIdKey).flatMap(UUID.init(uuidString:))
    let previousTime = defaults.string(forKey: OkiyoWakeActionState.wakeAlarmTimeKey)
    if previousTime == wakeTime, let previousID,
       (try? manager.alarms.contains(where: { $0.id == previousID })) == true {
      return .init(state: "scheduled", wakeTime: wakeTime)
    }

    let alarmID = UUID()
    let time = Alarm.Schedule.Relative.Time(hour: hour, minute: minute)
    let weekdays: [Locale.Weekday] = [.sunday, .monday, .tuesday, .wednesday, .thursday, .friday, .saturday]
    let schedule = Alarm.Schedule.relative(.init(time: time, repeats: .weekly(weekdays)))
    let alert: AlarmPresentation.Alert
    if #available(iOS 26.1, *) {
      alert = .init(title: "おきて〜！")
    } else {
      alert = .init(
        title: "おきて〜！",
        stopButton: AlarmButton(text: "アプリで報告", textColor: .white, systemImageName: "sun.max.fill")
      )
    }
    let presentation = AlarmPresentation(alert: alert)
    let attributes = AlarmAttributes(presentation: presentation, metadata: OkiyoWakeAlarmMetadata(), tintColor: Color(red: 0.78, green: 0.22, blue: 0.0))
    let configuration = AlarmManager.AlarmConfiguration.alarm(
      schedule: schedule,
      attributes: attributes,
      stopIntent: OkiyoWakeAlarmStopIntent()
    )

    do {
      _ = try await manager.schedule(id: alarmID, configuration: configuration)
      if let previousID {
        do {
          try manager.cancel(id: previousID)
        } catch {
          try? manager.cancel(id: alarmID)
          return .init(state: "error", wakeTime: nil)
        }
      }
      defaults.set(alarmID.uuidString, forKey: OkiyoWakeActionState.wakeAlarmIdKey)
      defaults.set(wakeTime, forKey: OkiyoWakeActionState.wakeAlarmTimeKey)
      return .init(state: "scheduled", wakeTime: wakeTime)
    } catch {
      return .init(state: "error", wakeTime: nil)
    }
  }

  func stopIfAlerting() {
    guard #available(iOS 26.0, *),
          let idString = OkiyoWakeActionState.defaults?.string(forKey: OkiyoWakeActionState.wakeAlarmIdKey),
          let id = UUID(uuidString: idString),
          let alarm = try? manager.alarms.first(where: { $0.id == id }),
          alarm.state == .alerting else { return }
    try? manager.stop(id: id)
  }

  private func authorizationName(_ state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "error"
    }
  }

  private func parseTime(_ value: String) -> (hour: Int, minute: Int)? {
    let parts = value.split(separator: ":")
    guard parts.count == 2, let hour = Int(parts[0]), let minute = Int(parts[1]) else { return nil }
    return (hour, minute)
  }

  private func localeWeekday(_ day: Int) -> Locale.Weekday? {
    switch day {
    case 0: .sunday
    case 1: .monday
    case 2: .tuesday
    case 3: .wednesday
    case 4: .thursday
    case 5: .friday
    case 6: .saturday
    default: nil
    }
  }

  private func loadRegistry(from defaults: UserDefaults) -> [String: OkiyoStoredWakeAlarm] {
    guard let data = defaults.data(forKey: registryKey),
          let records = try? JSONDecoder().decode([OkiyoStoredWakeAlarm].self, from: data) else { return [:] }
    return Dictionary(uniqueKeysWithValues: records.map { ($0.id, $0) })
  }

  private func persistRegistry(_ registry: [String: OkiyoStoredWakeAlarm], to defaults: UserDefaults) {
    guard let data = try? JSONEncoder().encode(Array(registry.values)) else { return }
    defaults.set(data, forKey: registryKey)
  }
}

@available(iOS 26.0, *)
public struct OkiyoWakeAlarmStopIntent: LiveActivityIntent {
  public static let title: LocalizedStringResource = "アプリで報告"
  public static let supportedModes: IntentModes = .foreground(.immediate)

  public init() {}

  public func perform() async throws -> some IntentResult {
    OkiyoWakeActionState.defaults?.set(true, forKey: OkiyoWakeActionState.pendingAlarmStopKey)
    return .result()
  }
}

@available(iOS 26.0, *)
public struct OkiyoPersonalWakeAlarmStopIntent: LiveActivityIntent {
  public static let title: LocalizedStringResource = "停止"
  public static var openAppWhenRun: Bool { false }
  public init() {}
  public func perform() async throws -> some IntentResult { .result() }
}

