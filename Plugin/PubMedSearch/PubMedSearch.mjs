#!/usr/bin/env node

/**
 * PubMedSearch VCP 插件主程序
 * 参考来源: PubMed-MCP-Server-main/src/index.ts
 *
 * 设计目标:
 * - 标准 VCP 同步插件: stdin 接收 JSON, stdout 输出 { status, result } JSON
 * - 以 MCP 行为为准, 尽量保持字段和语义一致, 方便从 MCP 平滑迁移
 * - 所有业务逻辑委托给 api/eutils.mjs 和 api/pmc.mjs
 */

import { EUtilsClient } from './api/eutils.mjs';
import { PMCClient } from './api/pmc.mjs';
import {
  isValidPMID,
  isValidDOI,
  isValidPMCID,
  normalizePMCID,
  formatCitation,
  buildFieldQuery,
  combineSearchTerms,
  chunkArray,
  extractErrorMessage,
  formatDateForAPI
} from './api/utils.mjs';

// ------------------------- 初始化 API 客户端 -------------------------

const apiKey = process.env.NCBI_API_KEY;
const email = process.env.NCBI_EMAIL;

const eutilsClient = new EUtilsClient(apiKey, email);
const pmcClient = new PMCClient(apiKey);

// ------------------------- stdin / stdout 框架 -------------------------

/**
 * 读取整个 stdin, 解析为 JSON 请求对象
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        const parsed = JSON.parse(data || '{}');
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON input for PubMedSearch plugin: ' + (err?.message || String(err))));
      }
    });
    process.stdin.on('error', err => {
      reject(err);
    });
  });
}

/**
 * 按 VCP 约定输出成功结果
 */
function writeSuccess(result) {
  const payload = {
    status: 'success',
    result
  };
  process.stdout.write(JSON.stringify(payload));
}

/**
 * 按 VCP 约定输出错误结果
 */
function writeError(message, code = 'INTERNAL_ERROR') {
  const payload = {
    status: 'error',
    error: message,
    code
  };
  process.stdout.write(JSON.stringify(payload));
}

/**
 * 将 MCP 风格的 tool 返回结构 (content[]) 包装为 VCP result
 */
function wrapToolResult(payload) {
  return payload;
}

// ------------------------- 业务 Handler (从 MCP 移植) -------------------------

async function handleSearchArticles(args) {
  const {
    query,
    max_results = 20,
    start = 0,
    sort,
    date_from,
    date_to
  } = args;

  const searchResult = await eutilsClient.search({
    term: query,
    retmax: max_results,
    retstart: start,
    sort: sort === 'pub_date' ? 'pub+date' : sort,
    mindate: date_from,
    maxdate: date_to
  });

  // Get article summaries for the PMIDs (限制前 20 条, 与 MCP 一致)
  let articles = [];
  if (searchResult.pmids.length > 0) {
    const summaries = await eutilsClient.summary({
      db: 'pubmed',
      id: searchResult.pmids.slice(0, 20)
    });

    if (summaries.result) {
      articles = searchResult.pmids.slice(0, 20).map((pmid) => {
        const summary = summaries.result[pmid];
        return {
          pmid,
          title: summary?.title || '',
          authors: summary?.authors?.map((a) => a.name).join(', ') || '',
          journal: summary?.source || '',
          publicationDate: summary?.pubdate || '',
          doi: summary?.elocationid || ''
        };
      });
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            totalResults: searchResult.count,
            returnedResults: searchResult.pmids.length,
            start: searchResult.retstart,
            pmids: searchResult.pmids,
            articles,
            queryTranslation: searchResult.queryTranslation
          },
          null,
          2
        )
      }
    ]
  };
}

async function handleAdvancedSearch(args) {
  const {
    title,
    abstract,
    author,
    journal,
    mesh_terms,
    publication_types,
    boolean_operator = 'AND',
    max_results = 20
  } = args;

  const queryParts = [];

  if (title) queryParts.push(buildFieldQuery(title, 'Title'));
  if (abstract) queryParts.push(buildFieldQuery(abstract, 'Abstract'));
  if (author) queryParts.push(buildFieldQuery(author, 'Author'));
  if (journal) queryParts.push(buildFieldQuery(journal, 'Journal'));

  if (mesh_terms && mesh_terms.length > 0) {
    const meshQuery = mesh_terms
      .map((term) => buildFieldQuery(term, 'MeSH Terms'))
      .join(' OR ');
    queryParts.push(`(${meshQuery})`);
  }

  if (publication_types && publication_types.length > 0) {
    const ptQuery = publication_types
      .map((pt) => buildFieldQuery(pt, 'Publication Type'))
      .join(' OR ');
    queryParts.push(`(${ptQuery})`);
  }

  if (queryParts.length === 0) {
    throw new Error('At least one search field must be provided');
  }

  const finalQuery = combineSearchTerms(queryParts, boolean_operator);

  const searchResult = await eutilsClient.search({
    term: finalQuery,
    retmax: max_results
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            query: finalQuery,
            totalResults: searchResult.count,
            pmids: searchResult.pmids
          },
          null,
          2
        )
      }
    ]
  };
}

async function handleSearchByAuthor(args) {
  const { author_name, affiliation, max_results = 50 } = args;

  let query = buildFieldQuery(author_name, 'Author');

  if (affiliation) {
    query += ' AND ' + buildFieldQuery(affiliation, 'Affiliation');
  }

  const searchResult = await eutilsClient.search({
    term: query,
    retmax: max_results,
    sort: 'pub+date'
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            author: author_name,
            affiliation,
            totalResults: searchResult.count,
            pmids: searchResult.pmids
          },
          null,
          2
        )
      }
    ]
  };
}

async function handleSearchByJournal(args) {
  const { journal_name, keywords, date_from, date_to, max_results = 50 } = args;

  let query = buildFieldQuery(journal_name, 'Journal');

  if (keywords) {
    query += ' AND ' + keywords;
  }

  const searchResult = await eutilsClient.search({
    term: query,
    retmax: max_results,
    mindate: date_from,
    maxdate: date_to,
    sort: 'pub+date'
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            journal: journal_name,
            keywords,
            dateRange: { from: date_from, to: date_to },
            totalResults: searchResult.count,
            pmids: searchResult.pmids
          },
          null,
          2
        )
      }
    ]
  };
}

async function handleSearchByMeshTerms(args) {
  const { mesh_terms, major_topic_only = false, max_results = 50 } = args;

  const meshQueries = mesh_terms.map((term) => {
    const field = major_topic_only ? 'MeSH Major Topic' : 'MeSH Terms';
    return buildFieldQuery(term, field);
  });

  const query = combineSearchTerms(meshQueries, 'AND');

  const searchResult = await eutilsClient.search({
    term: query,
    retmax: max_results
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            meshTerms: mesh_terms,
            majorTopicOnly: major_topic_only,
            totalResults: searchResult.count,
            pmids: searchResult.pmids
          },
          null,
          2
        )
      }
    ]
  };
}

async function handleGetTrendingArticles(args) {
  const { field, days = 30, max_results = 20 } = args;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const searchResult = await eutilsClient.search({
    term: field,
    retmax: max_results,
    mindate: formatDateForAPI(startDate),
    maxdate: formatDateForAPI(endDate),
    sort: 'pub+date'
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            field,
            days,
            dateRange: {
              from: formatDateForAPI(startDate),
              to: formatDateForAPI(endDate)
            },
            totalResults: searchResult.count,
            pmids: searchResult.pmids
          },
          null,
          2
        )
      }
    ]
  };
}

async function handleGetArticleDetails(args) {
  const { pmid } = args;

  if (!isValidPMID(pmid)) {
    throw new Error(`Invalid PMID format: ${pmid}`);
  }

  const article = await eutilsClient.getArticleDetails(pmid);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(article, null, 2)
      }
    ]
  };
}

async function handleGetAbstract(args) {
  const { pmid } = args;

  if (!isValidPMID(pmid)) {
    throw new Error(`Invalid PMID format: ${pmid}`);
  }

  const article = await eutilsClient.getArticleDetails(pmid);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            pmid: article.pmid,
            title: article.title,
            abstract: article.abstract || 'No abstract available',
            authors: article.authors,
            journal: article.journal,
            publicationDate: article.publicationDate
          },
          null,
          2
        )
      }
    ]
  };
}

async function handleGetFullText(args) {
  const { pmcid } = args;

  if (!isValidPMCID(pmcid)) {
    throw new Error(`Invalid PMC ID format: ${pmcid}`);
  }

  const fullText = await pmcClient.getFullText(pmcid);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(fullText, null, 2)
      }
    ]
  };
}

async function handleBatchArticleLookup(args) {
  const { pmids } = args;

  if (!Array.isArray(pmids) || pmids.length === 0) {
    throw new Error('pmids must be a non-empty array');
  }

  if (pmids.length > 200) {
    throw new Error('Maximum 200 PMIDs allowed per batch');
  }

  // Validate all PMIDs
  for (const pmid of pmids) {
    if (!isValidPMID(pmid)) {
      throw new Error(`Invalid PMID format: ${pmid}`);
    }
  }

  // Process in chunks of 50
  const chunks = chunkArray(pmids, 50);
  const allArticles = [];

  for (const chunk of chunks) {
    const articles = await eutilsClient.getArticlesBatch(chunk);
    allArticles.push(...articles);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            totalRequested: pmids.length,
            totalRetrieved: allArticles.length,
            articles: allArticles
          },
          null,
          2
        )
      }
    ]
  };
}

async function handleGetCitedBy(args) {
  const { pmid, max_results = 100 } = args;

  if (!isValidPMID(pmid)) {
    throw new Error(`Invalid PMID format: ${pmid}`);
  }

  const citedByPmids = await eutilsClient.getCitedBy(pmid);
  const limitedPmids = citedByPmids.slice(0, max_results);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            pmid,
            citationCount: citedByPmids.length,
            citedBy: limitedPmids
          },
          null,
          2
        )
      }
    ]
  };
}

async function handleGetReferences(args) {
  const { pmid, max_results = 100 } = args;

  if (!isValidPMID(pmid)) {
    throw new Error(`Invalid PMID format: ${pmid}`);
  }

  const referencePmids = await eutilsClient.getReferences(pmid);
  const limitedPmids = referencePmids.slice(0, max_results);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            pmid,
            referenceCount: referencePmids.length,
            references: limitedPmids
          },
          null,
          2
        )
      }
    ]
  };
}

async function handleGetSimilarArticles(args) {
  const { pmid, max_results = 20 } = args;

  if (!isValidPMID(pmid)) {
    throw new Error(`Invalid PMID format: ${pmid}`);
  }

  const similarPmids = await eutilsClient.getSimilarArticles(pmid, max_results);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            pmid,
            similarArticles: similarPmids
          },
          null,
          2
        )
      }
    ]
  };
}

async function handleExportCitation(args) {
  const { pmid, format = 'apa' } = args;

  if (!isValidPMID(pmid)) {
    throw new Error(`Invalid PMID format: ${pmid}`);
  }

  const article = await eutilsClient.getArticleDetails(pmid);
  const citation = formatCitation(article, format);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            pmid,
            format,
            citation
          },
          null,
          2
        )
      }
    ]
  };
}

async function handleValidatePMID(args) {
  const { pmid } = args;

  const valid = isValidPMID(pmid);

  if (!valid) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              valid: false,
              pmid,
              message: 'Invalid PMID format. PMID must contain only digits.'
            },
            null,
            2
          )
        }
      ]
    };
  }

  // Check if article exists
  try {
    await eutilsClient.getArticleDetails(pmid);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              valid: true,
              pmid,
              exists: true,
              message: 'Valid PMID and article exists'
            },
            null,
            2
          )
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              valid: true,
              pmid,
              exists: false,
              message: 'Valid PMID format but article not found'
            },
            null,
            2
          )
        }
      ]
    };
  }
}

async function handleConvertIdentifiers(args) {
  const { identifier, identifier_type = 'auto' } = args;

  let inputType = identifier_type;

  // Auto-detect identifier type
  if (inputType === 'auto') {
    if (isValidPMID(identifier)) {
      inputType = 'pmid';
    } else if (isValidDOI(identifier)) {
      inputType = 'doi';
    } else if (isValidPMCID(identifier)) {
      inputType = 'pmcid';
    } else {
      throw new Error('Unable to auto-detect identifier type');
    }
  }

  const conversions = {};

  try {
    if (inputType === 'pmid') {
      const article = await eutilsClient.getArticleDetails(identifier);
      conversions.pmid = article.pmid;
      conversions.doi = article.doi;
      conversions.pmcid = article.pmcid;
    } else if (inputType === 'doi') {
      const searchResult = await eutilsClient.search({
        term: `${identifier}[DOI]`,
        retmax: 1
      });

      if (searchResult.pmids.length > 0) {
        const article = await eutilsClient.getArticleDetails(searchResult.pmids[0]);
        conversions.pmid = article.pmid;
        conversions.doi = article.doi;
        conversions.pmcid = article.pmcid;
      }
    } else if (inputType === 'pmcid') {
      const normalizedId = normalizePMCID(identifier);
      const searchResult = await eutilsClient.search({
        term: `${normalizedId}[PMC ID]`,
        retmax: 1
      });

      if (searchResult.pmids.length > 0) {
        const article = await eutilsClient.getArticleDetails(searchResult.pmids[0]);
        conversions.pmid = article.pmid;
        conversions.doi = article.doi;
        conversions.pmcid = article.pmcid;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              inputId: identifier,
              inputType,
              conversions
            },
            null,
            2
          )
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              inputId: identifier,
              inputType,
              conversions: {},
              error: extractErrorMessage(error)
            },
            null,
            2
          )
        }
      ]
    };
  }
}

// ------------------------- 主调度逻辑 -------------------------

async function main() {
  try {
    const request = await readStdin();

    // 约定: VCP 侧会传入 { command: "...", ...params }
    const command = request.command;
    if (!command || typeof command !== 'string') {
      throw new Error('Missing or invalid "command" field in request for PubMedSearch');
    }

    let toolResult;

    switch (command) {
      case 'search_articles':
        toolResult = await handleSearchArticles(request);
        break;
      case 'advanced_search':
        toolResult = await handleAdvancedSearch(request);
        break;
      case 'search_by_author':
        toolResult = await handleSearchByAuthor(request);
        break;
      case 'search_by_journal':
        toolResult = await handleSearchByJournal(request);
        break;
      case 'search_by_mesh_terms':
        toolResult = await handleSearchByMeshTerms(request);
        break;
      case 'get_trending_articles':
        toolResult = await handleGetTrendingArticles(request);
        break;
      case 'get_article_details':
        toolResult = await handleGetArticleDetails(request);
        break;
      case 'get_abstract':
        toolResult = await handleGetAbstract(request);
        break;
      case 'get_full_text':
        toolResult = await handleGetFullText(request);
        break;
      case 'batch_article_lookup':
        toolResult = await handleBatchArticleLookup(request);
        break;
      case 'get_cited_by':
        toolResult = await handleGetCitedBy(request);
        break;
      case 'get_references':
        toolResult = await handleGetReferences(request);
        break;
      case 'get_similar_articles':
        toolResult = await handleGetSimilarArticles(request);
        break;
      case 'export_citation':
        toolResult = await handleExportCitation(request);
        break;
      case 'validate_pmid':
        toolResult = await handleValidatePMID(request);
        break;
      case 'convert_identifiers':
        toolResult = await handleConvertIdentifiers(request);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }

    writeSuccess(wrapToolResult(toolResult));
  } catch (err) {
    const msg = extractErrorMessage(err);
    writeError('Tool execution failed: ' + msg);
    process.exitCode = 1;
  }
}

main().catch(err => {
  const msg = extractErrorMessage(err);
  writeError('Fatal error: ' + msg, 'FATAL');
  process.exit(1);
});