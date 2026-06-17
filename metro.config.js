const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Register .tflite as a binary asset extension so Metro can bundle the
// MoveNet model file instead of trying to parse it as JavaScript.
config.resolver.assetExts.push('tflite');

module.exports = config;