/**
 * Utility functions for PubMed API operations (ESM, JS version)
 * Migrated from PubMed-MCP-Server-main/src/api/utils.ts
 */

import { parseStringPromise } from 'xml2js';

/**
 * Rate limiter class to manage API request rates
 */
export class RateLimiter {
  /** @type {Array<() => Promise<any>>} */
  queue = [];
  processing = false;
  lastRequestTime = 0;
  requestInterval;

  constructor(requestsPerSecond) {
    this.requestInterval = 1000 / requestsPerSecond;
  }

  /**
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async execute(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  async processQueue() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.requestInterval) {
      await this.sleep(this.requestInterval - timeSinceLastRequest);
    }

    const task = this.queue.shift();
    if (task) {
      this.lastRequestTime = Date.now();
      await task();
    }

    this.processQueue();
  }

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Parse XML response to JSON
 * @param {string} xml
 * @returns {Promise<any>}
 */
export async function parseXML(xml) {
  try {
    return await parseStringPromise(xml, {
      explicitArray: false,
      mergeAttrs: true,
      trim: true,
      normalizeTags: false,
      explicitRoot: false
    });
  } catch (error) {
    throw new Error(`XML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text content from XML nodes
 * @param {any} node
 * @returns {string}
 */
export function extractText(node) {
  if (typeof node === 'string') {
    return node;
  }
  if (node?._) {
    return node._;
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join(' ');
  }
  if (typeof node === 'object' && node !== null) {
    return Object.values(node).map(extractText).join(' ');
  }
  return '';
}

/**
 * Format date to YYYY/MM/DD for PubMed API
 * @param {Date | string} date
 * @returns {string}
 */
export function formatDateForAPI(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

/**
 * Parse PubMed date string to ISO format
 * @param {string} dateStr
 * @returns {string}
 */
export function parsePubMedDate(dateStr) {
  if (!dateStr) return '';

  // Handle various date formats from PubMed
  const patterns = [
    /^(\d{4})\s+(\w+)\s+(\d{1,2})$/,  // 2023 Jan 15
    /^(\d{4})\s+(\w+)$/,               // 2023 Jan
    /^(\d{4})$/                       // 2023
  ];

  const monthMap = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04',
    May: '05', Jun: '06', Jul: '07', Aug: '08',
    Sep: '09', Oct: '10', Nov: '11', Dec: '12'
  };

  for (const pattern of patterns) {
    const match = dateStr.match(pattern);
    if (match) {
      if (match.length === 4) {
        // Full date
        const [, year, month, day] = match;
        return `${year}-${monthMap[month]}-${day.padStart(2, '0')}`;
      } else if (match.length === 3) {
        // Year and month
        const [, year, month] = match;
        return `${year}-${monthMap[month]}-01`;
      } else if (match.length === 2) {
        // Year only
        return `${match[1]}-01-01`;
      }
    }
  }

  return dateStr;
}

/**
 * Validate PMID format
 * @param {string} pmid
 * @returns {boolean}
 */
export function isValidPMID(pmid) {
  return /^\d+$/.test(pmid);
}

/**
 * Validate DOI format
 * @param {string} doi
 * @returns {boolean}
 */
export function isValidDOI(doi) {
  return /^10\.\d{4,}\/\S+$/.test(doi);
}

/**
 * Validate PMC ID format
 * @param {string} pmcid
 * @returns {boolean}
 */
export function isValidPMCID(pmcid) {
  return /^PMC\d+$/i.test(pmcid);
}

/**
 * Clean and normalize PMCID
 * @param {string} pmcid
 * @returns {string}
 */
export function normalizePMCID(pmcid) {
  const cleaned = pmcid.trim().toUpperCase();
  if (cleaned.startsWith('PMC')) {
    return cleaned;
  }
  return `PMC${cleaned}`;
}

/**
 * Build query string from parameters
 * @param {Record<string, any>} params
 * @returns {string}
 */
export function buildQueryString(params) {
  const filtered = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${encodeURIComponent(key)}=${encodeURIComponent(value.join(','))}`;
      }
      return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
    });

  return filtered.length > 0 ? `?${filtered.join('&')}` : '';
}

/**
 * Chunk array into smaller arrays
 * @template T
 * @param {T[]} array
 * @param {number} size
 * @returns {T[][]}
 */
export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Retry function with exponential backoff
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} [maxRetries=3]
 * @param {number} [baseDelay=1000]
 * @returns {Promise<T>}
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  /** @type {Error | undefined} */
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Sanitize search term for PubMed query
 * @param {string} term
 * @returns {string}
 */
export function sanitizeSearchTerm(term) {
  // Remove special characters that might break the query
  return term
    .replace(/[^\w\s\-\(\)\[\]"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build field-specific search query
 * @param {string} term
 * @param {string} field
 * @returns {string}
 */
export function buildFieldQuery(term, field) {
  const sanitized = sanitizeSearchTerm(term);
  return `${sanitized}[${field}]`;
}

/**
 * Combine search terms with boolean operators
 * @param {string[]} terms
 * @param {'AND' | 'OR' | 'NOT'} [operator='AND']
 * @returns {string}
 */
export function combineSearchTerms(terms, operator = 'AND') {
  return terms.filter(t => t.trim()).join(` ${operator} `);
}

/**
 * Extract error message from various error types
 * @param {unknown} error
 * @returns {string}
 */
export function extractErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    // @ts-ignore
    return String(error.message);
  }
  return 'Unknown error occurred';
}

/**
 * Format citation in various styles
 * @param {object} article
 * @param {'apa' | 'mla' | 'chicago' | 'bibtex' | 'ris'} style
 * @returns {string}
 */
export function formatCitation(
  article,
  style
) {
  const year = (article.publicationDate || '').split('-')[0] || '';
  const authorList = (article.authors || []).slice(0, 20); // Limit to first 20 authors

  switch (style) {
    case 'apa':
      return formatAPACitation(article, authorList, year);
    case 'mla':
      return formatMLACitation(article, authorList, year);
    case 'chicago':
      return formatChicagoCitation(article, authorList, year);
    case 'bibtex':
      return formatBibTeXCitation(article, authorList, year);
    case 'ris':
      return formatRISCitation(article, authorList, year);
    default:
      return formatAPACitation(article, authorList, year);
  }
}

function formatAPACitation(article, authors, year) {
  const authorStr = authors
    .map((a, i) => {
      const initials = a.initials || (a.foreName ? a.foreName[0] : '') || '';
      if (i === authors.length - 1 && authors.length > 1) {
        return `& ${a.lastName}, ${initials}`;
      }
      return `${a.lastName}, ${initials}`;
    })
    .join(', ');

  let citation = `${authorStr}. (${year}). ${article.title}. ${article.journal}`;

  if (article.volume) {
    citation += `, ${article.volume}`;
    if (article.issue) {
      citation += `(${article.issue})`;
    }
  }

  if (article.pages) {
    citation += `, ${article.pages}`;
  }

  if (article.doi) {
    citation += `. https://doi.org/${article.doi}`;
  }

  return citation;
}

function formatMLACitation(article, authors, year) {
  const authorStr =
    authors.length > 0
      ? `${authors[0].lastName}, ${authors[0].foreName || authors[0].initials || ''}`
      : 'Unknown';

  let citation = `${authorStr}. "${article.title}" ${article.journal}`;

  if (article.volume) {
    citation += ` ${article.volume}`;
    if (article.issue) {
      citation += `.${article.issue}`;
    }
  }

  citation += ` (${year})`;

  if (article.pages) {
    citation += `: ${article.pages}`;
  }

  return citation + '.';
}

function formatChicagoCitation(article, authors, year) {
  const authorStr = authors
    .map((a, i) => {
      if (i === 0) {
        return `${a.lastName}, ${a.foreName || a.initials || ''}`;
      }
      return `${a.foreName || a.initials || ''} ${a.lastName}`;
    })
    .join(', ');

  let citation = `${authorStr}. "${article.title}." ${article.journal}`;

  if (article.volume) {
    citation += ` ${article.volume}`;
    if (article.issue) {
      citation += `, no. ${article.issue}`;
    }
  }

  citation += ` (${year})`;

  if (article.pages) {
    citation += `: ${article.pages}`;
  }

  return citation + '.';
}

function formatBibTeXCitation(article, authors, year) {
  const authorStr = authors
    .map(a => `${a.lastName}, ${a.foreName || a.initials || ''}`)
    .join(' and ');

  const key = `${authors[0]?.lastName || 'unknown'}${year}`;

  let bibtex = `@article{${key},\n`;
  bibtex += `  author = {${authorStr}},\n`;
  bibtex += `  title = {${article.title}},\n`;
  bibtex += `  journal = {${article.journal}},\n`;
  bibtex += `  year = {${year}},\n`;

  if (article.volume) bibtex += `  volume = {${article.volume}},\n`;
  if (article.issue) bibtex += `  number = {${article.issue}},\n`;
  if (article.pages) bibtex += `  pages = {${article.pages}},\n`;
  if (article.doi) bibtex += `  doi = {${article.doi}},\n`;

  bibtex += '}';

  return bibtex;
}

function formatRISCitation(article, authors, year) {
  let ris = 'TY  - JOUR\n';

  authors.forEach(a => {
    ris += `AU  - ${a.lastName}, ${a.foreName || a.initials || ''}\n`;
  });

  ris += `TI  - ${article.title}\n`;
  ris += `JO  - ${article.journal}\n`;
  ris += `PY  - ${year}\n`;

  if (article.volume) ris += `VL  - ${article.volume}\n`;
  if (article.issue) ris += `IS  - ${article.issue}\n`;
  if (article.pages) {
    const parts = String(article.pages).split('-');
    ris += `SP  - ${parts[0]}\n`;
    if (parts.length > 1) {
      ris += `EP  - ${parts[1]}\n`;
    }
  }
  if (article.doi) ris += `DO  - ${article.doi}\n`;

  ris += 'ER  - \n';

  return ris;
}