module.exports = function (api) {
  const isWeb = api.caller((caller) => caller && caller.platform === 'web');
  api.cache.using(() => isWeb);
  
  const plugins = [];
  if (isWeb) {
    plugins.push([
      "module-resolver",
      {
        alias: {
          "@react-native-ml-kit/text-recognition": "./src/mocks/ml-kit.js"
        }
      }
    ]);
  }

  return {
    presets: ["babel-preset-expo"],
    plugins,
  };
};
