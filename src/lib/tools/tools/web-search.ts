// web_search tool — Brave Search API
import type { NativeTool } from '../types';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'web-search' });

const BRAVE_API_KEY = process.env.BRAVE_API_KEY ?? '';
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

export const webSearchTool: NativeTool = {
    name: 'web_search',
    description: 'Search the web using Brave Search. Returns titles, URLs, and descriptions of matching results.',
    agents: ['chora', 'subrosa', 'thaum', 'praxis'],
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query',
            },
            count: {
                type: 'number',
                description: 'Number of results to return (default 5, max 20)',
            },
        },
        required: ['query'],
    },
    execute: async (params) => {
        const query = params.query as string;
        const count = Math.min((params.count as number) || 5, 20);

        if (!BRAVE_API_KEY) {
            return { error: 'BRAVE_API_KEY not configured. Unable to search.' };
        }

        try {
            const url = new URL(BRAVE_SEARCH_URL);
            url.searchParams.set('q', query);
            url.searchParams.set('count', String(count));

            const response = await fetch(url.toString(), {
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip',
                    'X-Subscription-Token': BRAVE_API_KEY,
                },
                signal: AbortSignal.timeout(15_000),
            });

            if (!response.ok) {
                return { error: `Brave Search returned ${response.status}: ${await response.text()}` };
            }

            const data = await response.json() as {
                web?: { results?: Array<{ title: string; url: string; description: string }> };
            };

            const results = (data.web?.results ?? []).map(r => ({
                title: r.title,
                url: r.url,
                description: r.description,
            }));

            return { results, query, count: results.length };
        } catch (err) {
            log.error('Brave Search failed', { error: err, query });
            return { error: `Search failed: ${(err as Error).message}` };
        }
    },
};
