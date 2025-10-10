const config = require('@rancher/shell/vue.config'); // eslint-disable-line @typescript-eslint/no-var-requires

module.exports = config(__dirname, {
  excludes: ['clock', 'extension-crd', 'extensions-api-demo', 'homepage', 'large-extension', 'node-driver', 'uk-locale'],
  // Chỉ chạy top-level-product plugin
  devServer: {
    proxy: {
      // Proxy to Rancher backend chính trên port 8443
      '/v3': {
        target: 'https://192.168.10.18:8443',
        changeOrigin: true,
        secure: false,
        logLevel: 'debug',
        headers: {
          'Connection': 'keep-alive'
        }
      },
      '/v1': {
        target: 'https://192.168.10.18:8443',
        changeOrigin: true,
        secure: false,
        logLevel: 'debug',
        headers: {
          'Connection': 'keep-alive'
        }
      },
      '/rancherversion': {
        target: 'https://192.168.10.18:8443',
        changeOrigin: true,
        secure: false,
        logLevel: 'debug',
        headers: {
          'Connection': 'keep-alive'
        }
      },
      // Proxy API calls đến backend của chúng ta
      '/api/chat': {
        target: 'http://192.168.10.18:8055',
        changeOrigin: true,
        secure: false,
        logLevel: 'debug'
      }
    }
  }
});
