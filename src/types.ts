/**
 * Custom data part mime types used for special markers.
 * These are used to communicate metadata through LanguageModelDataPart.
 */
export namespace DataPartMimeTypes {
  /**
   * Cache control marker for Anthropic prompt caching.
   * When a LanguageModelDataPart with this mimeType is encountered,
   * the previous content block will be marked with cache_control.
   * The data should be 'ephemeral' (as Uint8Array or string).
   */
  export const CacheControl = 'cache_control';

  /**
   * Stateful marker - reserved for internal use.
   */
  export const StatefulMarker = 'stateful_marker';

  /**
   * Thinking data marker - reserved for thinking block metadata.
   */
  export const ThinkingData = 'thinking';

  /**
   * Web search server tool use marker.
   * Contains JSON data about the web search query being executed.
   */
  export const WebSearchToolUse =
    'application/vnd.anthropic.web-search-tool-use+json';

  /**
   * Web search tool result marker.
   * Contains JSON data about the web search results.
   */
  export const WebSearchToolResult =
    'application/vnd.anthropic.web-search-tool-result+json';

  /**
   * Text with citations marker.
   * Contains JSON data about citations in text content.
   */
  export const TextCitations = 'application/vnd.anthropic.text-citations+json';
}

export interface ThinkingBlockMetadata {
  /**
   * Signature of the thinking block.
   *
   * VSCode use this.
   */
  signature?: string;

  /**
   * The thinking content (if any).
   *
   * VSCode use this.
   */
  redactedData?: string;

  /**
   * The complete thinking content (if available).
   *
   * VSCode use this.
   */
  _completeThinking?: string;
}

/**
 * `modelid\base64-encoded-raw-data`
 */
export type StatefulMarkerData = `${string}\\${string}`;

export interface PerformanceTrace {
  /**
   * Time to Start
   */
  tts: number;
  /**
   * Time to Fetch
   */
  ttf: number;
  /**
   * Time to First Token
   */
  ttft: number;
  /**
   * Tokens Per Second
   */
  tps: number;
  /**
   * Total Latency
   */
  tl: number;
}
