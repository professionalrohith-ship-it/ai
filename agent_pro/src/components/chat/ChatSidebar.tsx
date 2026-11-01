import { EllipsisVertical, MessageSquarePlus, MessagesSquare, Pencil, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { ChatConversation } from '../../types/chat'
import { cn } from '../../utils/cn'
import { timeAgo } from '../../utils/format'
import { EmptyState } from '../common/EmptyState'
import { ConfirmationModal } from '../ui/ConfirmationModal'
import { DropdownItem, DropdownMenu } from '../ui/DropdownMenu'
import { TextInput } from '../ui/FormControls'
import { Modal } from '../ui/Modal'
import { PrimaryButton } from '../ui/PrimaryButton'
import { SearchInput } from '../ui/SearchInput'
import { conversationMatches, lastMessagePreview } from './chatFormat'

interface ChatSidebarProps {
  conversations: ChatConversation[]
  activeId: string | null
  onNewChat: () => void
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

/** Conversation history: search, new chat, select, rename (modal) and delete (confirmation). */
export function ChatSidebar({ conversations, activeId, onNewChat, onSelect, onRename, onDelete }: ChatSidebarProps) {
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<ChatConversation | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | undefined>()
  const [deleting, setDeleting] = useState<ChatConversation | null>(null)

  const visible = useMemo(() => conversations.filter((conversation) => conversationMatches(conversation, query)), [conversations, query])

  const startRename = (conversation: ChatConversation) => {
    setRenaming(conversation)
    setRenameValue(conversation.title)
    setRenameError(undefined)
  }

  const submitRename = () => {
    const clean = renameValue.replace(/\s+/g, ' ').trim()
    if (!clean) return setRenameError('Enter a name for this conversation.')
    if (clean.length > 80) return setRenameError('Use 80 characters or fewer.')
    if (renaming) onRename(renaming.id, clean)
    setRenaming(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-line p-3.5">
        <PrimaryButton className="w-full" icon={<MessageSquarePlus className="size-4" aria-hidden="true" />} onClick={onNewChat}>
          New chat
        </PrimaryButton>
        <SearchInput value={query} onChange={setQuery} label="Search conversations" placeholder="Search chat history" />
      </div>

      <nav aria-label="Conversation history" className="min-h-0 flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="No conversations yet"
            description="Start a new chat and it will be saved here."
            className="m-1 px-4 py-8"
          />
        ) : visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-mute">No conversations match &ldquo;{query.trim()}&rdquo;.</p>
        ) : (
          <ul className="space-y-1">
            {visible.map((conversation) => {
              const active = conversation.id === activeId
              return (
                <li key={conversation.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative block w-full min-w-0 rounded-lg px-3 py-2.5 pr-10 text-left transition-colors',
                      active ? 'bg-brand/12' : 'hover:bg-white/5',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn('absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r-full bg-brand transition', active ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className={cn('block truncate text-[0.8125rem] font-medium', active ? 'text-ink' : 'text-ink/90')}>
                      {conversation.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-mute">{lastMessagePreview(conversation)}</span>
                    <span className="mt-1 block text-[0.6875rem] text-[#6f6f6f]">{timeAgo(conversation.updatedAt)}</span>
                  </button>
                  <div className="absolute top-1.5 right-1">
                    <DropdownMenu
                      ariaLabel={`Actions for ${conversation.title}`}
                      triggerClassName="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-white/10 hover:text-ink"
                      trigger={<EllipsisVertical className="size-4" aria-hidden="true" />}
                      panelClassName="w-44"
                    >
                      {({ close }) => (
                        <div className="py-1">
                          <DropdownItem
                            icon={<Pencil className="size-4" aria-hidden="true" />}
                            onClick={() => {
                              close()
                              startRename(conversation)
                            }}
                          >
                            Rename
                          </DropdownItem>
                          <DropdownItem
                            danger
                            icon={<Trash2 className="size-4" aria-hidden="true" />}
                            onClick={() => {
                              close()
                              setDeleting(conversation)
                            }}
                          >
                            Delete
                          </DropdownItem>
                        </div>
                      )}
                    </DropdownMenu>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename conversation"
        footer={
          <>
            <PrimaryButton variant="secondary" onClick={() => setRenaming(null)}>
              Cancel
            </PrimaryButton>
            <PrimaryButton onClick={submitRename}>Save name</PrimaryButton>
          </>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submitRename()
          }}
        >
          <TextInput
            label="Conversation name"
            value={renameValue}
            onChange={(event) => {
              setRenameValue(event.target.value)
              setRenameError(undefined)
            }}
            error={renameError}
            autoFocus
            maxLength={120}
          />
        </form>
      </Modal>

      <ConfirmationModal
        open={deleting !== null}
        danger
        title="Delete this conversation?"
        description={`"${deleting?.title ?? ''}" and its messages will be deleted.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleting) onDelete(deleting.id)
          setDeleting(null)
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
