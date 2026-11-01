import type { DocumentationType, DocumentationTypeInfo } from '../types/documentation'

/** The document types the backend can generate (GET /api/documentation/types lists the same five). */
export const DOCUMENTATION_TYPES: DocumentationTypeInfo[] = [
  { id: 'project-overview', label: 'Project Overview', description: 'Languages, frameworks, entry points and structure at a glance.' },
  { id: 'architecture', label: 'Architecture Documentation', description: 'Modules, how they import each other, important files and cycles.' },
  { id: 'module', label: 'Module Documentation', description: 'Files, classes and functions of one directory.' },
  { id: 'api', label: 'API Documentation', description: 'HTTP endpoints detected in the source code.' },
  { id: 'dependency-report', label: 'Dependency Report', description: 'External packages, internal imports and unresolved imports.' },
]

export const typeLabel = (type: DocumentationType): string => DOCUMENTATION_TYPES.find((entry) => entry.id === type)?.label ?? type
