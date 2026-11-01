import type { ScanStage } from '../types/repository'

/** Stages reported by the backend scanner (backend/app/queries.py STAGES), in order. */
export const SCAN_STAGES: ScanStage[] = [
  { id: 'initialise', label: 'Initialising repository scan', description: 'Preparing the scan session' },
  { id: 'discover', label: 'Discovering folders and files', description: 'Walking the directory structure' },
  { id: 'languages', label: 'Detecting programming languages', description: 'Classifying files by extension' },
  { id: 'frameworks', label: 'Identifying frameworks', description: 'Matching project files to known frameworks' },
  { id: 'config', label: 'Reading configuration files', description: 'Inspecting manifests and build files' },
  { id: 'inventory', label: 'Parsing code and dependencies', description: 'Extracting symbols, imports and dependencies' },
  { id: 'complete', label: 'Scan completed', description: 'The inventory is ready' },
]

/** Index of the stage shown while the follow-up code parsing runs. */
export const PARSE_STAGE_INDEX = 5
