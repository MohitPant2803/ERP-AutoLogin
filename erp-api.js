/**
 * Core ERP API Client for IIT Kharagpur ERP (erp.iitkgp.ac.in)
 * Implements full protocol parity with modern IIT KGP ERP portal.
 */

const ErpApi = {
  HOMEPAGE_URL: 'https://erp.iitkgp.ac.in/IIT_ERP3/',
  WELCOMEPAGE_URL: 'https://erp.iitkgp.ac.in/IIT_ERP3/welcome.jsp',
  LOGIN_URL: 'https://erp.iitkgp.ac.in/SSOAdministration/auth.htm',
  CLEAR_ALL_SESSIONS_URL: 'https://erp.iitkgp.ac.in/SSOAdministration/clearAllSessions.htm',
  SECRET_QUESTION_URL: 'https://erp.iitkgp.ac.in/SSOAdministration/getSecurityQues.htm',
  OTP_URL: 'https://erp.iitkgp.ac.in/SSOAdministration/getEmilOTP.htm',
  LOGOUT_URL: 'https://erp.iitkgp.ac.in/IIT_ERP3/logout.htm',

  // Known ERP Response substrings
  RESPONSES: {
    ANSWER_MISMATCH: "Unable to send OTP due to security question's answare mismatch",
    PASSWORD_MISMATCH: "Unable to send OTP due to password mismatch",
    OTP_SENT: "An OTP(valid for a short time) has been sent",
    OTP_MISMATCH: "ERROR:Email OTP mismatch",
    SESSION_ACTIVE: "previous session is still active"
  },

  /**
   * Helper to normalize question strings for resilient matching
   */
  normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[\?\.\,\s\-_'"]/g, '')
      .trim();
  },

  /**
   * Checks whether the current browser session is alive on ERP.
   */
  async checkSessionAlive() {
    try {
      // 1. If in Chrome extension environment, check if ssoToken cookie is present
      if (typeof chrome !== 'undefined' && chrome.cookies) {
        try {
          const ssoCookie = await chrome.cookies.get({ url: 'https://erp.iitkgp.ac.in', name: 'ssoToken' });
          if (!ssoCookie || !ssoCookie.value) {
            return false;
          }
        } catch {}
      }

      const res = await fetch(this.WELCOMEPAGE_URL, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-cache'
      });

      // When logged in, welcome.jsp often returns 404 or redirects
      if (res.status === 404) {
        return true;
      }

      const text = await res.text();

      // If page mentions Login or has user_id input, user is not logged in
      if (text.includes('IIT KGP ERP Login') ||
          text.includes('user_id') ||
          text.includes('loginForm') ||
          text.includes('getSecurityQues') ||
          text.includes('Sign In')) {
        return false;
      }

      // If page mentions Dashboard or Logout, user is logged in
      if (text.includes('logout') || text.includes('Log Out') || text.includes('ssoToken')) {
        return true;
      }

      return false;
    } catch (err) {
      console.warn('Session alive check failed:', err);
      return false;
    }
  },

  /**
   * Fetches the ERP homepage to retrieve sessionToken.
   * On modern ERP, sessionToken is passed in the redirected URL query string (?sessionToken=...),
   * in the JSESSIONID cookie, or as empty string.
   */
  async getSessionToken() {
    try {
      // 1. Check if running in a browser page that already has sessionToken in query string
      if (typeof window !== 'undefined' && window.location) {
        try {
          const pageToken = new URLSearchParams(window.location.search).get('sessionToken');
          if (pageToken && pageToken.trim()) return pageToken.trim();
        } catch {}
        const pageInput = document.getElementById('sessionToken');
        if (pageInput && pageInput.value && pageInput.value.trim()) {
          return pageInput.value.trim();
        }
      }

      // 2. Fetch ERP homepage
      const res = await fetch(this.HOMEPAGE_URL, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-cache',
        redirect: 'follow'
      });

      // Check if redirected URL contains sessionToken (e.g. ?sessionToken=41733EB1245D722331D3236CEB475841.node7)
      if (res.url) {
        try {
          const urlObj = new URL(res.url);
          const urlToken = urlObj.searchParams.get('sessionToken');
          if (urlToken && urlToken.trim()) {
            return urlToken.trim();
          }
        } catch {}

        const matchQuery = res.url.match(/[?&]sessionToken=([^&#]+)/i);
        if (matchQuery && matchQuery[1]) {
          return decodeURIComponent(matchQuery[1]).trim();
        }
      }

      // 3. Check HTML body for input tag or JS variable
      const html = await res.text();
      const match = html.match(/id=["']sessionToken["'][^>]*value=["']([^"']+)["']/i) ||
                    html.match(/value=["']([^"']+)["'][^>]*id=["']sessionToken["']/i) ||
                    html.match(/name=["']sessionToken["'][^>]*value=["']([^"']+)["']/i) ||
                    html.match(/sessionToken\s*=\s*["']([^"']+)["']/i);

      if (match && match[1] && match[1].trim()) {
        return match[1].trim();
      }

      // 4. Check JSESSIONID cookie if chrome.cookies API is available
      if (typeof chrome !== 'undefined' && chrome.cookies) {
        try {
          const cookie = await chrome.cookies.get({ url: 'https://erp.iitkgp.ac.in', name: 'JSESSIONID' });
          if (cookie && cookie.value && cookie.value.trim()) {
            return cookie.value.trim();
          }
        } catch {}
      }

      // 5. Default fallback: On modern ERP, sessionToken can be empty string (associated via cookie)
      return '';
    } catch (err) {
      console.warn('Could not fetch sessionToken, falling back to empty string:', err);
      return '';
    }
  },

  /**
   * Fetches the active security question for a given roll number.
   */
  async getSecurityQuestion(rollNumber) {
    if (!rollNumber) {
      throw new Error('Roll number is required');
    }
    const cleanRoll = rollNumber.trim().toUpperCase();
    const res = await fetch(this.SECRET_QUESTION_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `user_id=${encodeURIComponent(cleanRoll)}`
    });

    const text = (await res.text()).trim();
    if (text === 'FALSE' || text === '') {
      throw new Error('Invalid Roll Number or security question not found on ERP');
    }
    return text;
  },

  /**
   * Repeatedly queries getSecurityQues.htm to discover all 3 unique questions.
   */
  async fetchAllQuestions(rollNumber, onProgress = null, maxAttempts = 18) {
    const questionsSet = new Set();
    const cleanRoll = rollNumber.trim().toUpperCase();

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const q = await this.getSecurityQuestion(cleanRoll);
        if (q && q !== 'FALSE') {
          questionsSet.add(q);
          if (onProgress) {
            onProgress(Array.from(questionsSet));
          }
          if (questionsSet.size >= 3) {
            break;
          }
        }
      } catch (err) {
        if (i === 0) throw err;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    return Array.from(questionsSet);
  },

  /**
   * Matches an ERP security question with the student's saved questions/answers.
   */
  matchAnswer(currentQuestion, qaPairs) {
    if (!currentQuestion || !qaPairs || !qaPairs.length) {
      return null;
    }

    const normCurrent = this.normalizeText(currentQuestion);

    // 1. Exact or normalized match
    for (const pair of qaPairs) {
      if (this.normalizeText(pair.question) === normCurrent) {
        return pair.answer;
      }
    }

    // 2. Substring or fuzzy contains match
    for (const pair of qaPairs) {
      const normSaved = this.normalizeText(pair.question);
      if (normCurrent.includes(normSaved) || normSaved.includes(normCurrent)) {
        return pair.answer;
      }
    }

    return null;
  },

  /**
   * Requests ERP to send OTP to student's registered email address.
   */
  async requestOTP(rollNumber, password, answer, sessionToken = '') {
    const cleanRoll = rollNumber.trim().toUpperCase();
    const body = new URLSearchParams({
      user_id: cleanRoll,
      password: password,
      answer: answer,
      typeee: 'SI',
      sessionToken: sessionToken || '',
      requestedUrl: this.HOMEPAGE_URL
    });

    const res = await fetch(this.OTP_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const resText = await res.text();
    let json = null;
    try {
      json = JSON.parse(resText);
    } catch {}

    const msg = (json && json.msg) ? json.msg : resText;

    if (msg.includes(this.RESPONSES.ANSWER_MISMATCH)) {
      throw new Error("Invalid Security Question Answer! Please check your saved answers.");
    }
    if (msg.includes(this.RESPONSES.PASSWORD_MISMATCH)) {
      throw new Error("Invalid ERP Password! Please check your credentials.");
    }
    if (msg.includes(this.RESPONSES.OTP_SENT) || (json && json.status === 'success') || res.ok) {
      return { success: true, message: msg };
    }

    throw new Error(`Failed to request OTP: ${msg}`);
  },

  /**
   * Clears any lingering/active ERP sessions for this roll number.
   */
  async clearAllSessions(rollNumber) {
    const cleanRoll = rollNumber.trim().toUpperCase();
    try {
      const res = await fetch(this.CLEAR_ALL_SESSIONS_URL, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `user_code=${encodeURIComponent(cleanRoll)}`
      });
      return res.ok;
    } catch (err) {
      console.warn('Failed to clear sessions:', err);
      return false;
    }
  },

  /**
   * Submits credentials and email OTP to complete login and generate ssoToken.
   */
  async signIn(rollNumber, password, answer, otp, sessionToken = '', retryOnActiveSession = true) {
    const cleanRoll = rollNumber.trim().toUpperCase();
    const cleanOtp = (otp || '').trim();

    const body = new URLSearchParams({
      user_id: cleanRoll,
      password: password,
      answer: answer,
      typeee: 'SI',
      sessionToken: sessionToken || '',
      requestedUrl: this.HOMEPAGE_URL,
      email_otp: cleanOtp
    });

    const res = await fetch(this.LOGIN_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString(),
      redirect: 'follow'
    });

    const resText = await res.text();

    // Check for OTP mismatch
    if (resText.includes(this.RESPONSES.OTP_MISMATCH)) {
      throw new Error("Invalid OTP! The OTP entered did not match.");
    }

    // Check for active session error
    if (resText.toLowerCase().includes(this.RESPONSES.SESSION_ACTIVE)) {
      if (retryOnActiveSession) {
        console.log('ERP reported previous session is active. Clearing sessions and retrying...');
        await this.clearAllSessions(cleanRoll);
        await new Promise(r => setTimeout(r, 600));
        return this.signIn(cleanRoll, password, answer, otp, sessionToken, false);
      } else {
        throw new Error("Previous ERP session is still active. Please try again in a moment.");
      }
    }

    // Check if redirect contains ssoToken
    let ssoToken = null;
    const urlMatch = (res.url || '').match(/[?&]ssoToken=([^&#]+)/);
    if (urlMatch && urlMatch[1]) {
      ssoToken = urlMatch[1];
    } else {
      const textMatch = resText.match(/ssoToken=([a-zA-Z0-9_\-\.]+)/i);
      if (textMatch && textMatch[1]) {
        ssoToken = textMatch[1];
      }
    }

    if (ssoToken) {
      return {
        success: true,
        ssoToken: ssoToken,
        targetUrl: `${this.HOMEPAGE_URL}?ssoToken=${ssoToken}`
      };
    }

    // If text mentions logout or dashboard, login succeeded
    if (resText.includes('logout') || resText.includes('IIT_ERP3') || res.status === 200) {
      return {
        success: true,
        ssoToken: null,
        targetUrl: this.HOMEPAGE_URL
      };
    }

    throw new Error("ERP login failed. Please check credentials and OTP.");
  },

  /**
   * Logs out from ERP.
   */
  async logout() {
    try {
      await fetch(this.LOGOUT_URL, {
        method: 'GET',
        credentials: 'include'
      });
      return true;
    } catch {
      return false;
    }
  }
};

if (typeof window !== 'undefined') {
  window.ErpApi = ErpApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ErpApi = ErpApi;
}
