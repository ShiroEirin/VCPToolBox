import { ofetch } from 'ofetch';
import { fromHtml } from 'hast-util-from-html';
import { sanitize } from 'hast-util-sanitize';
import { parse as rehypeParse } from 'rehype-parse';
import { toMarkdown } from 'rehype-remark';
import { sanitize as rehypeSanitize } from 'rehype-sanitize';
import gfm from 'remark-gfm';
import { stringify as remarkStringify } from 'remark-stringify';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
import { z } from 'zod';
import { JSDOM } from 'linkedom';

// Initialize winkNLP
const nlp = winkNLP(model);
const { its } = nlp;

// --- Schemas (from src/schemas/deepwiki.ts) ---
const FetchRequest = z.object({
  url: z.string().min(1, 'URL cannot be empty'),
  mode: z.enum(['llm', 'raw']).default('llm'),
  maxDepth: z.number().min(1).max(5).default(1),
  verbose: z.boolean().default(false),
});

// --- HTML to Markdown Converter (from src/converter/htmlToMarkdown.ts) ---
async function htmlToMarkdown(html, mode) {
  if (mode === 'raw') {
    return html;
  }

  const processor = unified()
    .use(rehypeParse)
    .use(rehypeSanitize)
    .use(toMarkdown)
    .use(remarkGfm)
    .use(() => (tree) => {
      visit(tree, 'link', (node) => {
        if (node.url && !node.url.startsWith('http')) {
          node.url = new URL(node.url, 'https://deepwiki.com').href;
        }
      });
    })
    .use(remarkStringify);

  const file = await processor.process(html);
  return String(file);
}

// --- HTTP Crawler (from src/lib/httpCrawler.ts) ---
async function crawl({ root, maxDepth, emit, verbose }) {
  const queue = new Set([root.href]);
  const visited = new Set();
  const html = {};

  for (const url of queue) {
    if (visited.has(url) || visited.size >= maxDepth) {
      continue;
    }
    visited.add(url);

    try {
      if (verbose) console.error(`[CRAWL] Fetching: ${url}`);
      const response = await ofetch(url);
      const dom = new JSDOM(response);
      const path = new URL(url).pathname;
      html[path] = dom.window.document.body.innerHTML;

      const links = [...dom.window.document.querySelectorAll('a[href]')].map(a => a.href);
      for (const link of links) {
        const absoluteUrl = new URL(link, root.href).href;
        if (absoluteUrl.startsWith(root.origin) && !visited.has(absoluteUrl)) {
          queue.add(absoluteUrl);
        }
      }
    } catch (error) {
      if (verbose) console.error(`[CRAWL] Error fetching ${url}:`, error.message);
    }
  }
  return { html };
}

// --- Utils (from src/utils/) ---
function extractKeyword(text) {
  const doc = nlp.readDoc(text);
  const keywords = doc.entities().out(its.value, its.type);
  if (keywords.length > 0) {
    return keywords[0].value;
  }
  return null;
}

async function resolveRepo(term) {
    // In a real scenario, this would call GitHub API.
    // For this VCP plugin, we'll keep it simple and assume the term is part of a path.
    // This function is simplified as we don't have API keys here.
    return `/${term}`; 
}


// --- Main Tool Logic (from src/tools/deepwiki.ts) ---
async function deepwikiFetch(input) {
    // Normalize the URL
    let normalizedInput = { ...input };
    if (typeof normalizedInput.url === 'string') {
        let url = normalizedInput.url.trim();
        if (!/^https?:\/\//.test(url)) {
            if (/^[^/]+\/[^/]+$/.test(url)) {
                // owner/repo format
            } else if (/^[^/]+$/.test(url)) {
                const extracted = extractKeyword(url);
                if (extracted) {
                    url = extracted;
                }
            } else {
                const extracted = extractKeyword(url);
                if (extracted) {
                    url = extracted;
                }
            }
            url = `https://deepwiki.com/${url}`;
        }
        normalizedInput.url = url;
    }

    const parse = FetchRequest.safeParse(normalizedInput);
    if (!parse.success) {
        throw new Error(`Request failed schema validation: ${JSON.stringify(parse.error.flatten())}`);
    }

    const req = parse.data;
    const root = new URL(req.url);

    if (root.hostname !== 'deepwiki.com') {
        throw new Error('Only deepwiki.com domains are allowed');
    }

    const crawlResult = await crawl({
        root,
        maxDepth: req.maxDepth,
        emit: () => {},
        verbose: req.verbose,
    });

    const pages = await Promise.all(
        Object.entries(crawlResult.html).map(async ([path, html]) => ({
            path,
            markdown: await htmlToMarkdown(html, req.mode),
        })),
    );

    return {
        content: pages.map(page => ({
            type: 'text',
            text: `# ${page.path}\n\n${page.markdown}`,
        })),
    };
}


// --- VCP Synchronous Plugin Entry Point ---
async function main() {
    let inputString = '';
    process.stdin.setEncoding('utf8');

    for await (const chunk of process.stdin) {
        inputString += chunk;
    }

    try {
        const input = JSON.parse(inputString);
        const result = await deepwikiFetch(input);
        console.log(JSON.stringify({ status: 'success', result: result }));
        process.exit(0);
    } catch (error) {
        console.log(JSON.stringify({ status: 'error', error: error.message }));
        process.exit(1);
    }
}

main();