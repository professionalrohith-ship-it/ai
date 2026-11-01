import { FolderGit2, MessageSquareX, ServerCrash } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Skeleton } from '../../components/common/LoadingState'
import { EmptyState } from '../../components/common/EmptyState'
import { ChatComposer } from '../../components/chat/ChatComposer'
import { ChatContextPanel } from '../../components/chat/ChatContextPanel'
import { ChatHeader } from '../../components/chat/ChatHeader'
import { ChatMessage } from '../../components/chat/ChatMessage'
import { ChatSidebar } from '../../components/chat/ChatSidebar'
import { ChatWelcomeScreen } from '../../components/chat/ChatWelcomeScreen'
import { Drawer } from '../../components/ui/Drawer'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { SUGGESTED_PROMPTS } from '../../constants/chat'
import { chatPath, explorerPath, ROUTES } from '../../constants/navigation'
import { useAppData } from '../../hooks/useAppData'
import { useChat } from '../../hooks/useChat'
import { chatLayoutFor, useElementWidth } from '../../hooks/useChatLayout'
import { usePersistentState } from '../../hooks/usePersistentState'
import { getAiStatus, type AiStatus } from '../../services/api/ai'
import './AIChat.css'

/** A failed first message navigates back to /chat, which remounts this page: carry the text and notice over. */
const CARRY_KEY = 'codemind.chat.carry'

function carryOver(value: { text: string; notice: string | null }) {
  try {
    sessionStorage.setItem(CARRY_KEY, JSON.stringify(value))
  } catch {
    // storage unavailable: the user simply has to retype
  }
}

function takeCarried(): { text: string; notice: string | null } {
  try {
    const raw = sessionStorage.getItem(CARRY_KEY)
    sessionStorage.removeItem(CARRY_KEY)
    if (raw) return JSON.parse(raw) as { text: string; notice: string | null }
  } catch {
    // ignore
  }
  return { text: '', notice: null }
}

export default function AIChat() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const { status, selectedRepository } = useAppData()
  const chat = useChat()

  const [rootRef, width] = useElementWidth<HTMLDivElement>()
  const layout = chatLayoutFor(width)

  const [panelOpen, setPanelOpen] = usePersistentState('codemind.chat.panel', true)
  const [historyDrawer, setHistoryDrawer] = useState(false)
  const [activityDrawer, setActivityDrawer] = useState(false)
  const [carried] = useState(takeCarried)
  const [draft, setDraft] = useState(carried.text)
  const [sendNotice, setSendNotice] = useState<string | null>(carried.notice)
  const [ai, setAi] = useState<AiStatus | null>(null)

  const conversation = conversationId ? chat.getConversation(conversationId) : undefined
  const chatReady = chat.status === 'ready'
  const missing = Boolean(conversationId) && !conversation && chatReady
  const busy = conversation ? chat.isBusy(conversation.id) : false
  const loadingMessages = Boolean(conversation) && !conversation?.loaded && !conversation?.loadError

  const repositoryName = conversation?.repositoryName ?? selectedRepository?.name ?? null
  const messages = conversation?.messages ?? []
  const latest = [...messages].reverse().find((message) => message.role === 'assistant') ?? null
  const lastAssistantId = latest?.id ?? null

  // Is an AI provider configured? (scanning, parsing and dependency analysis work without one)
  useEffect(() => {
    let cancelled = false
    getAiStatus()
      .then((result) => {
        if (!cancelled) setAi(result)
      })
      .catch(() => {
        if (!cancelled) setAi(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // load the messages of the opened conversation
  const openConversation = chat.openConversation
  useEffect(() => {
    if (conversationId) openConversation(conversationId)
  }, [conversationId, openConversation, conversation?.loaded])

  // ---- keep the newest message in view (unless the reader scrolled up) ----
  const scrollerRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const lastConversation = useRef<string | undefined>(undefined)
  const routeId = useRef(conversationId)
  useEffect(() => {
    routeId.current = conversationId
  }, [conversationId])

  useEffect(() => {
    const element = scrollerRef.current
    if (!element) return
    const switched = lastConversation.current !== conversationId
    lastConversation.current = conversationId
    if (switched) stickToBottom.current = true
    if (stickToBottom.current) element.scrollTo({ top: element.scrollHeight, behavior: switched ? 'auto' : 'smooth' })
  }, [conversation?.messages, conversationId])

  const handleScroll = () => {
    const element = scrollerRef.current
    if (!element) return
    stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 140
  }

  // ---- actions ----
  const repositoryId = conversation?.repositoryId ?? selectedRepository?.id ?? null
  const openFile = (path: string, line?: number) => navigate(explorerPath({ file: path, line, repositoryId: repositoryId ?? undefined }))

  const send = async (text: string) => {
    const prompt = text.trim()
    if (!prompt || busy) return
    let id = conversation?.id
    if (!id) {
      if (!selectedRepository) return
      id = chat.createConversation(selectedRepository.id, selectedRepository.name)
      navigate(chatPath(id))
    }
    stickToBottom.current = true
    setDraft('')
    setSendNotice(null)
    chat.clearActionError()
    const sentFrom = id
    const outcome = await chat.sendMessage(id, prompt)
    if (outcome.ok) {
      // the backend gave a brand-new conversation its real id: follow it if the user is still looking at it
      if (outcome.conversationId !== sentFrom && routeId.current === sentFrom) navigate(chatPath(outcome.conversationId), { replace: true })
    } else if (outcome.removed) {
      // nothing was stored (AI not configured, repository not scanned, backend down): give the text back
      setDraft(prompt)
      setSendNotice(outcome.message)
      if (outcome.draftRemoved && routeId.current === sentFrom) {
        carryOver({ text: prompt, notice: outcome.message })
        navigate(ROUTES.chat, { replace: true })
      }
    }
  }

  const deleteConversation = (id: string) => {
    chat.deleteConversation(id)
    if (id === conversationId) navigate(ROUTES.chat)
  }

  const goToConversation = (id: string) => {
    setHistoryDrawer(false)
    navigate(chatPath(id))
  }

  const newChat = () => {
    setHistoryDrawer(false)
    setDraft('')
    setSendNotice(null)
    navigate(ROUTES.chat)
  }

  const toggleActivity = () => (layout === 'full' ? setPanelOpen(!panelOpen) : setActivityDrawer(true))

  const sidebar = (
    <ChatSidebar
      conversations={chat.conversations}
      activeId={conversation?.id ?? null}
      onNewChat={newChat}
      onSelect={goToConversation}
      onRename={chat.renameConversation}
      onDelete={deleteConversation}
    />
  )

  const panel = (
    <ChatContextPanel
      repositoryName={repositoryName}
      repositoryPath={conversation ? (selectedRepository?.id === conversation.repositoryId ? selectedRepository.path : null) : (selectedRepository?.path ?? null)}
      latest={latest}
      onOpenFile={openFile}
    />
  )

  const noRepository = !conversation && !missing && status === 'ready' && !selectedRepository

  let body
  if (missing) {
    body = (
      <div className="grid min-h-full place-items-center p-6">
        <EmptyState
          icon={MessageSquareX}
          title="Conversation not found"
          description="This conversation may have been deleted, or it belongs to another repository. Start a new chat or pick one from the history."
          action={<PrimaryButton onClick={newChat}>Start a new chat</PrimaryButton>}
        />
      </div>
    )
  } else if (chat.status === 'error' && !conversation) {
    body = (
      <div className="grid min-h-full place-items-center p-6">
        <EmptyState
          icon={ServerCrash}
          title="Could not load your conversations"
          description={chat.error ?? 'The backend did not answer.'}
          action={<PrimaryButton onClick={chat.reload}>Try again</PrimaryButton>}
        />
      </div>
    )
  } else if (conversation?.loadError) {
    body = (
      <div className="grid min-h-full place-items-center p-6">
        <EmptyState
          icon={ServerCrash}
          title="Could not load this conversation"
          description={conversation.loadError}
          action={<PrimaryButton onClick={chat.reload}>Reload</PrimaryButton>}
        />
      </div>
    )
  } else if ((status === 'loading' || (chat.status === 'loading' && Boolean(conversationId))) && !conversation) {
    body = (
      <div className="space-y-4 p-6">
        <Skeleton className="mx-auto h-14 w-14" />
        <Skeleton className="mx-auto h-6 w-72" />
        <Skeleton className="mx-auto h-4 w-96 max-w-full" />
      </div>
    )
  } else if (noRepository) {
    body = (
      <div className="grid min-h-full place-items-center p-6">
        <EmptyState
          icon={FolderGit2}
          title="Select a repository to start chatting"
          description="AI Repository Chat answers questions about one repository at a time. Choose or add a repository first."
          action={
            <Link
              to={ROUTES.repositories}
              className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white transition hover:bg-brand-hover"
            >
              Open Repository Management
            </Link>
          }
        />
      </div>
    )
  } else if (loadingMessages) {
    body = (
      <div className="mx-auto w-full max-w-4xl space-y-4 px-5 py-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  } else if (messages.length === 0) {
    body = <ChatWelcomeScreen prompts={SUGGESTED_PROMPTS} onPick={send} repositoryName={repositoryName} />
  } else {
    body = (
      <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-6 max-sm:px-3">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            canRegenerate={!busy && message.id === lastAssistantId}
            onRegenerate={(id) => conversation && chat.regenerate(conversation.id, id)}
            onOpenFile={openFile}
          />
        ))}
      </div>
    )
  }

  // one notice above the composer: the latest failure beats the standing "AI not configured" hint
  const notice = sendNotice
    ? { tone: 'warn' as const, text: sendNotice }
    : chat.actionError
      ? { tone: 'warn' as const, text: chat.actionError }
      : ai && !ai.configured
        ? { tone: 'info' as const, text: ai.message }
        : null

  return (
    <div ref={rootRef} className="chat-workspace @container flex min-h-0 gap-4 animate-fade-up">
      {layout !== 'compact' && (
        <aside
          aria-label="Chat history"
          className={`${layout === 'full' ? 'w-[17rem]' : 'w-[15rem]'} shrink-0 overflow-hidden rounded-card border border-line bg-card shadow-card`}
        >
          {sidebar}
        </aside>
      )}

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-card shadow-card">
        <ChatHeader
          title={conversation?.title ?? 'New conversation'}
          repositoryName={repositoryName}
          showHistoryButton={layout === 'compact'}
          onOpenHistory={() => setHistoryDrawer(true)}
          activityOpen={layout === 'full' ? panelOpen : activityDrawer}
          onToggleActivity={toggleActivity}
          aiConfigured={ai ? ai.configured : null}
          aiLabel={ai?.configured ? [ai.provider, ai.model].filter(Boolean).join(' · ') : null}
        />
        <div ref={scrollerRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
          {body}
        </div>
        {!missing && !noRepository && (
          <ChatComposer value={draft} onChange={setDraft} onSend={send} busy={busy} repositoryName={repositoryName} notice={notice} />
        )}
      </section>

      {layout === 'full' && panelOpen && (
        <aside
          aria-label="Agent activity and context"
          className="w-[20rem] shrink-0 overflow-y-auto rounded-card border border-line bg-card shadow-card"
        >
          {panel}
        </aside>
      )}

      <Drawer open={historyDrawer && layout === 'compact'} onClose={() => setHistoryDrawer(false)} title="Chat history" side="left">
        {sidebar}
      </Drawer>
      <Drawer open={activityDrawer && layout !== 'full'} onClose={() => setActivityDrawer(false)} title="Agent activity & context">
        {panel}
      </Drawer>
    </div>
  )
}
