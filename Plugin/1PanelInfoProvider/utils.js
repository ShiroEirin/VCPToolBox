const axios = require('axios');
const crypto = require('crypto');

// API版本配置：支持 'v1', 'v2', 或 'auto' (自动降级)
const API_VERSIONS = ['v2', 'v1']; // 优先尝试v2，失败后降级到v1
let currentApiVersion = process.env.PANEL_API_VERSION || 'auto'; // 默认自动模式
let panelHost = process.env.PANEL_HOST;
let apiKey = process.env.PANEL_API_KEY;

function md5Sum(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

function setApiKey(key) {
  apiKey = key;
}

function getApiKey() {
  return apiKey;
}

function setHost(host) {
  panelHost = host;
}

function getHost() {
  return panelHost;
}

function setApiVersion(version) {
  currentApiVersion = version;
}

function getApiVersion() {
  return currentApiVersion;
}

function getApiBaseUrl(version = null) {
  if (!panelHost) return '';
  const ver = version || (currentApiVersion === 'auto' ? 'v2' : currentApiVersion);
  // 移除panelHost末尾的斜杠，避免双斜杠问题
  const host = panelHost.replace(/\/+$/, '');
  return `${host}/api/${ver}`;
}

function getRandomStr(length) {
  const charset = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    result += charset[randomIndex];
  }
  return result;
}

class PanelClient {
  constructor(method, path, payload = null, query = null, headers = {}) {
    this.method = method.toUpperCase();
    this.path = path;
    this.payload = payload;
    this.query = query;
    this.baseHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': `panel-client Node.js/${process.platform}/${process.arch}/node-${process.version}`,
      ...headers,
    };}

  _buildUrl(version) {
    const baseUrl = getApiBaseUrl(version);
    if (!baseUrl) {
      throw new Error('Panel host is not set. Please set PANEL_HOST environment variable or call setHost().');
    }
    let url = `${baseUrl}${this.path}`;
    
    if (this.query) {
      const urlObj = new URL(url);
      Object.entries(this.query).forEach(([key, value]) => {
        urlObj.searchParams.set(key, String(value));
      });
      url = urlObj.toString();
    }
    return url;
  }

  async _doRequest(url) {
    const currentApiKey = getApiKey();
    if (!currentApiKey) {
      throw new PanelError(401, 'Unauthorized', 'Panel API key is missing or invalid. Please set PANEL_API_KEY environment variable or call setApiKey().');
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sign = md5Sum(`1panel${currentApiKey}${timestamp}`);

    const headers = {
      ...this.baseHeaders,
      '1Panel-Token': sign,
      '1Panel-Timestamp': timestamp,
    };
    
    const config = {
      method: this.method,
      url: url,
      headers: headers,
      data: this.payload,
      timeout: 30000, // 30 seconds timeout
    };

    const response = await axios(config);
    // Check for successful status codes (2xx, 304)
    if (response.status >= 200 && response.status < 300 || response.status === 304) {
      // 检查响应是否为HTML（安全入口拦截的情况）
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('text/html') || (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>'))) {
        throw new PanelError(403, 'Security Entry Blocked', 'Response is HTML, likely blocked by 1Panel security entry.');
      }
      return response.data !== undefined ? response.data : { message: "Operation completed successfully" };
    } else {
      throw new PanelError(response.status, response.statusText, response.data ? (response.data.message || JSON.stringify(response.data)) : 'No error details');
    }
  }

  async request() {
    const apiVersion = getApiVersion();
    
    // 如果指定了具体版本，直接使用
    if (apiVersion !== 'auto') {
      try {
        const url = this._buildUrl(apiVersion);
        return await this._doRequest(url);
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.response) {
            const { status, statusText, data } = error.response;
            const errorMessage = data && data.message ? data.message : (typeof data === 'string' ? data : statusText);
            throw new PanelError(status, statusText, errorMessage);
          } else if (error.request) {
            throw new PanelError(0, 'Network Error', 'Unable to connect to Panel API. No response received.');
          } else {
            throw new PanelError(0, 'Request Setup Error', error.message);
          }
        } else if (error instanceof PanelError) {
          throw error;
        } else {
          throw new PanelError(500, 'Internal Error', error.message);
        }
      }
    }
    
    // 自动模式：依次尝试各版本
    let lastError = null;
    for (const version of API_VERSIONS) {
      try {
        const url = this._buildUrl(version);
        const result = await this._doRequest(url);
        // 成功后记住这个版本（可选：下次直接用这个版本）
        return result;
      } catch (error) {
        lastError = error;
        // 如果是网络错误或认证错误，不再尝试其他版本
        if (error instanceof PanelError && (error.code === 0 || error.code === 401)) {
          break;
        }
        // 继续尝试下一个版本
        continue;
      }
    }
    
    // 所有版本都失败了
    if (lastError) {
      if (lastError instanceof PanelError) {
        throw lastError;
      } else if (axios.isAxiosError(lastError)) {
        if (lastError.response) {
          const { status, statusText, data } = lastError.response;
          const errorMessage = data && data.message ? data.message : (typeof data === 'string' ? data : statusText);
          throw new PanelError(status, statusText, errorMessage);
        } else if (lastError.request) {
          throw new PanelError(0, 'Network Error', 'Unable to connect to Panel API. No response received.');
        } else {
          throw new PanelError(0, 'Request Setup Error', lastError.message);
        }
      } else {
        throw new PanelError(500, 'Internal Error', lastError.message);
      }
    }
    
    throw new PanelError(500, 'Unknown Error', 'All API versions failed without specific error.');
  }
}

class PanelError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'PanelError';
    this.code = code;
    this.details = details;
    // Maintaining prototype chain
    Object.setPrototypeOf(this, PanelError.prototype);
  }

  toString() {
    return `Panel API error: ${this.message} (code: ${this.code})${this.details ? ` - ${this.details}` : ''}`;
  }
}

function newPanelClient(method, urlPath, payload = null, query = null, headers = {}) {
    // The Go version had options like WithPayload, WithQuery. 
    // In JS, it's more idiomatic to pass these as direct arguments or an options object.
    // For simplicity, we'll pass them directly here.
    return new PanelClient(method, urlPath, payload, query, headers);
}

module.exports = {
  setApiKey,
  getApiKey,
  setHost,
  getHost,
  setApiVersion,
  getApiVersion,
  getApiBaseUrl,
  getRandomStr,
  newPanelClient,
  PanelError,
  API_VERSIONS,
  // Exposing md5Sum if it's needed externally, though it's mainly internal for auth
  // md5Sum
};