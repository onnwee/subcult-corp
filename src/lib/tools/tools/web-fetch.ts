// web_fetch tool — fetch URL and convert to markdown via toolbox
import type { NativeTool } from '../types';
import { execInToolbox } from '../executor';

export const webFetchTool: NativeTool = {
    name: 'web_fetch',
    description: 'Fetch a URL and return its content as markdown text. Useful for reading articles, documentation, or web pages.',
    agents: ['chora', 'thaum', 'praxis', 'mux'],
    parameters: {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                description: 'The URL to fetch',
            },
            max_length: {
                type: 'number',
                description: 'Maximum characters to return (default 10000)',
            },
        },
        required: ['url'],
    },
    execute: async (params) => {
        const url = params.url as string;
        const maxLength = (params.max_length as number) || 10_000;

        // Sanitize URL — basic validation
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return { error: 'URL must start with http:// or https://' };
        }

        // Use curl + html2text in toolbox for conversion
        const escapedUrl = url.replace(/'/g, "'\\''");
        const command = `curl -sL --max-time 15 --max-filesize 5242880 '${escapedUrl}' | python3 -c "
import sys
try:
    import html2text
    h = html2text.HTML2Text()
    h.ignore_links = False
    h.ignore_images = True
    h.body_width = 0
    content = sys.stdin.read()
    print(h.handle(content)[:${maxLength}])
except Exception as e:
    # Fallback: strip tags manually
    import re
    content = sys.stdin.read()
    text = re.sub(r'<[^>]+>', ' ', content)
    text = re.sub(r'\\s+', ' ', text).strip()
    print(text[:${maxLength}])
"`;

        const result = await execInToolbox(command, 20_000);

        if (result.timedOut) {
            return { error: 'URL fetch timed out after 20 seconds' };
        }

        if (result.exitCode !== 0 && !result.stdout) {
            return { error: `Fetch failed: ${result.stderr || 'unknown error'}` };
        }

        const content = result.stdout.trim();
        if (!content) {
            return { error: 'No content retrieved from URL' };
        }

        return { url, content, length: content.length };
    },
};
