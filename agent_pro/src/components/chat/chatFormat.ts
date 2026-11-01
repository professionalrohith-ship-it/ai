import type { ChatConversation } from '../../types/chat'

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** One-line plain-text preview of a Markdown answer. */
export function plainPreview(markdown: string, limit = 72): string {
  const source = markdown.replace(/^>.*$/gm, '')
  const text = source
    .split('\n')
    .find((line) => line.trim() !== '' && !line.startsWith('#') && !line.startsWith('|'))
  const clean = (text ?? '').replace(/[*_`>#|]/g, '').replace(/\s+/g, ' ').trim()
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean
}

export function lastMessagePreview(conversation: ChatConversation): string {
  const last = conversation.messages[conversation.messages.length - 1]
  if (!last) return conversation.messageCount ? `${conversation.messageCount} messages` : 'No messages yet'
  if (last.role === 'user') return last.content.replace(/\s+/g, ' ').slice(0, 72)
  if (last.status === 'streaming') return 'Agents are working…'
  if (last.status === 'error') return 'The answer failed'
  return plainPreview(last.content)
}

export function conversationMatches(conversation: ChatConversation, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    conversation.title.toLowerCase().includes(needle) ||
    conversation.messages.some((message) => message.content.toLowerCase().includes(needle))
  )
}
