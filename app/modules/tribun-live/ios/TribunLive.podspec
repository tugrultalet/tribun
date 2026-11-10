Pod::Spec.new do |s|
  s.name           = 'TribunLive'
  s.version        = '1.0.0'
  s.summary        = 'Tribün: maç Live Activity köprüsü'
  s.description    = 'Uygulamadan maç Live Activity başlatır/bitirir; güncellemeler sunucudan APNs yayın kanalıyla gelir.'
  s.author         = 'Tribün'
  s.homepage       = 'https://tribunapp.io'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.weak_frameworks = 'ActivityKit'
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift}'
end
