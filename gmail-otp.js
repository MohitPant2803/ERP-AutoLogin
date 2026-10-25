/**
 * Gmail API & Google OAuth module for IIT KGP ERP 1-Click Login.
 * Direct architectural parity with metakgp/iitkgp-erp-login-pypi.
 */

const GmailOtp = {
  SUBJECT: 'OTP for Sign In in ERP Portal of IIT Kharagpur',
  GMAIL_API_BASE: 'https://gmail.googleapis.com/gmail/v1/users/me',
  TOKEN_ENDPOINT: 'https://oauth2.googleapis.com/token',
  AUTH_ENDPOINT: 'https://accounts.google.com/o/oauth2/v2/auth',
  SCOPE: 'https://www.googleapis.com/auth/gmail.readonly',

  /**
   * Returns the OAuth redirect URL for this extension
   */
  getRedirectUrl() {
    if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.getRedirectURL) {
      return chrome.identity.getRedirectURL();
    }
    return `https://${chrome.runtime.id}.chromiumapp.org/`;
  },

  /**
   * Retrieves or refreshes a valid Gmail OAuth access token.
   */
  async getValidAccessToken() {
    const res = await chrome.storage.local.get(['googleOAuth']);
    const auth = res.googleOAuth;
    if (!auth) return null;

    const now = Date.now();
    // If token exists and is valid for at least another 60 seconds
    if (auth.accessToken && auth.expiresAt && auth.expiresAt > now + 60000) {
      return auth.accessToken;
    }

    // Try refreshing if refresh_token is available
    if (auth.refreshToken && auth.clientId) {
      try {
        console.log('[GmailOtp] Refreshing expired access token...');
        const params = new URLSearchParams({
          client_id: auth.clientId,
          grant_type: 'refresh_token',
          refresh_token: auth.refreshToken
        });
        if (auth.clientSecret) {
          params.append('client_secret', auth.clientSecret);
        }

        const r = await fetch(this.TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        });

        if (r.ok) {
          const data = await r.json();
          auth.accessToken = data.access_token;
          auth.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
          await chrome.storage.local.set({ googleOAuth: auth });
          console.log('[GmailOtp] Access token refreshed successfully.');
          return auth.accessToken;
        }
      } catch (err) {
        console.error('[GmailOtp] Failed to refresh access token:', err);
      }
    }

    return auth.accessToken || null;
  },

  /**
   * Fetches the ID of the latest ERP message currently in the inbox.
   * Matches getMailID(service) in metakgp/iitkgp-erp-login-pypi/read_mail.py.
   * Used to establish a baseline before requesting a new OTP.
   */
  async getLatestMessageId() {
    const token = await this.getValidAccessToken();
    if (!token) return null;

    try {
      const query = encodeURIComponent(`subject:"${this.SUBJECT}"`);
      const res = await fetch(`${this.GMAIL_API_BASE}/messages?q=${query}&maxResults=1`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          return data.messages[0].id;
        }
      }
    } catch (err) {
      console.warn('[GmailOtp] Error fetching baseline message ID:', err);
    }
    return null;
  },

  /**
   * Initiates Google OAuth2 web authorization flow
   */
  async startAuthFlow(clientId, clientSecret = '') {
    if (!clientId) {
      throw new Error('Google OAuth Client ID is required');
    }

    const redirectUri = this.getRedirectUrl();
    console.log('[GmailOtp] Starting OAuth with redirect_uri:', redirectUri);

    const authUrl = new URL(this.AUTH_ENDPOINT);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', this.SCOPE);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl.toString(),
          interactive: true
        },
        async (redirectResponseUrl) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!redirectResponseUrl) {
            return reject(new Error('Authorization was cancelled or failed'));
          }

          try {
            const parsedUrl = new URL(redirectResponseUrl);
            const code = parsedUrl.searchParams.get('code');
            const error = parsedUrl.searchParams.get('error');

            if (error) {
              return reject(new Error(`OAuth Error: ${error}`));
            }
            if (!code) {
              return reject(new Error('No authorization code found in response'));
            }

            // Exchange authorization code for tokens
            const tokenParams = new URLSearchParams({
              code: code,
              client_id: clientId,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code'
            });
            if (clientSecret) {
              tokenParams.append('client_secret', clientSecret);
            }

            const tokenRes = await fetch(this.TOKEN_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: tokenParams.toString()
            });

            if (!tokenRes.ok) {
              const errText = await tokenRes.text();
              throw new Error(`Token exchange failed: ${errText}`);
            }

            const tokenData = await tokenRes.json();
            const googleOAuth = {
              clientId: clientId,
              clientSecret: clientSecret,
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token || '',
              expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
              enabled: true
            };

            // Get user email
            try {
              const profileRes = await fetch(`${this.GMAIL_API_BASE}/profile`, {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
              });
              if (profileRes.ok) {
                const profile = await profileRes.json();
                googleOAuth.email = profile.emailAddress;
              }
            } catch {}

            await chrome.storage.local.set({ googleOAuth });
            resolve(googleOAuth);
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  },

  /**
   * Imports existing credentials.json or token.json (from iitkgp-erp-login-pypi)
   */
  async importJsonCredentials(jsonObj) {
    if (!jsonObj) throw new Error('Empty JSON object');

    let googleOAuth = {};

    // Format A: token.json from python InstalledAppFlow
    if (jsonObj.token || jsonObj.access_token) {
      googleOAuth = {
        accessToken: jsonObj.token || jsonObj.access_token,
        refreshToken: jsonObj.refresh_token || '',
        clientId: jsonObj.client_id || '',
        clientSecret: jsonObj.client_secret || '',
        expiresAt: jsonObj.expiry ? new Date(jsonObj.expiry).getTime() : Date.now() + 3600000,
        enabled: true
      };
    }
    // Format B: credentials.json (client secret file)
    else if (jsonObj.installed || jsonObj.web) {
      const clientObj = jsonObj.installed || jsonObj.web;
      googleOAuth = {
        clientId: clientObj.client_id,
        clientSecret: clientObj.client_secret,
        enabled: true
      };
    } else {
      throw new Error('Unrecognized JSON format. Expected token.json or credentials.json.');
    }

    // Verify token or fetch email if access token is present
    if (googleOAuth.accessToken) {
      try {
        const profileRes = await fetch(`${this.GMAIL_API_BASE}/profile`, {
          headers: { Authorization: `Bearer ${googleOAuth.accessToken}` }
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          googleOAuth.email = profile.emailAddress;
        }
      } catch {}
    }

    await chrome.storage.local.set({ googleOAuth });
    return googleOAuth;
  },

  /**
   * Queries Gmail API for the NEW OTP email that arrived AFTER baselineMessageId was recorded.
   * Directly replicates getOTP loop from metakgp/iitkgp-erp-login-pypi/read_mail.py.
   */
  async fetchLatestOtp(baselineMessageId = null) {
    const token = await this.getValidAccessToken();
    if (!token) return null;

    try {
      const query = encodeURIComponent(`subject:"${this.SUBJECT}"`);
      const listRes = await fetch(`${this.GMAIL_API_BASE}/messages?q=${query}&maxResults=1`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!listRes.ok) {
        return null;
      }

      const listData = await listRes.json();
      const messages = listData.messages || [];
      if (messages.length === 0) return null;

      const latestMsgId = messages[0].id;

      // CRITICAL: If a baseline message existed before the OTP was triggered,
      // wait until a NEW message arrives with a DIFFERENT message ID!
      if (baselineMessageId && latestMsgId === baselineMessageId) {
        // The newly requested OTP has not arrived in Gmail yet
        return null;
      }

      // Fetch the new message
      const msgRes = await fetch(`${this.GMAIL_API_BASE}/messages/${latestMsgId}?format=full`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!msgRes.ok) return null;
      const msgData = await msgRes.json();

      // Extract body text
      let textContent = msgData.snippet || '';

      const extractParts = (payload) => {
        if (!payload) return;
        if (payload.body && payload.body.data) {
          try {
            const b64 = payload.body.data.replace(/-/g, '+').replace(/_/g, '/');
            textContent += ' ' + decodeURIComponent(escape(atob(b64)));
          } catch {}
        }
        if (payload.parts && Array.isArray(payload.parts)) {
          payload.parts.forEach(extractParts);
        }
      };

      extractParts(msgData.payload);

      // Extract 6-digit OTP code (prioritize "is 123456" or "OTP: 123456")
      const explicitMatch = textContent.match(/(?:OTP|password|code|is)[\s\:\-is]+(\d{6})\b/i);
      if (explicitMatch && explicitMatch[1]) {
        console.log(`[GmailOtp] Extracted fresh OTP: ${explicitMatch[1]} (Message ID: ${latestMsgId})`);
        return explicitMatch[1];
      }

      const allDigits = textContent.match(/\b\d{6}\b/g);
      if (allDigits && allDigits.length > 0) {
        const code = allDigits[allDigits.length - 1];
        console.log(`[GmailOtp] Extracted fresh OTP (regex): ${code} (Message ID: ${latestMsgId})`);
        return code;
      }

      return null;
    } catch (err) {
      console.error('[GmailOtp] Error fetching from Gmail API:', err);
      return null;
    }
  },

  /**
   * Tests Gmail API connection and returns account information
   */
  async testConnection() {
    const token = await this.getValidAccessToken();
    if (!token) {
      throw new Error('No valid Google OAuth token available. Please sign in or import credentials.');
    }

    const profileRes = await fetch(`${this.GMAIL_API_BASE}/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!profileRes.ok) {
      throw new Error(`Gmail API returned status ${profileRes.status}. Token may be invalid or expired.`);
    }

    const profile = await profileRes.json();
    const query = encodeURIComponent(`subject:"${this.SUBJECT}"`);
    const listRes = await fetch(`${this.GMAIL_API_BASE}/messages?q=${query}&maxResults=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const listData = listRes.ok ? await listRes.json() : {};

    return {
      success: true,
      email: profile.emailAddress,
      totalMessages: profile.messagesTotal,
      recentErpMessagesFound: listData.resultSizeEstimate || (listData.messages ? listData.messages.length : 0)
    };
  }
};

if (typeof window !== 'undefined') {
  window.GmailOtp = GmailOtp;
}
if (typeof globalThis !== 'undefined') {
  globalThis.GmailOtp = GmailOtp;
}
