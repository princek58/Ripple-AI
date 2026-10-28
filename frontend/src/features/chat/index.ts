// Chat feature – public API surface
export { screenFromPath, contextIdsFromUrl } from './urlHelpers.js';
export { chatErrorMessage } from './errorMessages.js';
export { trimHistory } from './trimHistory.js';
export { ChatProvider, useChat } from './ChatProvider.js';
export type { ChatMessage, ChatContextValue } from './ChatProvider.js';
export { ChatPanel } from './ChatPanel.js';
export { ChatCircle } from './ChatCircle.js';
export {
  fetchAiStatus,
  fetchProjectAiSettings,
  putProjectAiSettings,
  postChatMessage,
  streamChatMessage,
} from './chatApi.js';
export type {
  ChatScreen,
  ContextIds,
  ChatLang,
  HistoryEntry,
  AiStatusData,
  ProjectAiSettings,
  ChatResponseData,
  StreamChunk,
} from './types.js';
