import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { NOT_STORED_CODES } from '../constants/chat'
import { useAppData } from '../hooks/useAppData'
import { chatApi } from '../services/api/chat'
import { ApiRequestError, errorMessage } from '../services/http'
import type { ChatConversation, ChatMessage } from '../types/chat'
import { ChatContext, type ChatContextValue, type ChatLoadStatus, type SendOutcome } from './chatContext'

// Conversations are stored by the backend. This provider keeps a per-repository cache of them, loads
// messages when a conversation is opened and sends questions to POST /repositories/{id}/chat.

const DRAFT_PREFIX = 'new-'
const isDraft = (id: string) => id.startsWith(DRAFT_PREFIX)
const TITLE_LIMIT = 60

let counter = 0
const localId = (prefix: string) => {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`
}

const titleFrom = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, TITLE_LIMIT)
const byActivity = (a: ChatConversation, b: ChatConversation) => b.updatedAt.localeCompare(a.updatedAt)

type Store = Record<string, ChatConversation[]>

export function ChatProvider({ children }: { children: ReactNode }) {
  const { selectedRepository } = useAppData()
  const repositoryId = selectedRepository?.id ?? null
  const repositoryName = selectedRepository?.name ?? null

  const [store, setStore] = useState<Store>({})
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState<{ repositoryId: string; error: string | null } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const opening = useRef(new Set<string>())
  // drafts created in the same event handler that sends the first message are not in `conversations` yet
  const draftEntries = useRef(new Map<string, ChatConversation>())

  // ---- load the conversation list whenever the selected repository changes -----------------------
  useEffect(() => {
    if (!repositoryId) return
    let cancelled = false
    chatApi
      .listConversations(repositoryId, repositoryName)
      .then((list) => {
        if (cancelled) return
        setStore((current) => {
          const existing = current[repositoryId] ?? []
          const known = new Map(existing.map((entry) => [entry.id, entry]))
          const merged = list.map((entry) => {
            const previous = known.get(entry.id)
            return previous?.loaded ? { ...entry, messages: previous.messages, loaded: true } : entry
          })
          const drafts = existing.filter((entry) => isDraft(entry.id))
          return { ...current, [repositoryId]: [...drafts, ...merged] }
        })
        setLoaded({ repositoryId, error: null })
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLoaded({ repositoryId, error: errorMessage(reason, 'Could not load conversations.') })
      })
    return () => {
      cancelled = true
    }
    // repositoryName only affects display of freshly loaded entries
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryId, attempt])

  const conversations = useMemo(() => [...(repositoryId ? (store[repositoryId] ?? []) : [])].sort(byActivity), [store, repositoryId])

  const status: ChatLoadStatus = !repositoryId
    ? 'idle'
    : loaded?.repositoryId !== repositoryId
      ? 'loading'
      : loaded.error
        ? 'error'
        : 'ready'
  const error = status === 'error' ? (loaded?.error ?? null) : null

  const reload = useCallback(() => {
    setLoaded(null)
    setAttempt((value) => value + 1)
  }, [])

  const resolve = useCallback((id: string) => aliases[id] ?? id, [aliases])

  const getConversation = useCallback(
    (id: string) => {
      const real = resolve(id)
      return conversations.find((entry) => entry.id === real)
    },
    [conversations, resolve],
  )

  /** Applies `change` to one conversation of one repository. */
  const patch = useCallback((repoId: string, id: string, change: (entry: ChatConversation) => ChatConversation) => {
    setStore((current) => ({ ...current, [repoId]: (current[repoId] ?? []).map((entry) => (entry.id === id ? change(entry) : entry)) }))
  }, [])

  const remove = useCallback((repoId: string, id: string) => {
    setStore((current) => ({ ...current, [repoId]: (current[repoId] ?? []).filter((entry) => entry.id !== id) }))
  }, [])

  // ---- open (load messages) -------------------------------------------------------------------
  const openConversation = useCallback(
    (id: string) => {
      const real = resolve(id)
      const entry = conversations.find((item) => item.id === real)
      if (!entry || entry.loaded || isDraft(real) || opening.current.has(real) || !entry.repositoryId) return
      const repoId = entry.repositoryId
      opening.current.add(real)
      chatApi
        .getConversation(real, entry.repositoryName)
        .then((full) => patch(repoId, real, () => full))
        .catch((reason: unknown) => patch(repoId, real, (current) => ({ ...current, loadError: errorMessage(reason, 'Could not load this conversation.') })))
        .finally(() => opening.current.delete(real))
    },
    [conversations, patch, resolve],
  )

  const createConversation = useCallback((repoId: string, repoName: string | null) => {
    const now = new Date().toISOString()
    const entry: ChatConversation = {
      id: `${DRAFT_PREFIX}${localId('conv')}`,
      title: 'New conversation',
      repositoryId: repoId,
      repositoryName: repoName,
      createdAt: now,
      updatedAt: now,
      messages: [],
      loaded: true,
    }
    draftEntries.current.set(entry.id, entry)
    setStore((current) => ({ ...current, [repoId]: [entry, ...(current[repoId] ?? [])] }))
    return entry.id
  }, [])

  const conversationsRef = useRef(conversations)
  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  // ---- send -----------------------------------------------------------------------------------
  const sendMessage = useCallback(
    async (conversationId: string, text: string): Promise<SendOutcome> => {
      const prompt = text.trim()
      const id = resolve(conversationId)
      const entry = conversations.find((item) => item.id === id) ?? draftEntries.current.get(id)
      const repoId = entry?.repositoryId
      const failure = (message: string): SendOutcome => ({ ok: false, message, code: 'invalid_state', removed: false, draftRemoved: false })
      if (!prompt || !entry || !repoId) return failure('There is no conversation to send this message to.')
      if (entry.messages.some((message) => message.status === 'streaming')) return failure('Wait for the current answer to finish.')

      const now = new Date().toISOString()
      const userMessage: ChatMessage = { id: localId('msg'), role: 'user', content: prompt, createdAt: now, status: 'complete' }
      const assistantMessage: ChatMessage = { id: localId('msg'), role: 'assistant', content: '', createdAt: now, status: 'streaming' }
      patch(repoId, id, (current) => ({
        ...current,
        title: current.messages.length === 0 ? titleFrom(prompt) : current.title,
        updatedAt: now,
        messages: [...current.messages, userMessage, assistantMessage],
      }))

      try {
        const reply = await chatApi.send(repoId, prompt, isDraft(id) ? undefined : id)
        setStore((current) => ({
          ...current,
          [repoId]: (current[repoId] ?? []).map((item) => {
            if (item.id !== id) return item
            const messages = item.messages.map((message) =>
              message.id === userMessage.id ? reply.userMessage : message.id === assistantMessage.id ? reply.assistantMessage : message,
            )
            return { ...item, id: reply.conversationId, updatedAt: reply.assistantMessage.createdAt, messages, messageCount: messages.length, loaded: true }
          }),
        }))
        if (reply.conversationId !== id) setAliases((current) => ({ ...current, [id]: reply.conversationId }))
        return { ok: true, conversationId: reply.conversationId }
      } catch (reason) {
        const code = reason instanceof ApiRequestError ? reason.code : 'error'
        const message = errorMessage(reason, 'The answer could not be completed.')

        if (NOT_STORED_CODES.has(code)) {
          // the backend stored nothing: take the optimistic messages back out
          const draftRemoved = isDraft(id) && entry.messages.length === 0
          setStore((current) => ({
            ...current,
            [repoId]: (current[repoId] ?? []).flatMap((item) => {
              if (item.id !== id) return [item]
              if (draftRemoved) return []
              return [{ ...item, messages: item.messages.filter((m) => m.id !== userMessage.id && m.id !== assistantMessage.id) }]
            }),
          }))
          return { ok: false, message, code, removed: true, draftRemoved }
        }

        // provider failure / timeout: the question may be stored, keep an error bubble with "Try again"
        patch(repoId, id, (current) => ({
          ...current,
          messages: current.messages.map((m) => (m.id === assistantMessage.id ? { ...m, status: 'error' as const, errorMessage: message } : m)),
        }))
        if (isDraft(id)) void adoptStoredDraft(repoId, id, prompt)
        return { ok: false, message, code, removed: false, draftRemoved: false }
      }

      /** After a provider failure the backend still created the conversation: find it and use its real id. */
      async function adoptStoredDraft(repo: string, draftId: string, question: string) {
        try {
          const list = await chatApi.listConversations(repo, entry?.repositoryName ?? null)
          const title = titleFrom(question)
          const known = new Set(conversationsRef.current.map((item) => item.id))
          const match = list.filter((item) => item.title === title && !known.has(item.id)).sort(byActivity)[0]
          if (!match) return
          const full = await chatApi.getConversation(match.id, entry?.repositoryName ?? null)
          setStore((current) => ({ ...current, [repo]: (current[repo] ?? []).map((item) => (item.id === draftId ? full : item)) }))
          setAliases((current) => ({ ...current, [draftId]: match.id }))
        } catch {
          // keep the local error bubble
        }
      }
    },
    [conversations, patch, resolve],
  )

  const regenerate = useCallback(
    (conversationId: string, assistantMessageId: string) => {
      const entry = getConversation(conversationId)
      if (!entry) return
      const index = entry.messages.findIndex((message) => message.id === assistantMessageId)
      const question = index > 0 ? entry.messages[index - 1] : undefined
      if (!question || question.role !== 'user') return
      void sendMessage(entry.id, question.content)
    },
    [getConversation, sendMessage],
  )

  // ---- rename / delete ------------------------------------------------------------------------
  const renameConversation = useCallback(
    (id: string, title: string) => {
      const real = resolve(id)
      const entry = conversations.find((item) => item.id === real)
      const clean = title.replace(/\s+/g, ' ').trim().slice(0, 80)
      if (!entry || !entry.repositoryId || !clean) return
      const repoId = entry.repositoryId
      if (isDraft(real)) {
        patch(repoId, real, (current) => ({ ...current, title: clean }))
        return
      }
      chatApi
        .rename(real, clean)
        .then(() => patch(repoId, real, (current) => ({ ...current, title: clean })))
        .catch((reason: unknown) => setActionError(errorMessage(reason, 'Could not rename the conversation.')))
    },
    [conversations, patch, resolve],
  )

  const deleteConversation = useCallback(
    (id: string) => {
      const real = resolve(id)
      const entry = conversations.find((item) => item.id === real)
      if (!entry || !entry.repositoryId) return
      const repoId = entry.repositoryId
      if (isDraft(real)) {
        remove(repoId, real)
        return
      }
      chatApi
        .remove(real)
        .then(() => remove(repoId, real))
        .catch((reason: unknown) => setActionError(errorMessage(reason, 'Could not delete the conversation.')))
    },
    [conversations, remove, resolve],
  )

  const value = useMemo<ChatContextValue>(
    () => ({
      conversations,
      status,
      error,
      reload,
      getConversation,
      openConversation,
      createConversation,
      sendMessage,
      regenerate,
      renameConversation,
      deleteConversation,
      isBusy: (id) => (getConversation(id)?.messages ?? []).some((message) => message.status === 'streaming'),
      actionError,
      clearActionError: () => setActionError(null),
    }),
    [conversations, status, error, reload, getConversation, openConversation, createConversation, sendMessage, regenerate, renameConversation, deleteConversation, actionError],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
