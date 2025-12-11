import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const SERP_API_KEY = process.env.SERP_API_KEY;

if (!SERP_API_KEY) {
  console.warn(
    "⚠️  SERP_API_KEY not found in environment variables. Google Scholar features will not work."
  );
}

/**
 * Search Semantic Scholar for publications by author name (fallback)
 * @param {string} authorName - Author name to search for
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Array of publication objects
 */
async function searchSemanticScholar(authorName, limit = 10) {
  try {
    // First, search for the author
    const authorSearchResponse = await axios.get(
      "https://api.semanticscholar.org/graph/v1/author/search",
      {
        params: {
          query: authorName,
          limit: 5, // Get top 5 matching authors
          fields: "authorId,name",
        },
        timeout: 10000,
      }
    );

    const authors = authorSearchResponse.data?.data || [];
    if (authors.length === 0) {
      return [];
    }

    // Use the first matching author (most relevant)
    const authorId = authors[0].authorId;

    // Get publications for this author
    const publicationsResponse = await axios.get(
      `https://api.semanticscholar.org/graph/v1/author/${authorId}/papers`,
      {
        params: {
          fields: "title,url,abstract,year,citationCount,authors,venue",
          limit: limit,
          sort: "citationCount:desc", // Sort by citations
        },
        timeout: 10000,
      }
    );

    const papers = publicationsResponse.data?.data || [];

    return papers.map((paper) => ({
      title: paper.title || "Untitled",
      link: paper.url || null,
      snippet: paper.abstract || "", // Use abstract as snippet
      abstract: paper.abstract || "", // Also store as abstract for full text
      authors: paper.authors?.map((a) => a.name) || [],
      publication: paper.venue || "",
      year: paper.year || null,
      citations: paper.citationCount || 0,
      pdfLink: null, // Semantic Scholar doesn't provide direct PDF links in this endpoint
    }));
  } catch (error) {
    console.error("Error searching Semantic Scholar:", error.message);
    return [];
  }
}

/**
 * Search Google Scholar for publications by a specific researcher
 * @param {Object} params - Search parameters
 * @param {string} params.author - Author name to search for
 * @param {number} params.num - Number of results (1-20, default 10)
 * @returns {Promise<Array>} Array of publication objects
 */
export async function searchGoogleScholarPublications({
  author = "",
  num = 10,
} = {}) {
  if (!author || !author.trim()) {
    return [];
  }

  let publications = [];

  // Try SerpAPI Google Scholar first
  if (SERP_API_KEY) {
    try {
      const response = await axios.get("https://serpapi.com/search", {
        params: {
          engine: "google_scholar",
          q: `author:"${author}"`,
          api_key: SERP_API_KEY,
          num: Math.min(Math.max(1, num), 20), // Clamp between 1 and 20
          hl: "en", // Language: English
        },
        timeout: 15000,
      });

      const organicResults = response.data?.organic_results || [];

      publications = organicResults.map((result) => {
        const publication = {
          title: result.title || "Untitled",
          link: result.link || null,
          snippet: result.snippet || "",
          abstract: result.snippet || "", // Use snippet as abstract (Google Scholar snippets are often full abstracts)
          authors: result.publication_info?.authors || [],
          publication: result.publication_info?.summary || "",
          year: result.publication_info?.year || null,
          citations: result.inline_links?.cited_by?.total || 0,
          pdfLink: result.inline_links?.cited_by?.serpapi_scholar_link || null,
        };

        // Extract year from snippet if not in publication_info
        if (!publication.year && publication.snippet) {
          const yearMatch = publication.snippet.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            publication.year = parseInt(yearMatch[0]);
          }
        }

        return publication;
      });
    } catch (error) {
      console.error(
        "Error searching Google Scholar via SerpAPI:",
        error.message
      );
      // Continue to fallback
    }
  }

  // Fallback to Semantic Scholar if no results from Google Scholar
  if (publications.length === 0) {
    console.log(
      `No results from Google Scholar for "${author}", trying Semantic Scholar...`
    );
    try {
      const semanticResults = await searchSemanticScholar(author, num);
      if (semanticResults.length > 0) {
        console.log(
          `Found ${semanticResults.length} publications from Semantic Scholar`
        );
        return semanticResults;
      }
    } catch (error) {
      console.error("Error with Semantic Scholar fallback:", error.message);
    }
  }

  return publications;
}

/**
 * Search Google Scholar for a general query (not author-specific)
 * @param {Object} params - Search parameters
 * @param {string} params.q - Search query
 * @param {number} params.num - Number of results (1-20, default 10)
 * @returns {Promise<Array>} Array of publication objects
 */
export async function searchGoogleScholar({ q = "", num = 10 } = {}) {
  if (!SERP_API_KEY) {
    console.error("SERP_API_KEY is not configured");
    return [];
  }

  if (!q || !q.trim()) {
    return [];
  }

  try {
    const response = await axios.get("https://serpapi.com/search", {
      params: {
        engine: "google_scholar",
        q: q.trim(),
        api_key: SERP_API_KEY,
        num: Math.min(Math.max(1, num), 20),
        hl: "en",
      },
      timeout: 15000,
    });

    const organicResults = response.data?.organic_results || [];

    return organicResults.map((result) => {
      return {
        title: result.title || "Untitled",
        link: result.link || null,
        snippet: result.snippet || "",
        abstract: result.snippet || "", // Use snippet as abstract (Google Scholar snippets are often full abstracts)
        authors: result.publication_info?.authors || [],
        publication: result.publication_info?.summary || "",
        year: result.publication_info?.year || null,
        citations: result.inline_links?.cited_by?.total || 0,
        pdfLink: result.inline_links?.cited_by?.serpapi_scholar_link || null,
      };
    });
  } catch (error) {
    console.error("Error searching Google Scholar:", error.message);
    return [];
  }
}
