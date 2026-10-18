require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'OkiyoWakeAction'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = 'Okiyo'
  s.homepage       = 'https://github.com/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '6.0'
  s.source         = { git: 'https://github.com/expo/expo.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoNotifications'
  s.dependency 'ExpoWidgets'
  s.weak_frameworks = 'AlarmKit'
  s.source_files = '**/*.swift'
end
