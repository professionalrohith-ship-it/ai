import { useContext } from 'react'

import { ChatContext, type ChatContextValue } from '../context/chatContext'

export function useChat(): ChatContextValue {
  const value = useContext(ChatContext)
  if (!value) throw new Error('useChat must be used inside <ChatProvider>')
  return value
}
