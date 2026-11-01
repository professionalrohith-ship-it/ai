import { useAppData } from '../../hooks/useAppData'
import { Modal } from '../ui/Modal'
import { PrimaryButton } from '../ui/PrimaryButton'
import { ScanProgress } from './ScanProgress'
import { ScanSummary } from './ScanSummary'

interface ScanDialogProps {
  /** Repository whose scan is shown; null keeps the dialog closed. */
  repositoryId: string | null
  onClose: () => void
  onViewResults: (repositoryId: string) => void
}

/** Modal that shows a repository's scan: live progress, then the completion summary. */
export function ScanDialog({ repositoryId, onClose, onViewResults }: ScanDialogProps) {
  const { repositories, scans, scanResults, cancelScan, dismissScan, startScan } = useAppData()
  const repository = repositories.find((entry) => entry.id === repositoryId)
  const scan = repositoryId ? scans[repositoryId] : undefined
  const result = repositoryId ? scanResults[repositoryId] : undefined
  const open = Boolean(repository && scan)
  const running = scan?.status === 'running'
  const failed = scan?.status === 'failed'

  const close = () => {
    if (repositoryId && scan && scan.status !== 'running') dismissScan(repositoryId)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={running ? 'Scanning repository' : failed ? 'Scan failed' : 'Scan results'}
      description={repository?.path}
      footer={
        repository &&
        scan && (
          <>
            {running ? (
              <>
                <PrimaryButton variant="ghost" onClick={() => cancelScan(repository.id)} title="The scan keeps running in the backend; this only hides the progress">
                  Stop watching
                </PrimaryButton>
                <PrimaryButton variant="secondary" onClick={close}>
                  Run in background
                </PrimaryButton>
              </>
            ) : failed ? (
              <>
                <PrimaryButton variant="secondary" onClick={close}>
                  Close
                </PrimaryButton>
                <PrimaryButton
                  onClick={() => {
                    dismissScan(repository.id)
                    startScan(repository.id)
                  }}
                >
                  Try again
                </PrimaryButton>
              </>
            ) : (
              <>
                <PrimaryButton variant="secondary" onClick={close}>
                  Close
                </PrimaryButton>
                <PrimaryButton
                  onClick={() => {
                    dismissScan(repository.id)
                    onViewResults(repository.id)
                  }}
                >
                  View scan results
                </PrimaryButton>
              </>
            )}
          </>
        )
      }
    >
      {repository && scan && (running || failed || !result ? <ScanProgress scan={scan} repositoryName={repository.name} /> : <ScanSummary result={result} repositoryName={repository.name} />)}
    </Modal>
  )
}
