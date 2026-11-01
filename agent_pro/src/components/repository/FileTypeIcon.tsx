import { Braces, File, FileCode2, FileCog, FileText, Folder, FolderOpen, Lock, Terminal, type LucideIcon } from 'lucide-react'

import { cn } from '../../utils/cn'

interface FileTypeIconProps {
  name: string
  type: 'file' | 'folder'
  open?: boolean
  className?: string
}

const EXTENSION_ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  ts: { icon: FileCode2, tone: 'text-[#7fb8ff]' },
  tsx: { icon: FileCode2, tone: 'text-[#7fb8ff]' },
  js: { icon: FileCode2, tone: 'text-[#ffd479]' },
  jsx: { icon: FileCode2, tone: 'text-[#ffd479]' },
  py: { icon: FileCode2, tone: 'text-[#9fd8a7]' },
  json: { icon: Braces, tone: 'text-[#ffd479]' },
  md: { icon: FileText, tone: 'text-mute' },
  txt: { icon: FileText, tone: 'text-mute' },
  html: { icon: FileCode2, tone: 'text-[#ff9a52]' },
  css: { icon: FileCode2, tone: 'text-[#d6a2ff]' },
  yml: { icon: FileCog, tone: 'text-mute' },
  yaml: { icon: FileCog, tone: 'text-mute' },
  sh: { icon: Terminal, tone: 'text-mute' },
}

/** Icon for a file (by extension) or folder (open/closed). */
export function FileTypeIcon({ name, type, open = false, className }: FileTypeIconProps) {
  if (type === 'folder') {
    const FolderIcon = open ? FolderOpen : Folder
    return <FolderIcon className={cn('size-4 shrink-0 text-brand', className)} aria-hidden="true" />
  }
  const lower = name.toLowerCase()
  if (lower.startsWith('.env')) return <Lock className={cn('size-4 shrink-0 text-warn', className)} aria-hidden="true" />
  if (lower === 'requirements.txt') return <FileCog className={cn('size-4 shrink-0 text-[#9fd8a7]', className)} aria-hidden="true" />
  const extension = lower.includes('.') ? lower.split('.').pop()! : ''
  const entry = EXTENSION_ICONS[extension]
  const Icon = entry?.icon ?? File
  return <Icon className={cn('size-4 shrink-0', entry?.tone ?? 'text-mute', className)} aria-hidden="true" />
}
