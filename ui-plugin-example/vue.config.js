const config = require('@rancher/shell/vue.config'); // eslint-disable-line @typescript-eslint/no-var-requires

module.exports = config(__dirname, {
  excludes: ['clock', 'extension-crd', 'extensions-api-demo', 'homepage', 'large-extension', 'node-driver', 'uk-locale'],
  // Chỉ chạy top-level-product plugin
});
