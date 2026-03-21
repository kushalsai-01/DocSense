export const queryKeys = {
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspace', id] as const,

  documents: {
    /** List all documents for a workspace */
    list: (workspaceId: string) => ['documents', workspaceId] as const,
    /** Single document with metadata */
    one: (workspaceId: string, docId: string) => ['document', workspaceId, docId] as const,
    /** Polling status (processing → ready) */
    status: (workspaceId: string, docId: string) => ['documentStatus', workspaceId, docId] as const,
    /** Full detail page (no workspaceId needed — accessed by docId alone) */
    detail: (docId: string) => ['document', 'detail', docId] as const,
    /** Paginated chunk list for a document */
    chunks: (docId: string, page: number) => ['document', docId, 'chunks', page] as const,
    /** Conversations that cited a document */
    conversations: (docId: string) => ['document', docId, 'conversations'] as const,
  },

  conversations: (workspaceId: string) => ['conversations', workspaceId] as const,

  analytics: (workspaceId: string) => ['analytics', workspaceId] as const,
  analyticsStorage: (userId: string) => ['analytics', 'storage', userId] as const,
  docAnalytics: (workspaceId: string, docId: string) => ['docAnalytics', workspaceId, docId] as const,

  health: ['health'] as const,

  evalSummary: ['evalSummary'] as const,
  similarQueries: (q: string, wsId: string) => ['similarQueries', q, wsId] as const,
}
