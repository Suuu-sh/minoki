const { withInfoPlist } = require('@expo/config-plugins');

module.exports = function withAlarmKit(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.NSAlarmKitUsageDescription =
      'Okiyo uses AlarmKit to ring at your chosen wake-up time, even when the app is closed.';
    return mod;
  });
};
