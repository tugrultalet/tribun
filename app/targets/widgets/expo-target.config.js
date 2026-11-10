// Tribün widget hedefi (com.sportvisor.tribun.widgets): ana ekran widget'ı ve maç Live Activity'si (kilit ekranı + Dynamic Island).
// Uygulamayla veri paylaşımı App Group üzerinden (group.com.sportvisor.tribun).
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'TribunWidgets',
  displayName: 'Tribün',
  bundleIdentifier: '.widgets',
  deploymentTarget: '18.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  colors: {
    $accent: '#9DB1FF',
    $widgetBackground: '#0B1030',
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
