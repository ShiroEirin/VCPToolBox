const { getJson } = require("serpapi");

// Google 搜索引擎模块
async function search(parameters, apiKey) {
    const { q, query, text, location, hl, gl } = parameters;
    const searchQuery = q || query || text;

    if (!searchQuery) {
        return { success: false, error: "Missing search query parameter. Please use 'q', 'query', or 'text'." };
    }

    const searchParams = {
        engine: "google",
        q: searchQuery,
        api_key: apiKey
    };

    if (location) searchParams.location = location;
    if (hl) searchParams.hl = hl;
    if (gl) searchParams.gl = gl;
    
    searchParams.google_domain = "google.com";

    return new Promise((resolve) => {
        getJson(searchParams, (json) => {
            if (json.error) {
                resolve({ success: false, error: `SerpApi Error: ${json.error}` });
            } else {
                const answerBox = json.answer_box ? `Answer Box: ${JSON.stringify(json.answer_box)}\n` : '';
                const organicResults = json.organic_results.map(r => `Title: ${r.title}\nLink: ${r.link}\nSnippet: ${r.snippet}`).join('\n\n');
                const formattedResult = `${answerBox}--- Organic Results ---\n${organicResults}`;
                resolve({ success: true, data: formattedResult });
            }
        });
    });
}

module.exports = {
    search
};