/**
 * PubMed Central (PMC) API client (ESM JS version)
 * Migrated from PubMed-MCP-Server-main/src/api/pmc.ts
 */

import axios from 'axios';
import {
  parseXML,
  extractText,
  RateLimiter,
  retryWithBackoff,
  normalizePMCID
} from './utils.mjs';

/**
 * @typedef {import('../types.js').FullTextArticle} FullTextArticle
 * @typedef {import('../types.js').ArticleSection} ArticleSection
 * @typedef {import('../types.js').Figure} Figure
 * @typedef {import('../types.js').Table} Table
 * @typedef {import('../types.js').Reference} Reference
 */

export class PMCClient {
  /** @type {import('axios').AxiosInstance} */
  client;
  /** @type {RateLimiter} */
  rateLimiter;

  /**
   * @param {string | undefined} apiKey
   */
  constructor(apiKey) {
    const requestsPerSecond = apiKey ? 10 : 3;
    this.rateLimiter = new RateLimiter(requestsPerSecond);

    this.client = axios.create({
      baseURL: 'https://www.ncbi.nlm.nih.gov/pmc',
      timeout: 30000,
      headers: {
        'User-Agent': 'PubMed-MCP-Server/1.0'
      }
    });
  }

  /**
   * Get full text article from PMC
   * @param {string} pmcid
   * @returns {Promise<FullTextArticle>}
   */
  async getFullText(pmcid) {
    return this.rateLimiter.execute(async () => {
      return retryWithBackoff(async () => {
        const normalizedId = normalizePMCID(pmcid);
        const response = await this.client.get('/oai/oai.cgi', {
          params: {
            verb: 'GetRecord',
            identifier: `oai:pubmedcentral.nih.gov:${normalizedId.replace('PMC', '')}`,
            metadataPrefix: 'pmc'
          }
        });

        const parsed = await parseXML(response.data);
        return this.parseFullTextArticle(parsed, normalizedId);
      });
    });
  }

  /**
   * Parse full text article from PMC XML
   * @param {any} data
   * @param {string} pmcid
   * @returns {FullTextArticle}
   */
  parseFullTextArticle(data, pmcid) {
    const record = data?.GetRecord?.record;
    if (!record) {
      throw new Error(`Full text not found for ${pmcid}`);
    }

    const metadata = record.metadata?.article;
    if (!metadata) {
      throw new Error(`Invalid article metadata for ${pmcid}`);
    }

    const front = metadata.front;
    const body = metadata.body;
    const back = metadata.back;

    // Parse article metadata
    const articleMeta = front?.['article-meta'];
    const journalMeta = front?.['journal-meta'];

    // Parse title
    const titleGroup = articleMeta?.['title-group'];
    const title = extractText(titleGroup?.['article-title'] || '');

    // Parse authors
    const authors = this.parseAuthors(articleMeta?.['contrib-group']);

    // Parse abstract
    const abstract = this.parseAbstract(articleMeta?.abstract);

    // Parse publication date
    const pubDate = articleMeta?.['pub-date'];
    const publicationDate = this.parseDate(pubDate);

    // Parse journal
    const journal = extractText(journalMeta?.['journal-title'] || '');

    // Parse DOI & PMID
    const articleIds = articleMeta?.['article-id'];
    let doi = '';
    let pmid = '';

    if (articleIds) {
      const idArray = Array.isArray(articleIds) ? articleIds : [articleIds];
      idArray.forEach(id => {
        if (id['pub-id-type'] === 'doi') {
          doi = extractText(id);
        } else if (id['pub-id-type'] === 'pmid') {
          pmid = extractText(id);
        }
      });
    }

    // Parse body sections
    const sections = this.parseSections(body?.sec);

    // Parse figures
    const figures = this.parseFigures(metadata.floats?.fig || body?.fig);

    // Parse tables
    const tables = this.parseTables(metadata.floats?.['table-wrap'] || body?.['table-wrap']);

    // Parse references
    const references = this.parseReferences(back?.['ref-list']?.ref);

    // Combine body text
    const bodyText = this.extractBodyText(sections);

    return {
      pmcid,
      pmid,
      title,
      abstract,
      body: bodyText,
      authors,
      journal,
      publicationDate,
      doi,
      sections,
      figures,
      tables,
      references
    };
  }

  /**
   * Parse authors from contrib-group
   * @param {any} contribGroup
   * @returns {any[]}
   */
  parseAuthors(contribGroup) {
    const authors = [];

    if (!contribGroup) {
      return authors;
    }

    const contribs = contribGroup.contrib;
    if (!contribs) {
      return authors;
    }

    const contribArray = Array.isArray(contribs) ? contribs : [contribs];

    contribArray.forEach(contrib => {
      if (contrib['contrib-type'] === 'author') {
        const name = contrib.name;
        if (name) {
          authors.push({
            lastName: extractText(name.surname || ''),
            foreName: extractText(name['given-names'] || ''),
            initials: extractText(name['given-names'] || '').charAt(0),
            affiliation: extractText(contrib.aff || '')
          });
        }
      }
    });

    return authors;
  }

  /**
   * Parse abstract
   * @param {any} abstractData
   * @returns {string}
   */
  parseAbstract(abstractData) {
    if (!abstractData) {
      return '';
    }

    if (typeof abstractData === 'string') {
      return abstractData;
    }

    // Handle structured abstracts
    const sections = abstractData.sec;
    if (sections) {
      const sectionArray = Array.isArray(sections) ? sections : [sections];
      return sectionArray
        .map(sec => {
          const title = extractText(sec.title || '');
          const content = extractText(sec.p || '');
          return title ? `${title}: ${content}` : content;
        })
        .join('\n\n');
    }

    return extractText(abstractData.p || abstractData);
  }

  /**
   * Parse publication date
   * @param {any} pubDate
   * @returns {string}
   */
  parseDate(pubDate) {
    if (!pubDate) {
      return '';
    }

    const dateObj = Array.isArray(pubDate) ? pubDate[0] : pubDate;
    const year = extractText(dateObj.year || '');
    const month = extractText(dateObj.month || '01').padStart(2, '0');
    const day = extractText(dateObj.day || '01').padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  /**
   * Parse body sections
   * @param {any} sections
   * @returns {ArticleSection[]}
   */
  parseSections(sections) {
    if (!sections) {
      return [];
    }

    const sectionArray = Array.isArray(sections) ? sections : [sections];
    return sectionArray.map(sec => this.parseSection(sec));
  }

  /**
   * Parse individual section
   * @param {any} sec
   * @returns {ArticleSection}
   */
  parseSection(sec) {
    const title = extractText(sec.title || '');
    const paragraphs = sec.p;
    let content = '';

    if (paragraphs) {
      const pArray = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
      content = pArray.map(p => extractText(p)).join('\n\n');
    }

    const subsections = sec.sec ? this.parseSections(sec.sec) : undefined;

    return {
      title,
      content,
      subsections
    };
  }

  /**
   * Parse figures
   * @param {any} figures
   * @returns {Figure[]}
   */
  parseFigures(figures) {
    if (!figures) {
      return [];
    }

    const figArray = Array.isArray(figures) ? figures : [figures];
    return figArray.map(fig => ({
      id: fig.id || '',
      label: extractText(fig.label || ''),
      caption: extractText(fig.caption?.p || fig.caption || ''),
      url: fig.graphic?.['xlink:href'] || ''
    }));
  }

  /**
   * Parse tables
   * @param {any} tables
   * @returns {Table[]}
   */
  parseTables(tables) {
    if (!tables) {
      return [];
    }

    const tableArray = Array.isArray(tables) ? tables : [tables];
    return tableArray.map(table => ({
      id: table.id || '',
      label: extractText(table.label || ''),
      caption: extractText(table.caption?.p || table.caption || ''),
      content: extractText(table.table || '')
    }));
  }

  /**
   * Parse references
   * @param {any} references
   * @returns {Reference[]}
   */
  parseReferences(references) {
    if (!references) {
      return [];
    }

    const refArray = Array.isArray(references) ? references : [references];
    return refArray.map(ref => {
      const citation = ref['mixed-citation'] || ref['element-citation'] || ref.citation;
      const pubIds = ref['pub-id'];

      let pmid = '';
      let doi = '';

      if (pubIds) {
        const idArray = Array.isArray(pubIds) ? pubIds : [pubIds];
        idArray.forEach(id => {
          if (id['pub-id-type'] === 'pmid') {
            pmid = extractText(id);
          } else if (id['pub-id-type'] === 'doi') {
            doi = extractText(id);
          }
        });
      }

      return {
        id: ref.id || '',
        citation: extractText(citation || ''),
        pmid,
        doi
      };
    });
  }

  /**
   * Extract body text from sections
   * @param {ArticleSection[]} sections
   * @returns {string}
   */
  extractBodyText(sections) {
    return sections
      .map(sec => {
        let text = sec.title ? `${sec.title}\n\n` : '';
        text += sec.content;

        if (sec.subsections && sec.subsections.length > 0) {
          text += '\n\n' + this.extractBodyText(sec.subsections);
        }

        return text;
      })
      .join('\n\n');
  }

  /**
   * Check if full text is available for a PMCID
   * @param {string} pmcid
   * @returns {Promise<boolean>}
   */
  async isFullTextAvailable(pmcid) {
    try {
      await this.getFullText(pmcid);
      return true;
    } catch {
      return false;
    }
  }
}