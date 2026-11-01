import { createContext } from 'react'

import type { ChatConversation } from '../types/chat'

export type ChatLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Result of sending a question. When `removed` is true nothing was stored by the backend, so the UI
 *  can put the text back into the composer. */
export type SendOutcome =
  | { ok: true; conversationId: string }
  | { ok: false; message: string; code: string; removed: boolean; draftRemoved: boolean }

export interface ChatContextValue {
  /** Conversations of the selected repository, newest activity first. */
  conversations: ChatConversation[]
  status: ChatLoadStatus
  error: string | null
  reload: () => void
  getConversation: (id: string) => ChatConversation | undefined
  /** Fetches the messages of a conversation from the backend (no-op when already loaded). */
  openConversation: (id: string) => void
  /** Starts an empty local conversation; the backend creates it with the first question. */
  createConversation: (repositoryId: string, repositoryName: string | null) => string
  sendMessage: (conversationId: string, text: string) => Promise<SendOutcome>
  /** Sends the question that belongs to an assistant message again (also used to retry an error). */
  regenerate: (conversationId: string, assistantMessageId: string) => void
  renameConversation: (id: string, title: string) => void
  deleteConversation: (id: string) => void
  /** true while the backend is working on an answer for this conversation. */
  isBusy: (conversationId: string) => boolean
  /** Last rename/delete failure, for a small inline message. */
  actionError: string | null
  clearActionError: () => void
}

export const ChatContext = createContext<ChatContextValue | null>(null)
