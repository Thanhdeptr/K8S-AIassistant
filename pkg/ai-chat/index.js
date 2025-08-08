import ChatPage from './src/pages/ChatPage.vue';

export default function(plugin) {
  plugin.register('ai-chat', {
    name: 'AI Chat',
    icon: 'chat',
    route: '/ai-chat',
    component: ChatPage
  });
}
