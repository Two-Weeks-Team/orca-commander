require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))
Pod::Spec.new do |s|
  s.name = 'DeckFeedback'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = package['license']
  s.author = 'Orca Deck contributors'
  s.homepage = 'https://github.com/Two-Weeks-Team/orca-commander'
  s.source = { :git => 'https://github.com/Two-Weeks-Team/orca-commander.git' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AudioToolbox'
  s.source_files = '**/*.{h,m,swift}'
  s.resource_bundles = { 'DeckFeedbackResources' => ['Resources/deck_click.wav'] }
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
end
