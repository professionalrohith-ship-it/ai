import { Folder, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { listSuggestedFolders } from '../../services/api/repositories'
import { errorMessage } from '../../services/http'
import type { SuggestedFolder } from '../../types/repository'
import { Notice } from './Notice'

interface FolderPickerPanelProps {
  onPick: (folder: SuggestedFolder) => void
}

/**
 * A web page cannot browse your disk, so the backend suggests likely project folders (Git repositories
 * or folders with a package manifest under Desktop, Documents and similar). Only names are listed.
 */
export function FolderPickerPanel({ onPick }: FolderPickerPanelProps) {
  const [folders, setFolders] = useState<SuggestedFolder[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listSuggestedFolders()
      .then((items) => {
        if (!cancelled) setFolders(items)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason, 'Suggested folders could not be loaded.'))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="rounded-xl border border-line bg-surface/70 p-3.5">
      <Notice tone="info" className="mb-3">
        <span className="font-semibold">Suggested folders.</span> A browser cannot browse your computer, so these project folders were found by
        the backend. If yours is not listed, type its full path instead.
      </Notice>
      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : folders === null ? (
        <p className="flex items-center gap-2 px-1 py-3 text-xs text-mute">
          <Loader2 className="size-4 animate-spin text-brand" aria-hidden="true" />
          Looking for project folders...
        </p>
      ) : folders.length === 0 ? (
        <p className="px-1 py-3 text-xs text-mute">No project folders were found in the usual places. Type the path instead.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-1.5">
          {folders.map((folder) => (
            <li key={folder.path}>
              <button
                type="button"
                onClick={() => onPick(folder)}
                className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-brand/40 hover:bg-brand/10"
              >
                <Folder className="size-4 shrink-0 text-brand" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{folder.name}</span>
                  <span className="block truncate font-mono text-xs text-mute">{folder.path}</span>
                </span>
                <span className="hidden shrink-0 text-xs text-mute @min-[28rem]:block">{folder.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
