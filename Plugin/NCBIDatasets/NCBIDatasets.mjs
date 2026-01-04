#!/usr/bin/env node
import axios from 'axios';
import { fileURLToPath } from 'url';

/**
 * 兼容层：沿用原 MCP 里的错误模型，方便最小改动迁移。
 * 在 VCP 外壳里统一捕获并转换为 { status: "error", code, error }。
 */
class McpError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'McpError';
  }
}

const ErrorCode = {
  InvalidParams: 'InvalidParams',
  InvalidRequest: 'InvalidRequest',
  InternalError: 'InternalError',
  MethodNotFound: 'MethodNotFound'
};

// 运行时参数校验函数，保持与原逻辑一致
const isValidSearchArgs = (args) => {
  return (
    typeof args === 'object' &&
    args !== null &&
    (args.query === undefined || typeof args.query === 'string') &&
    (args.organism === undefined || typeof args.organism === 'string') &&
    (args.tax_id === undefined || typeof args.tax_id === 'number' || typeof args.tax_id === 'string') &&
    (args.assembly_level === undefined ||
      ['complete', 'chromosome', 'scaffold', 'contig'].includes(args.assembly_level)) &&
    (args.assembly_source === undefined ||
      ['refseq', 'genbank', 'all'].includes(args.assembly_source)) &&
    (args.max_results === undefined ||
      ((typeof args.max_results === 'number' || typeof args.max_results === 'string') &&
        Number(args.max_results) > 0 &&
        Number(args.max_results) <= 1000)) &&
    (args.page_token === undefined || typeof args.page_token === 'string') &&
    (args.exclude_atypical === undefined || typeof args.exclude_atypical === 'boolean')
  );
};

const isValidGeneSearchArgs = (args) => {
  return (
    typeof args === 'object' &&
    args !== null &&
    (args.gene_symbol === undefined || typeof args.gene_symbol === 'string') &&
    (args.gene_id === undefined || typeof args.gene_id === 'number' || typeof args.gene_id === 'string') &&
    (args.organism === undefined || typeof args.organism === 'string') &&
    (args.tax_id === undefined || typeof args.tax_id === 'number' || typeof args.tax_id === 'string') &&
    (args.chromosome === undefined || typeof args.chromosome === 'string') &&
    (args.max_results === undefined ||
      ((typeof args.max_results === 'number' || typeof args.max_results === 'string') &&
        Number(args.max_results) > 0 &&
        Number(args.max_results) <= 1000)) &&
    (args.page_token === undefined || typeof args.page_token === 'string')
  );
};

const isValidInfoArgs = (args) => {
  return (
    typeof args === 'object' &&
    args !== null &&
    (args.accession === undefined || typeof args.accession === 'string') &&
    (args.gene_id === undefined || typeof args.gene_id === 'number' || typeof args.gene_id === 'string') &&
    (args.tax_id === undefined || typeof args.tax_id === 'number' || typeof args.tax_id === 'string') &&
    (args.assembly_accession === undefined ||
      typeof args.assembly_accession === 'string') &&
    (args.include_annotation === undefined ||
      typeof args.include_annotation === 'boolean') &&
    (args.include_sequences === undefined ||
      typeof args.include_sequences === 'boolean')
  );
};

/**
 * 迁移后的核心类：
 * - 去掉 MCP Server 相关字段和构造逻辑；
 * - 保留 axios 客户端和所有 handle* 业务实现；
 * - 新增 callTool(name, args) 供 VCP 外壳路由调用。
 */
class NCBIDatasetsServer {
  constructor() {
    // Configuration from environment variables
    // 2026-01-02: NCBI 官方已将 Datasets 稳定版本从 v2alpha 迁移到 v2，
    // 原 MCP 代码仍然使用 v2alpha，在线环境会返回 404。
    // 这里将默认值更新为 v2，仍允许通过 NCBI_BASE_URL 覆盖。
    this.baseUrl =
      process.env.NCBI_BASE_URL || 'https://api.ncbi.nlm.nih.gov/datasets/v2';
    this.apiKey = process.env.NCBI_API_KEY;
    const timeout = parseInt(process.env.NCBI_TIMEOUT || '30000', 10);

    // Initialize NCBI Datasets API client
    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      timeout: timeout,
      headers: {
        'User-Agent': 'NCBI-Datasets-MCP-Server/1.0.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'api-key': this.apiKey })
      }
    });
  }

  /**
   * VCP 外壳使用的统一入口：
   * - name: 工具名（原 MCP 的 tool name）
   * - args: 参数对象（直接对应原 MCP 的 arguments）
   */
  async callTool(name, args) {
    try {
      switch (name) {
        // Genome Operations (MVP 包含：search_genomes, get_genome_info, get_genome_summary)
        case 'search_genomes':
          return await this.handleSearchGenomes(args);
        case 'get_genome_info':
          return await this.handleGetGenomeInfo(args);
        case 'get_genome_summary':
          return await this.handleGetGenomeSummary(args);

        // Gene Operations
        case 'search_genes':
          return await this.handleSearchGenes(args);
        case 'get_gene_info':
          return await this.handleGetGeneInfo(args);

        // Taxonomy Operations
        case 'search_taxonomy':
          return await this.handleSearchTaxonomy(args);
        case 'get_taxonomy_info':
          return await this.handleGetTaxonomyInfo(args);
        case 'get_organism_info':
          return await this.handleGetOrganismInfo(args);

        // Assembly Operations
        case 'search_assemblies':
          return await this.handleSearchAssemblies(args);
        case 'get_assembly_info':
          return await this.handleGetAssemblyInfo(args);

        // Advanced Operations
        case 'get_assembly_reports':
          return await this.handleGetAssemblyReports(args);

        // Virus Operations
        case 'search_virus_genomes':
          return await this.handleSearchVirusGenomes(args);
        case 'get_virus_info':
          return await this.handleGetVirusInfo(args);

        // Protein Operations
        case 'search_proteins':
          return await this.handleSearchProteins(args);
        case 'get_protein_info':
          return await this.handleGetProteinInfo(args);

        // Annotation Operations
        case 'get_genome_annotation':
          return await this.handleGetGenomeAnnotation(args);
        case 'search_genome_features':
          return await this.handleSearchGenomeFeatures(args);

        // Phylogenetic Operations
        case 'get_taxonomic_lineage':
          return await this.handleGetTaxonomicLineage(args);

        // Statistics and Summary Operations
        case 'get_database_stats':
          return await this.handleGetDatabaseStats(args);
        case 'search_by_bioproject':
          return await this.handleSearchByBioproject(args);
        case 'search_by_biosample':
          return await this.handleSearchByBiosample(args);

        // Quality Control Operations
        case 'get_assembly_quality':
          return await this.handleGetAssemblyQuality(args);

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error) {
      // 兼容原 MCP 的错误输出结构，交由顶层再包一层 status/error
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Error executing tool ${name}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  // ==================== 以下为原始 handle* 业务逻辑，基本保持原样 ====================

  async handleSearchGenomes(args) {
    if (!isValidSearchArgs(args) || !args.tax_id) {
      throw new McpError(ErrorCode.InvalidParams, 'Tax ID is required for genome search');
    }

    try {
      const params = {
        page_size: args.max_results || 50
      };

      if (args.assembly_level) params.assembly_level = args.assembly_level;
      if (args.assembly_source && args.assembly_source !== 'all')
        params.assembly_source = args.assembly_source;
      if (args.page_token) params.page_token = args.page_token;

      const response = await this.apiClient.get(
        `/genome/taxon/${args.tax_id}/dataset_report`,
        { params }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                search_parameters: args,
                total_count: response.data.total_count || 0,
                returned_count: response.data.reports?.length || 0,
                page_token: response.data.next_page_token,
                genomes: response.data.reports || []
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search genomes: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleGetGenomeInfo(args) {
    if (!isValidInfoArgs(args) || !args.accession) {
      throw new McpError(ErrorCode.InvalidParams, 'Genome accession is required');
    }

    try {
      const params = {};
      if (args.include_annotation !== false)
        params.include_annotation_type = 'GENOME_GFF,GENOME_GBFF';

      const response = await this.apiClient.get(
        `/genome/accession/${args.accession}/dataset_report`,
        { params }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get genome info: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleGetGenomeSummary(args) {
    if (!isValidInfoArgs(args) || !args.accession) {
      throw new McpError(ErrorCode.InvalidParams, 'Genome accession is required');
    }

    try {
      const response = await this.apiClient.get(
        `/genome/accession/${args.accession}/dataset_report`
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                accession: args.accession,
                summary: response.data
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get genome summary: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleSearchGenes(args) {
    if (!isValidGeneSearchArgs(args)) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid gene search arguments');
    }

    try {
      // v2 API: /gene/search 已废弃，需根据参数选择具体的 dataset_report 端点
      let endpoint = '';
      const params = {
        page_size: args.max_results || 20, // v2 通常使用 page_size
        page_token: args.page_token
      };

      const taxon = args.organism || (args.tax_id ? args.tax_id.toString() : null);

      if (args.gene_symbol && taxon) {
        // 按符号+物种搜索 (需手动编码 Path 参数)
        endpoint = `/gene/symbol/${encodeURIComponent(args.gene_symbol)}/taxon/${encodeURIComponent(taxon)}/dataset_report`;
      } else if (args.gene_id) {
        // 按 ID 搜索
        endpoint = `/gene/id/${args.gene_id}/dataset_report`;
      } else if (taxon) {
        // 按物种列出基因
        endpoint = `/gene/taxon/${encodeURIComponent(taxon)}/dataset_report`;
      } else {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Must provide at least (gene_symbol + organism/tax_id), gene_id, or organism/tax_id'
        );
      }

      const response = await this.apiClient.get(endpoint, { params });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                search_parameters: args,
                total_count: response.data.total_count || 0,
                returned_count: response.data.reports?.length || 0,
                page_token: response.data.next_page_token,
                genes: response.data.reports || [] // v2 返回 reports
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search genes: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleGetGeneInfo(args) {
    try {
      let endpoint = '';
      const params = {};

      // v2 API: 直接使用 dataset_report 端点获取详情
      if (args.gene_id) {
        endpoint = `/gene/id/${args.gene_id}/dataset_report`;
      } else if (args.gene_symbol && args.organism) {
        endpoint = `/gene/symbol/${args.gene_symbol}/taxon/${args.organism}/dataset_report`;
      } else {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Either gene_id or gene_symbol with organism must be provided'
        );
      }

      const response = await this.apiClient.get(endpoint, { params });

      // v2 dataset_report 返回的是 { reports: [...] } 数组结构
      // 为了保持 get_gene_info 返回单个对象的语义，我们提取第一个 report
      const result = response.data.reports && response.data.reports.length > 0
        ? response.data.reports[0]
        : response.data;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get gene info: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleSearchTaxonomy(args) {
    if (!args.query || typeof args.query !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Search query is required');
    }

    try {
      // v2 API: /taxonomy/search 已废弃，使用 /taxonomy/taxon/{name}
      // 注意：v2 的这个接口既可以查精确匹配，也会返回模糊匹配列表
      const response = await this.apiClient.get(`/taxonomy/taxon/${args.query}`);

      // v2 返回结构通常包含 taxonomy_nodes 数组
      const results = response.data.taxonomy_nodes || [];
      
      // 如果有 rank 过滤，手动在客户端做（API 似乎不再直接支持 rank 参数过滤）
      const filtered = args.rank
        ? results.filter(n => n.taxonomy && n.taxonomy.rank === args.rank)
        : results;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                search_parameters: args,
                total_count: filtered.length,
                returned_count: filtered.length,
                taxonomy: filtered.map(n => n.taxonomy) // 提取内部 taxonomy 对象
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      // 404 在 v2 中可能表示没找到，但也可能是 API 错误，这里做个兼容
      if (error.response && error.response.status === 404) {
         return {
          content: [{ type: 'text', text: JSON.stringify({ total_count: 0, taxonomy: [] }, null, 2) }]
         };
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search taxonomy: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleGetTaxonomyInfo(args) {
    if (!args.tax_id || (typeof args.tax_id !== 'number' && typeof args.tax_id !== 'string')) {
      throw new McpError(ErrorCode.InvalidParams, 'Taxonomy ID is required');
    }

    try {
      const params = {};
      if (args.include_lineage !== false) params.include_lineage = true;

      const response = await this.apiClient.get(`/taxonomy/taxon/${args.tax_id}`, {
        params
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get taxonomy info: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleGetOrganismInfo(args) {
    if (!args.organism && !args.tax_id) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Either organism name or taxonomy ID is required'
      );
    }

    try {
      let taxId = args.tax_id;
      let taxonomyData = null;

      // 1. Resolve Taxonomy / Organism Info
      if (args.organism && !taxId) {
        // v2 API: 使用 /taxonomy/taxon/{name} 替代已废弃的 /taxonomy/search
        const taxResponse = await this.apiClient.get(`/taxonomy/taxon/${args.organism}`);
        
        // v2 返回结构通常为 { taxonomy_nodes: [...] }
        if (taxResponse.data.taxonomy_nodes && taxResponse.data.taxonomy_nodes.length > 0) {
          const node = taxResponse.data.taxonomy_nodes[0];
          taxId = node.taxonomy.tax_id;
          taxonomyData = node.taxonomy;
        } else {
          throw new McpError(
            ErrorCode.InternalError,
            `Organism ${args.organism} not found`
          );
        }
      } else {
        // 使用 ID 查询
        const taxResponse = await this.apiClient.get(`/taxonomy/taxon/${taxId}`);
        // 兼容 v2 可能的返回结构 (reports 或直接对象)
        if (taxResponse.data.reports && taxResponse.data.reports.length > 0) {
           taxonomyData = taxResponse.data.reports[0].taxonomy;
        } else if (taxResponse.data.taxonomy) {
           taxonomyData = taxResponse.data.taxonomy;
        } else {
           taxonomyData = taxResponse.data;
        }
      }

      // 2. Get Genomes using dataset_report endpoint (replaces /genome/search)
      // v2 API: /genome/search 已废弃，使用 /genome/taxon/{id}/dataset_report
      const genomesResponse = await this.apiClient.get(
        `/genome/taxon/${taxId}/dataset_report`,
        { params: { page_size: 10 } }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                organism_info: taxonomyData,
                // v2 返回字段为 reports
                available_genomes: genomesResponse.data.reports || [],
                genome_count: genomesResponse.data.total_count || 0
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get organism info: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleSearchAssemblies(args) {
    // v2 API: /assembly/search 已废弃。
    // 策略：复用 handleSearchGenomes 的逻辑，因为 v2 中 Assembly 和 Genome 是一回事。
    // 如果提供了 query 但没提供 tax_id，先尝试解析 query 为 tax_id。
    
    if (!args.tax_id && args.query) {
      try {
        // 尝试把 query 当作物种名解析
        const taxRes = await this.apiClient.get(`/taxonomy/taxon/${args.query}`);
        if (taxRes.data.taxonomy_nodes && taxRes.data.taxonomy_nodes.length > 0) {
          args.tax_id = taxRes.data.taxonomy_nodes[0].taxonomy.tax_id;
        }
      } catch (e) {
        // 解析失败则忽略，后续会报错
      }
    }

    // 复用 search_genomes 的实现
    return this.handleSearchGenomes(args);
  }

  async handleGetAssemblyInfo(args) {
    if (!args.assembly_accession || typeof args.assembly_accession !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Assembly accession is required');
    }

    try {
      const params = {};
      // v2 API: 使用 /genome/accession/... 替代 /assembly/accession/...
      const response = await this.apiClient.get(
        `/genome/accession/${args.assembly_accession}/dataset_report`,
        { params }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get assembly info: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleGetAssemblyReports(args) {
    if (!args.assembly_accession || typeof args.assembly_accession !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Assembly accession is required');
    }

    try {
      // v2 API: 统一使用 dataset_report，不再区分细粒度的 report endpoint
      const endpoint = `/genome/accession/${args.assembly_accession}/dataset_report`;
      const response = await this.apiClient.get(endpoint);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                assembly_accession: args.assembly_accession,
                report_type: args.report_type || 'dataset_report',
                report: response.data
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get assembly reports: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleSearchVirusGenomes(args) {
    try {
      const taxon = args.virus_name || (args.tax_id ? args.tax_id.toString() : null);
      if (!taxon) {
        throw new McpError(ErrorCode.InvalidParams, 'Either virus_name or tax_id is required.');
      }

      const params = {
        page_size: args.max_results || 50,
        page_token: args.page_token
        // Other filters like host, geo_location are handled differently in v2, simplifying for now.
      };

      // v2 API: /virus/search 已废弃, 使用 /virus/taxon/{taxon}/dataset_report
      const response = await this.apiClient.get(`/virus/taxon/${encodeURIComponent(taxon)}/dataset_report`, { params });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                search_parameters: args,
                total_count: response.data.total_count || 0,
                returned_count: response.data.reports?.length || 0,
                page_token: response.data.next_page_token,
                virus_genomes: response.data.reports || []
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search virus genomes: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleGetVirusInfo(args) {
    if (!args.accession || typeof args.accession !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Viral genome accession is required'
      );
    }

    try {
      // v2 API: /virus/accession/{accession} 已废弃, 使用 /virus/accession/{accessions}/dataset_report
      const response = await this.apiClient.get(
        `/virus/accession/${args.accession}/dataset_report`
      );
      
      const result = response.data.reports && response.data.reports.length > 0
        ? response.data.reports[0]
        : response.data;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get virus info: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleSearchProteins(args) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: "deprecated",
              message: "The global protein search endpoint is not available in NCBI Datasets v2 API. Protein information is now typically accessed via gene-centric endpoints.",
              search_parameters: args
            },
            null,
            2
          )
        }
      ]
    };
  }

  async handleGetProteinInfo(args) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: "deprecated",
              message: "The global protein info endpoint is not available in NCBI Datasets v2 API. Protein information is now typically accessed via gene-centric endpoints.",
              request_parameters: args
            },
            null,
            2
          )
        }
      ]
    };
  }

  async handleGetGenomeAnnotation(args) {
    if (!args.accession || typeof args.accession !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Genome accession is required');
    }

    try {
      const params = {
        // v2 uses more granular filters, mapping 'genes' to a common search
        search_text: args.annotation_type === 'genes' ? 'gene' : undefined,
        gene_types: args.feature_type && args.feature_type !== 'all' ? args.feature_type : undefined,
        // chromosome/range filters are handled via 'locations' param in v2
      };

      // v2 API: /genome/accession/{accession}/annotation 已废弃, 使用 /genome/accession/{accession}/annotation_report
      const response = await this.apiClient.get(
        `/genome/accession/${args.accession}/annotation_report`,
        { params }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                accession: args.accession,
                annotation_type: args.annotation_type || 'all',
                annotation: response.data
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get genome annotation: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleSearchGenomeFeatures(args) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: "deprecated",
              message: "The global genome feature search is not available in NCBI Datasets v2 API. To find features, you must first specify a genome assembly and search within its annotation report using 'get_genome_annotation'.",
              search_parameters: args
            },
            null,
            2
          )
        }
      ]
    };
  }

  async handleGetTaxonomicLineage(args) {
    if (!args.tax_id || (typeof args.tax_id !== 'number' && typeof args.tax_id !== 'string')) {
      throw new McpError(ErrorCode.InvalidParams, 'Taxonomy ID is required');
    }

    try {
      // v2 API: /taxonomy/taxon/{id}/lineage 已废弃。
      // 直接请求 /taxonomy/taxon/{id}，返回信息中包含 lineage 字段。
      const response = await this.apiClient.get(`/taxonomy/taxon/${args.tax_id}`);
      
      // 提取 lineage
      // v2 结构多变，可能是 { reports: [{ taxonomy: { lineage: [] } }] }
      // 也可能是 { taxonomy_nodes: [{ taxonomy: { lineage: [] } }] }
      let lineage = [];
      const data = response.data;

      if (data.reports && data.reports.length > 0 && data.reports[0].taxonomy) {
        lineage = data.reports[0].taxonomy.lineage || [];
      } else if (data.taxonomy_nodes && data.taxonomy_nodes.length > 0 && data.taxonomy_nodes[0].taxonomy) {
        lineage = data.taxonomy_nodes[0].taxonomy.lineage || [];
      } else if (data.taxonomy) {
        lineage = data.taxonomy.lineage || [];
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                tax_id: args.tax_id,
                taxonomic_lineage: lineage
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get taxonomic lineage: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleGetDatabaseStats(args) {
    // v2 API 似乎移除了公开的 /stats/database 接口。
    // 为了不破坏客户端调用，返回一个 Mock 的提示信息。
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: "deprecated",
              message: "The database statistics endpoint is not available in NCBI Datasets v2 API.",
              data_type: args.data_type || 'all'
            },
            null,
            2
          )
        }
      ]
    };
  }

  async handleSearchByBioproject(args) {
    if (!args.bioproject_accession || typeof args.bioproject_accession !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'BioProject accession is required');
    }

    try {
      // v2 API: BioProject 归属在 genome 下 -> /genome/bioproject/{accession}/dataset_report
      const response = await this.apiClient.get(`/genome/bioproject/${args.bioproject_accession}/dataset_report`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                bioproject_accession: args.bioproject_accession,
                report: response.data
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search by BioProject: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleSearchByBiosample(args) {
    if (!args.biosample_accession || typeof args.biosample_accession !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'BioSample accession is required');
    }

    try {
      // v2 API: BioSample 归属在 genome 下 -> /genome/biosample/{accession}/dataset_report
      const response = await this.apiClient.get(`/genome/biosample/${args.biosample_accession}/dataset_report`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                biosample_accession: args.biosample_accession,
                report: response.data
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search by BioSample: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async handleGetAssemblyQuality(args) {
    if (!args.accession || typeof args.accession !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Assembly accession is required');
    }

    try {
      // v2 API: 质量报告已整合进主 dataset_report 中，直接调用即可
      const response = await this.apiClient.get(
        `/genome/accession/${args.accession}/dataset_report`
      );

      // 客户端可以从返回的 report 中自行提取 quality_metrics
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                accession: args.accession,
                quality_metrics_report: response.data
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get assembly quality: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}

/**
 * VCP 同步插件入口：
 * - 从 stdin 读入一段 JSON；
 * - 解析出 tool_name / command / args；
 * - 调用 NCBIDatasetsServer.callTool；
 * - 输出 { status, result } 或 { status:"error", code, error }。
 */
async function main() {
  const server = new NCBIDatasetsServer();

  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  if (!input.trim()) {
    const err = {
      status: 'error',
      code: ErrorCode.InvalidRequest,
      error: 'Empty input for NCBI Datasets plugin'
    };
    process.stdout.write(JSON.stringify(err) + '\n');
    return;
  }

  try {
    const payload = JSON.parse(input);

    // 约定：优先用 tool_name，其次用 command / name，最后兜底一个默认
    const toolName =
      payload.tool_name || payload.command || payload.name || 'search_genomes';
    const args = payload.args || payload.arguments || payload;

    const innerResult = await server.callTool(toolName, args);

    const output = {
      status: 'success',
      tool: toolName,
      result: innerResult
    };

    process.stdout.write(JSON.stringify(output) + '\n');
  } catch (e) {
    let code = ErrorCode.InternalError;
    let message = 'Unknown error';

    if (e instanceof McpError) {
      code = e.code || ErrorCode.InternalError;
      message = e.message;
    } else if (e instanceof Error) {
      message = e.message;
    }

    const errOutput = {
      status: 'error',
      code,
      error: message
    };

    process.stdout.write(JSON.stringify(errOutput) + '\n');
  }
}

// 兼容 Windows/Linux 的入口判断
const isMainModule = () => {
  if (!process.argv[1]) return false;
  const entryPath = fileURLToPath(import.meta.url);
  // 简单比对路径是否一致（忽略大小写以兼容 Windows）
  return entryPath.toLowerCase() === process.argv[1].toLowerCase() ||
         entryPath === process.argv[1];
};

if (isMainModule()) {
  main().catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    process.stdout.write(
      JSON.stringify({
        status: 'error',
        code: ErrorCode.InternalError,
        error: `Fatal error in NCBIDatasets plugin: ${msg}`
      }) + '\n'
    );
    process.exit(1);
  });
}