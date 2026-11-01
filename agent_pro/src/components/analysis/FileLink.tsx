import { Link } from 'react-router-dom'

import { explorerPath } from '../../constants/navigation'
import { cn } from '../../utils/cn'

interface FileLinkProps {
  file: string
  line?: number
  repositoryId?: string | null
  className?: string
}

/** Link that opens a repository file in the Repository Explorer. */
export function FileLink({ file, line, repositoryId, className }: FileLinkProps) {
  return (
    <Link
      to={explorerPath({ file, line, repositoryId: repositoryId ?? undefined })}
      title={`Open ${file} in the Repository Explorer`}
      className={cn('break-all font-mono text-xs text-brand underline decoration-brand/30 underline-offset-2 transition hover:decoration-brand', className)}
    >
      {file}
      {line ? `:${line}` : ''}
    </Link>
  )
}
