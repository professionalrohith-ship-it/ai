import type { AgentDefinition } from '../types/agents'

// Static description of the supervisor and the six specialist agents. Ids match GET /api/ai/agents.
// Live numbers (tasks, last run, status) come from the backend's agent run history.

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: 'supervisor',
    name: 'Supervisor Agent',
    shortName: 'Supervisor',
    role: 'Coordinator',
    purpose: 'Receives each request and routes it to the right specialist agent.',
    description:
      'A LangGraph workflow reads the request, picks one specialist agent (by keywords and symbols found in the repository index, or the agent you choose), passes it real repository evidence and returns a structured result.',
    responsibilities: [
      'Interpret the request and choose the specialist agent',
      'Pass the relevant repository evidence to that agent',
      'Return the answer with the files it is based on',
      'Record every run so it shows up in this monitor',
    ],
    icon: 'supervisor',
    inputSummary: 'The question, the selected repository and the recent conversation.',
    outputSummary: 'A structured response with references to the files it is based on.',
  },
  {
    id: 'repository-explorer',
    name: 'Repository Explorer Agent',
    shortName: 'Explorer',
    role: 'Repository discovery',
    purpose: 'Finds the files, folders and entry points relevant to a question.',
    description:
      'Walks the repository inventory to locate relevant files, configuration and entry points, and returns an organised list for the other agents to inspect.',
    responsibilities: [
      'Locate files and folders related to a request',
      'Identify entry points and configuration files',
      'Summarise repository structure for other agents',
    ],
    icon: 'explorer',
    inputSummary: 'A search intent such as "authentication files".',
    outputSummary: 'A ranked list of relevant paths with a short reason for each.',
  },
  {
    id: 'architecture-analyst',
    name: 'Architecture Analyst Agent',
    shortName: 'Architecture',
    role: 'Structure & relationships',
    purpose: 'Maps modules, layers and how they communicate.',
    description:
      'Builds a picture of how modules, services and layers relate, so answers can explain flows rather than isolated files.',
    responsibilities: [
      'Map modules and their dependencies',
      'Describe layers and service boundaries',
      'Explain request flows across the stack',
    ],
    icon: 'architecture',
    inputSummary: 'A set of files or modules to relate to one another.',
    outputSummary: 'A relationship summary: callers, callees and layer boundaries.',
  },
  {
    id: 'code-intelligence',
    name: 'Code Intelligence Agent',
    shortName: 'Code Intel',
    role: 'Code understanding',
    purpose: 'Reads and explains code, symbols and API relationships.',
    description:
      'Examines the implementation of functions and routes, traces call paths and extracts the snippets that serve as evidence in an answer.',
    responsibilities: [
      'Trace implementations and call paths',
      'Extract representative code evidence',
      'Relate API routes to the code that serves them',
    ],
    icon: 'code',
    inputSummary: 'Files and symbols selected by the Explorer and Architecture agents.',
    outputSummary: 'Annotated code snippets and a plain-language explanation.',
  },
  {
    id: 'bug-investigator',
    name: 'Bug Investigator Agent',
    shortName: 'Bug Investigator',
    role: 'Issue analysis',
    purpose: 'Looks for suspicious patterns and likely causes of problems.',
    description:
      'Reviews error reports and code paths for suspicious patterns and lists possible causes. Its output is a set of potential findings, not proven bugs.',
    responsibilities: [
      'Inspect error paths and stack traces',
      'Flag suspicious patterns as potential findings',
      'Suggest next debugging steps',
    ],
    icon: 'bug',
    inputSummary: 'An issue description, optional stack trace and affected files.',
    outputSummary: 'Ranked potential findings with severity and confidence labels.',
  },
  {
    id: 'dependency-analyst',
    name: 'Dependency Analyst Agent',
    shortName: 'Dependencies',
    role: 'Package analysis',
    purpose: 'Identifies the packages a repository declares and imports.',
    description:
      'Reads manifests such as package.json and requirements.txt and relates declared packages to the imports found in the code.',
    responsibilities: [
      'List declared dependencies per ecosystem',
      'Relate packages to observed imports',
      'Report usage status without claiming vulnerabilities',
    ],
    icon: 'dependencies',
    inputSummary: 'Manifest files and import statements.',
    outputSummary: 'A dependency inventory grouped by ecosystem and type.',
  },
  {
    id: 'documentation',
    name: 'Documentation Agent',
    shortName: 'Documentation',
    role: 'Technical writing',
    purpose: 'Turns analysis results into structured documentation.',
    description:
      'Writes structured Markdown documents (overview, architecture, module, API and dependency reports) from facts taken from the repository index.',
    responsibilities: [
      'Draft overviews, architecture, module, API and dependency documents',
      'Keep structure and terminology consistent',
      'Cite the files each section is based on',
    ],
    icon: 'documentation',
    inputSummary: 'A requested document type and the repository index.',
    outputSummary: 'A Markdown document with a table of contents.',
  },
]
