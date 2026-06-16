const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// These packages use modern JS features (private class properties)
// that Hermes can't handle unless Metro transforms them through Babel
const PACKAGES_TO_TRANSFORM = [
  'react-native',
  '@react-native',
  '@react-navigation',
  'expo',
  '@expo',
  'react-native-vision-camera',
  'react-native-worklets-core',
];

config.resolver.transformIgnorePatterns = [
  `node_modules/(?!(${PACKAGES_TO_TRANSFORM.join('|')}))`,
];

module.exports = config;