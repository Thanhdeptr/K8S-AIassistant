const config = require('@rancher/shell/vue.config'); // eslint-disable-line @typescript-eslint/no-var-requires

// Get base config from Rancher shell
const baseConfig = config(__dirname, {
  excludes: ['clock', 'extension-crd', 'extensions-api-demo', 'homepage', 'large-extension', 'node-driver', 'uk-locale'],
  // Chỉ chạy top-level-product plugin
});

// Override devServer proxy configuration
if (!baseConfig.devServer) {
  baseConfig.devServer = {};
}
if (!baseConfig.devServer.proxy) {
  baseConfig.devServer.proxy = {};
}

// Add our custom proxy for /api/chat
baseConfig.devServer.proxy['/api/chat'] = {
  target: 'http://192.168.10.18:8055',
  changeOrigin: true,
  secure: false,
  logLevel: 'debug'
};

module.exports = baseConfig;
