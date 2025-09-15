import { importTypes } from '@rancher/auto-import';
import { IPlugin } from '@shell/core/types';
import extensionRouting from './routing/extension-routing';

// Init the package
export default function(plugin: IPlugin) {
  // Auto-import model, detail, edit from the folders
  importTypes(plugin);
  // Provide extension metadata from package.json
  // it will grab information such as `name` and `description`
  plugin.metadata = require('./package.json');
  // Load a product - sử dụng dynamic import
  import('./product').then(productModule => {
    plugin.addProduct(productModule.default || productModule);
  }).catch(error => {
    console.error('Error loading product:', error);
  });
  // Add Vue Routes
  plugin.addRoutes(extensionRouting);
}
