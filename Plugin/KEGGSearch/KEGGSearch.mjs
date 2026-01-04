#!/usr/bin/env node
import axios from 'axios';
import http from 'http';
import https from 'https';

// This will be populated with the ported handler functions
const apiClient = axios.create({
    baseURL: 'https://rest.kegg.jp',
    timeout: 60000,
    headers: {
        'User-Agent': 'KEGG-VCP-Plugin/1.0.0',
        'Accept': 'text/plain',
    },
    // Removing custom agents. The underlying issue seems to be more complex
    // than just TLS versioning. Let's revert to axios defaults to match the
    // MCP server's environment and re-evaluate.
});

// +------------------+
// | CORE PARSERS     |
// +------------------+
/**
 * Parses a single KEGG entry from its flat file format into a JSON object.
 * @param {string} data The raw text data of a KEGG entry.
 * @returns {object} A structured JSON object representing the entry.
 */
function parseKEGGEntry(data) {
    const lines = data.split('\n');
    const result = {};
    let currentField = null;
    let subFieldData = {};

    for (const line of lines) {
        if (line.startsWith('///')) {
            break;
        }

        if (line.substring(0, 12).trim() !== '') {
            currentField = line.substring(0, 12).trim();
            if (!result[currentField.toLowerCase()]) {
                result[currentField.toLowerCase()] = [];
            }
        }

        const content = line.substring(12).trim();
        if (currentField) {
            result[currentField.toLowerCase()].push(content);
        }
    }

    // Post-process to clean up the structure
    const finalResult = {};
    for (const key in result) {
        const value = result[key];
        if (key === 'entry') {
            const content = value[0];
            const parts = content.split(/\s+/);
            // For enzymes, the entry line is like "EC 1.1.1.1       Enzyme"
            // The ID is the second part. For others, it's the first.
            if (parts[0] === 'EC') {
                finalResult.entry = parts[1];
                finalResult.type = parts.slice(2).join(' ');
            } else {
                finalResult.entry = parts[0];
                finalResult.type = parts.slice(1).join(' ');
            }
        } else if (key === 'name' || key === 'definition' || key === 'formula') {
            finalResult[key] = value.join(' ');
        } else if (key === 'dblinks') {
            finalResult.dblinks = finalResult.dblinks || {};
            value.forEach(link => {
                const [db, ids] = link.split(/:\s+/);
                finalResult.dblinks[db] = ids.split(/\s+/);
            });
        } else if (['pathway', 'gene', 'compound', 'reaction', 'orthology'].includes(key)) {
            finalResult[key] = finalResult[key] || {};
            value.forEach(item => {
                const match = item.match(/(\S+)\s+(.+)/);
                if (match) {
                    finalResult[key][match[1]] = match[2];
                }
            });
        } else {
            finalResult[key] = value.length === 1 ? value[0] : value;
        }
    }

    return finalResult;
}


/**
 * Parses a KEGG list result (tab-separated) into a key-value object.
 * @param {string} data The raw text data from a KEGG list/find operation.
 * @returns {object} An object where keys are KEGG IDs and values are their descriptions.
 */
function parseKEGGList(data) {
    const result = {};
    const lines = data.split('\n').filter(line => line.trim());

    for (const line of lines) {
        const tabIndex = line.indexOf('\t');
        if (tabIndex > 0) {
            const id = line.substring(0, tabIndex);
            const name = line.substring(tabIndex + 1);
            result[id] = name;
        }
    }

    return result;
}

function streamToString(stream) {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}


// +------------------+
// | TOOL HANDLERS    |
// +------------------+

/**
 * Get release information and statistics for any KEGG database.
 * @param {object} args - The arguments for the tool.
 * @param {string} args.database - Database name.
 * @returns {Promise<object>} - An object containing the database info.
 */
async function handleGetDatabaseInfo(args) {
    if (!args.database || typeof args.database !== 'string') {
        throw new Error('Database parameter is required and must be a string.');
    }
    const response = await apiClient.get(`/info/${args.database}`);
    return {
        database: args.database,
        info: response.data,
    };
}

/**
 * Get all KEGG organisms with codes and names.
 * @param {object} args - The arguments for the tool.
 * @param {number} [args.limit=100] - Maximum number of organisms to return.
 * @returns {Promise<object>} - An object containing the list of organisms.
 */
// async function handleListOrganisms(args) {
//     const response = await apiClient.get('/list/organism');
//     const organisms = parseKEGGList(response.data);
//     const limit = args.limit || 100;
//
//     const limitedOrganisms = Object.fromEntries(
//         Object.entries(organisms).slice(0, limit)
//     );
//
//     return {
//         total_organisms: Object.keys(organisms).length,
//         returned_count: Object.keys(limitedOrganisms).length,
//         organisms: limitedOrganisms,
//     };
// }

/**
 * A generic handler for various KEGG find operations.
 * @param {object} args - The arguments for the tool.
 * @param {string} args.query - The search query.
 * @param {number} [args.max_results=50] - Max number of results.
 * @param {string} database - The KEGG database to search (e.g., 'pathway', 'gene').
 * @param {string} resultKey - The key to use for the results in the final object (e.g., 'pathways', 'genes').
 * @returns {Promise<object>} - A structured search result object.
 */
async function handleGenericSearch(args, database, resultKey) {
    if (!args.query || typeof args.query !== 'string') {
        throw new Error('Query parameter is required and must be a string.');
    }

    let endpoint = `/find/${database}/${encodeURIComponent(args.query)}`;
    
    // Special handling for compound search types
    if (database.startsWith('compound') && args.search_type && ['formula', 'exact_mass', 'mol_weight'].includes(args.search_type)) {
        endpoint += `/${args.search_type}`;
    }

    const response = await apiClient.get(endpoint);
    const results = parseKEGGList(response.data);
    const maxResults = args.max_results || 50;

    const limitedResults = Object.fromEntries(
        Object.entries(results).slice(0, maxResults)
    );

    const output = {
        query: args.query,
        database: database,
        total_found: Object.keys(results).length,
        returned_count: Object.keys(limitedResults).length,
        [resultKey]: limitedResults,
    };
    
    if (args.search_type) output.search_type = args.search_type;
    if (args.organism_code) output.organism_code = args.organism_code;
    if (args.hierarchy_type) output.hierarchy_type = args.hierarchy_type;

    return output;
}

// Specific search handlers calling the generic one
async function handleSearchPathways(args) {
    // KEGG API does not support organism code in the path for pathway search.
    // The search is global, and results contain organism prefixes.
    const database = 'pathway';
    return handleGenericSearch(args, database, 'pathways');
}
async function handleSearchGenes(args) {
    const database = args.organism_code || 'genes';
    return handleGenericSearch(args, database, 'genes');
}
async function handleSearchCompounds(args) {
    return handleGenericSearch(args, 'compound', 'compounds');
}
async function handleSearchReactions(args) {
    return handleGenericSearch(args, 'reaction', 'reactions');
}
async function handleSearchEnzymes(args) {
    return handleGenericSearch(args, 'enzyme', 'enzymes');
}
async function handleSearchDiseases(args) {
    return handleGenericSearch(args, 'disease', 'diseases');
}
async function handleSearchDrugs(args) {
    return handleGenericSearch(args, 'drug', 'drugs');
}
async function handleSearchModules(args) {
    return handleGenericSearch(args, 'module', 'modules');
}
async function handleSearchKoEntries(args) {
    return handleGenericSearch(args, 'ko', 'ko_entries');
}
async function handleSearchGlycans(args) {
    return handleGenericSearch(args, 'glycan', 'glycans');
}
async function handleSearchBrite(args) {
    return handleGenericSearch(args, 'brite', 'brite_entries');
}

/**
 * A generic handler for fetching detailed information for a KEGG entry.
 * @param {object} args - The arguments for the tool.
 * @param {string} idKey - The key in args that holds the entry ID (e.g., 'pathway_id', 'gene_id').
 * @returns {Promise<object>} - A structured object of the entry's details.
 */
async function handleGenericGetInfo(args, idKey) {
    const entryId = args[idKey];
    if (!entryId || typeof entryId !== 'string') {
        throw new Error(`Parameter '${idKey}' is required and must be a string.`);
    }

    let endpoint = `/get/${entryId}`;
    
    // Handle special formats for pathways and brite
    if (args.format && ['kgml', 'image', 'conf', 'htext'].includes(args.format)) {
        endpoint += `/${args.format}`;
    }

    const response = await apiClient.get(endpoint);

    // For non-json formats, return raw text
    if (args.format && args.format !== 'json') {
        return { raw_data: response.data, format: args.format };
    }

    const entryInfo = parseKEGGEntry(response.data);

    // Special handling for gene sequences
    if (idKey === 'gene_id' && args.include_sequences) {
        try {
            const [aaseqResponse, ntseqResponse] = await Promise.all([
                apiClient.get(`/get/${entryId}/aaseq`).catch(() => ({ data: null })),
                apiClient.get(`/get/${entryId}/ntseq`).catch(() => ({ data: null })),
            ]);
            if (aaseqResponse.data) entryInfo.aaseq = aaseqResponse.data;
            if (ntseqResponse.data) entryInfo.ntseq = ntseqResponse.data;
        } catch (error) {
            // Ignore if sequences are not available
        }
    }

    return entryInfo;
}

async function handleGetDrugInteractions(args) {
    const { drug_ids } = args;
    if (!drug_ids || !Array.isArray(drug_ids) || drug_ids.length === 0) {
        throw new Error("Parameter 'drug_ids' is required and must be an array.");
    }
    const drugList = drug_ids.join('+');
    // Per user instruction, correcting the endpoint to use the standalone /ddi/ operator.
    const response = await apiClient.get(`/ddi/${drugList}`);
    const interactions = parseKEGGList(response.data);
    return {
        drug_ids: drug_ids,
        interaction_count: Object.keys(interactions).length,
        interactions: interactions,
    };
}

// Specific get_info handlers
const getInfoHandlers = {
    'get_pathway_info': (args) => handleGenericGetInfo(args, 'pathway_id'),
    'get_gene_info': (args) => handleGenericGetInfo(args, 'gene_id'),
    'get_compound_info': (args) => handleGenericGetInfo(args, 'compound_id'),
    'get_reaction_info': (args) => handleGenericGetInfo(args, 'reaction_id'),
    'get_enzyme_info': (args) => handleGenericGetInfo(args, 'ec_number'),
    'get_disease_info': (args) => handleGenericGetInfo(args, 'disease_id'),
    'get_drug_info': (args) => handleGenericGetInfo(args, 'drug_id'),
    'get_module_info': (args) => handleGenericGetInfo(args, 'module_id'),
    'get_ko_info': (args) => handleGenericGetInfo(args, 'ko_id'),
    'get_glycan_info': (args) => handleGenericGetInfo(args, 'glycan_id'),
};

async function handleGetBriteInfo(args) {
    const briteId = args.brite_id;
    if (!briteId || typeof briteId !== 'string') {
        throw new Error("Parameter 'brite_id' is required and must be a string.");
    }
    const endpoint = `/get/${briteId}`;
    // Use streaming for potentially large Brite hierarchy responses
    const response = await apiClient.get(endpoint, { responseType: 'stream' });
    const data = await streamToString(response.data);
    return { raw_data: data };
}

/**
 * A generic handler for link operations between databases.
 * @param {object} args - The arguments for the tool.
 * @param {string} idKey - The key in args that holds the source entry ID.
 * @param {string} targetDb - The target database.
 * @param {string} resultKey - The key for the results in the output object.
 * @returns {Promise<object>} - A structured object of linked entries.
 */
// This generic handler was flawed because KEGG's /link API is inconsistent.
// It's safer to have specific handlers for each link-based tool.
// async function handleGenericLink(args, idKey, targetDb, resultKey) { ... }

async function handleGetPathwayGenes(args) {
    const { pathway_id } = args;
    if (!pathway_id || typeof pathway_id !== 'string') {
        throw new Error("Parameter 'pathway_id' is required.");
    }
    // The correct way is to get the full pathway entry and extract the gene section.
    const response = await apiClient.get(`/get/${pathway_id}`);
    const entryInfo = parseKEGGEntry(response.data);
    const genes = entryInfo.gene || {};
    return { pathway_id, gene_count: Object.keys(genes).length, genes: genes };
}

async function handleGetPathwayCompounds(args) {
    const { pathway_id } = args;
    if (!pathway_id || typeof pathway_id !== 'string') {
        throw new Error("Parameter 'pathway_id' is required.");
    }
    // The /link API is unreliable, get the full entry and parse it.
    // This is the most robust method, even if the pathway type (e.g., signaling)
    // results in an empty list for this field.
    const response = await apiClient.get(`/get/${pathway_id}`);
    const entryInfo = parseKEGGEntry(response.data);
    const compounds = entryInfo.compound || {};
    return { pathway_id, compound_count: Object.keys(compounds).length, compounds: compounds };
}

async function handleGetPathwayReactions(args) {
    const { pathway_id } = args;
    if (!pathway_id || typeof pathway_id !== 'string') {
        throw new Error("Parameter 'pathway_id' is required.");
    }
    // Replicating the exact implementation from the working MCP Server reference.
    // It confirms that /link/reaction is the correct endpoint.
    const response = await apiClient.get(`/link/reaction/${pathway_id}`);
    const reactions = parseKEGGList(response.data);
    return { pathway_id, reaction_count: Object.keys(reactions).length, reactions: reactions };
}

async function handleGetCompoundReactions(args) {
    const { compound_id } = args;
    if (!compound_id || typeof compound_id !== 'string') {
        throw new Error("Parameter 'compound_id' is required.");
    }
    const response = await apiClient.get(`/link/reaction/${compound_id}`);
    const links = parseKEGGList(response.data);
    return { compound_id, reaction_count: Object.keys(links).length, reactions: links };
}

async function handleGetGeneOrthologs(args) {
    const { gene_id, target_organisms } = args;
    if (!gene_id || typeof gene_id !== 'string') {
        throw new Error('Parameter \'gene_id\' is required and must be a string.');
    }
    // First, find the KO entry for the given gene
    const koResponse = await apiClient.get(`/link/ko/${gene_id}`);
    const koLinks = parseKEGGList(koResponse.data);

    let orthologs = koLinks;
    // If target organisms are specified, we need to find genes in those organisms for each KO
    if (target_organisms && Array.isArray(target_organisms) && target_organisms.length > 0) {
        const orthologResults = {};
        for (const ko of Object.keys(koLinks)) {
            for (const org of target_organisms) {
                try {
                    const orgResponse = await apiClient.get(`/link/${org}/${ko}`);
                    const orgGenes = parseKEGGList(orgResponse.data);
                    Object.assign(orthologResults, orgGenes);
                } catch (error) {
                    // Ignore if organism doesn't have this KO
                }
            }
        }
        orthologs = orthologResults;
    }

    return {
        gene_id: gene_id,
        target_organisms: target_organisms,
        ortholog_count: Object.keys(orthologs).length,
        orthologs: orthologs,
    };
}

async function handleConvertIdentifiers(args) {
    const { source_db, target_db, identifiers } = args;
    if (!source_db || !target_db) {
        throw new Error('Source and target databases are required.');
    }
    const idList = identifiers && identifiers.length > 0 ? identifiers.join('+') : source_db;
    const endpoint = `/conv/${target_db}/${idList}`;
    const response = await apiClient.get(endpoint);
    const conversions = parseKEGGList(response.data);
    return {
        source_db,
        target_db,
        conversion_count: Object.keys(conversions).length,
        conversions,
    };
}

async function handleFindRelatedEntries(args) {
    const { source_db, target_db, source_entries } = args;
    if (!source_db || !target_db) {
        throw new Error('Source and target databases are required.');
    }
    const entryList = source_entries && source_entries.length > 0 ? source_entries.join('+') : source_db;

    // Special handling for pathway to gene, which is not a /link operation
    if (source_db === 'pathway' && (target_db === 'gene' || target_db === 'genes')) {
        // This case requires getting the full entry and parsing the gene list
        const response = await apiClient.get(`/get/${entryList}`);
        const entryInfo = parseKEGGEntry(response.data);
        const links = entryInfo.gene || {};
        return {
            source_db,
            target_db,
            link_count: Object.keys(links).length,
            links,
        };
    }

    // All other cases use the standard /link operation
    const endpoint = `/link/${target_db}/${entryList}`;
    // Use streaming for potentially large list responses
    const response = await apiClient.get(endpoint, { responseType: 'stream' });
    const data = await streamToString(response.data);
    const links = parseKEGGList(data);
    return {
        source_db,
        target_db,
        link_count: Object.keys(links).length,
        links,
    };
}

async function handleBatchEntryLookup(args) {
    const { entry_ids, operation = 'info' } = args;
    if (!entry_ids || !Array.isArray(entry_ids) || entry_ids.length === 0) {
        throw new Error('entry_ids array is required.');
    }

    const results = [];
    for (const entryId of entry_ids) {
        try {
            let response;
            let data;
            switch (operation) {
                case 'sequence':
                    response = await apiClient.get(`/get/${entryId}/aaseq`);
                    data = { sequence: response.data };
                    break;
                case 'pathway':
                case 'link': // link to KO
                    const targetDb = operation === 'pathway' ? 'pathway' : 'ko';
                    response = await apiClient.get(`/link/${targetDb}/${entryId}`);
                    data = parseKEGGList(response.data);
                    break;
                default: // 'info'
                    response = await apiClient.get(`/get/${entryId}`);
                    data = parseKEGGEntry(response.data);
            }
            results.push({ entry_id: entryId, data, success: true });
        } catch (error) {
            results.push({
                entry_id: entryId,
                error: error.message,
                success: false,
            });
        }
    }

    return {
        operation,
        total_entries: entry_ids.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
    };
}


// +------------------+
// | VCP ADAPTOR      |
// +------------------+
async function main() {
    let inputData = '';
    process.stdin.on('data', chunk => {
        inputData += chunk;
    });

    process.stdin.on('end', async () => {
        try {
            const request = JSON.parse(inputData);
            const command = request.command; // We'll use a 'command' parameter to route
            let result;

            // Dispatcher logic will be added here
            switch (command) {
                case 'get_database_info':
                    result = await handleGetDatabaseInfo(request);
                    break;
                // case 'list_organisms':
                //     result = await handleListOrganisms(request);
                //     break;
                // Search Tools
                case 'search_pathways':
                    result = await handleSearchPathways(request);
                    break;
                case 'search_genes':
                    result = await handleSearchGenes(request);
                    break;
                case 'search_compounds':
                    result = await handleSearchCompounds(request);
                    break;
                case 'search_reactions':
                    result = await handleSearchReactions(request);
                    break;
                case 'search_enzymes':
                    result = await handleSearchEnzymes(request);
                    break;
                case 'search_diseases':
                    result = await handleSearchDiseases(request);
                    break;
                case 'search_drugs':
                    result = await handleSearchDrugs(request);
                    break;
                case 'search_modules':
                    result = await handleSearchModules(request);
                    break;
                case 'search_ko_entries':
                    result = await handleSearchKoEntries(request);
                    break;
                case 'search_glycans':
                    result = await handleSearchGlycans(request);
                    break;
                case 'search_brite':
                    result = await handleSearchBrite(request);
                    break;
                // Get Info Tools
                case 'get_pathway_info':
                case 'get_gene_info':
                case 'get_compound_info':
                case 'get_reaction_info':
                case 'get_enzyme_info':
                case 'get_disease_info':
                case 'get_drug_info':
                case 'get_module_info':
                case 'get_ko_info':
                case 'get_glycan_info':
                    result = await getInfoHandlers[command](request);
                    break;
                case 'get_brite_info':
                    result = await handleGetBriteInfo(request);
                    break;
                case 'get_drug_interactions':
                    result = await handleGetDrugInteractions(request);
                    break;
                // Advanced Tools
                case 'get_pathway_genes':
                    result = await handleGetPathwayGenes(request);
                    break;
                case 'get_pathway_compounds':
                    result = await handleGetPathwayCompounds(request);
                    break;
                case 'get_pathway_reactions':
                    result = await handleGetPathwayReactions(request);
                    break;
                case 'get_compound_reactions':
                    result = await handleGetCompoundReactions(request);
                    break;
                case 'get_gene_orthologs':
                    result = await handleGetGeneOrthologs(request);
                    break;
                case 'convert_identifiers':
                    result = await handleConvertIdentifiers(request);
                    break;
                case 'find_related_entries':
                    result = await handleFindRelatedEntries(request);
                    break;
                case 'batch_entry_lookup':
                    result = await handleBatchEntryLookup(request);
                    break;
                default:
                    // If no command is provided, or command is unknown, throw an error.
                    if (!command) {
                        throw new Error("No 'command' parameter provided in the input JSON.");
                    }
                    throw new Error(`Unknown command: ${command}`);
            }

            const response = {
                status: "success",
                result: result
            };
            console.log(JSON.stringify(response, null, 2));

        } catch (error) {
            const errorResponse = {
                status: "failed",
                message: error.message,
                stack: error.stack
            };
            // Use console.error for logging to avoid polluting stdout for the host
            console.error(JSON.stringify(errorResponse, null, 2));
            // Also send a structured error via stdout for the host to parse
            console.log(JSON.stringify(errorResponse));
        }
    });
}

main().catch(error => {
    const errorResponse = {
        status: "failed",
        message: `Unhandled error in main: ${error.message}`,
        stack: error.stack
    };
    console.error(JSON.stringify(errorResponse, null, 2));
    console.log(JSON.stringify(errorResponse));
});
