/**
 * Background Service Worker for IIT KGP ERP 1-Click Login.
 * Coordinates credentials, automated Gmail OTP extraction (Atom + Gmail API), session recovery, and login.
 */

importScripts('crypto-util.js', 'erp-api.js', 'gmail-otp.js');

let currentLoginJob = null;
let otpResolver = null;
let otpRejecter = null;
let activeOtpWatchTimer = null;
let tempMailTabId = null;
let recordedBaselineMessageId = null;

// Track active login progress for popup/content-script synchronization
const loginState = {
  inProgress: false,
  step: 'idle',
  message: '',
  timestamp: 0,
  otpWaitSecondsRemaining: 0
};

function updateLoginState(step, message) {
  loginState.step = step;
  loginState.message = message;
  loginState.inProgress = step !== 'idle' && step !== 'success' && step !== 'error';
  loginState.timestamp = Date.now();

  chrome.runtime.sendMessage({
    action: 'LOGIN_STATE_CHANGED',
    state: { ...loginState }
  }).catch(() => {});
}

/**
 * Extracts 6-digit OTP from Gmail Atom Feed XML string with timestamp guard
 */
function extractOtpFromAtomXml(xmlText, minTimestamp = 0) {
  if (!xmlText) return null;
  const entryMatches = xmlText.match(/<entry>[\s\S]*?<\/entry>/gi) || [];
  for (const entry of entryMatches) {
    if (entry.includes("OTP for Sign In") || entry.includes("IIT Kharagpur") || entry.includes("ERP")) {
      // Strictly ignore emails issued before this login request started
      if (minTimestamp > 0) {
        const dateMatch = entry.match(/<(?:issued|updated|modified)>([\s\S]*?)<\/(?:issued|updated|modified)>/i);
        if (dateMatch && dateMatch[1]) {
          const entryTime = Date.parse(dateMatch[1].trim());
          if (!isNaN(entryTime) && entryTime < minTimestamp - 5000) {
            console.log(`[Gmail Atom] Skipping stale entry from ${dateMatch[1]}`);
            continue;
          }
        }
      }

      const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/i);
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/i);
      const text = `${titleMatch ? titleMatch[1] : ''} ${summaryMatch ? summaryMatch[1] : ''}`;

      const otpMatch = text.match(/(?:OTP|password|code|is)[\s\:\-is]+(\d{6})\b/i) || text.match(/\b\d{6}\b/);
      if (otpMatch) {
        return otpMatch[1] || otpMatch[0];
      }
    }
  }
  return null;
}

/**
 * Polls Gmail Atom feeds across common profile indices (u/0, u/1, etc.)
 */
async function pollGmailAtomFeeds(preferredAccount = 0, minTimestamp = 0) {
  const feedUrls = [
    `https://mail.google.com/mail/u/${preferredAccount}/feed/atom`,
    'https://mail.google.com/mail/u/0/feed/atom',
    'https://mail.google.com/mail/u/1/feed/atom',
    'https://mail.google.com/mail/u/2/feed/atom',
    'https://mail.google.com/mail/feed/atom'
  ];

  const uniqueUrls = [...new Set(feedUrls)];

  for (const url of uniqueUrls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
      if (res.ok) {
        const xml = await res.text();
        const otp = extractOtpFromAtomXml(xml, minTimestamp);
        if (otp) {
          console.log(`[Gmail Atom] Extracted fresh OTP: ${otp} from ${url}`);
          return otp;
        }
      }
    } catch {}
  }
  return null;
}

let activeErpTabId = null;

/**
 * Broadcasts an OTP found event to all ERP tabs and runtime listeners
 */
function broadcastOtpFound(otp, source = 'automated-listener') {
  console.log(`[ERP 1-Click] OTP Found (${otp}) from ${source}`);

  if (activeOtpWatchTimer) {
    clearInterval(activeOtpWatchTimer);
    activeOtpWatchTimer = null;
  }

  // 1. Resolve pending background promise if active
  if (otpResolver) {
    otpResolver(otp);
  }

  // 2. Deliver directly to the active ERP tab if known
  if (activeErpTabId) {
    chrome.tabs.sendMessage(activeErpTabId, {
      action: 'OTP_FOUND',
      otp: otp,
      source: source
    }).catch(() => {});
  }

  // 3. Relay to all open tabs containing erp.iitkgp.ac.in (matches with or without port :443)
  chrome.tabs.query({}, (tabs) => {
    if (!tabs || !Array.isArray(tabs)) return;
    tabs.forEach((t) => {
      if (t.url && (t.url.includes('erp.iitkgp.ac.in') || t.url.includes('SSOAdministration') || t.url.includes('IIT_ERP3'))) {
        chrome.tabs.sendMessage(t.id, {
          action: 'OTP_FOUND',
          otp: otp,
          source: source
        }).catch(() => {});
      }
    });
  });

  // 4. Clean up any temporary Gmail tab created
  if (tempMailTabId) {
    chrome.tabs.remove(tempMailTabId).catch(() => {});
    tempMailTabId = null;
  }
}

/**
 * Starts automated multi-channel OTP extraction (Gmail API + Atom Feed + Mail tabs)
 */
function startAutonomousOtpWatcher(preferredAccount = 0, baselineMessageId = null) {
  if (activeOtpWatchTimer) {
    clearInterval(activeOtpWatchTimer);
  }

  const baselineId = baselineMessageId || recordedBaselineMessageId;
  console.log('[Background] Watching for new OTP email with baseline message ID:', baselineId);

  const startTime = Date.now();
  let elapsedSeconds = 0;
  const maxSeconds = 65;

  // 1. Notify any already open mail tabs
  chrome.tabs.query({ url: ['*://mail.google.com/*', '*://*.iitkgpmail.iitkgp.ac.in/*', '*://iitkgpmail.iitkgp.ac.in/*'] }, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'START_OTP_WATCH',
        timestamp: startTime
      }).catch(() => {});
    });
  });

  // 2. Continuous poller
  activeOtpWatchTimer = setInterval(async () => {
    elapsedSeconds += 1.5;

    // Check if Google OAuth is configured and active
    let hasOAuth = false;
    try {
      const token = await GmailOtp.getValidAccessToken();
      hasOAuth = !!token;
    } catch {}

    if (hasOAuth) {
      // A. Primary: Check Gmail API (Google OAuth) - strictly requiring a new message ID (matches metakgp)
      try {
        const apiOtp = await GmailOtp.fetchLatestOtp(baselineId);
        if (apiOtp) {
          broadcastOtpFound(apiOtp, 'gmail-api-oauth');
          return;
        }
      } catch (e) {
        console.warn('[Background] Gmail API check error:', e);
      }
    } else {
      // B. Fallback: Check Gmail Atom Feeds with strict timestamp checking
      const atomOtp = await pollGmailAtomFeeds(preferredAccount, startTime);
      if (atomOtp) {
        broadcastOtpFound(atomOtp, 'gmail-atom-feed');
        return;
      }

      // C. After 5 seconds, open quiet background search tab if no mail tab is open
      if (elapsedSeconds >= 5 && !tempMailTabId) {
        chrome.tabs.query({ url: '*://mail.google.com/*' }, (existingTabs) => {
          if (!existingTabs || existingTabs.length === 0) {
            const searchUrl = `https://mail.google.com/mail/u/${preferredAccount}/#search/subject%3A%22OTP+for+Sign+In+in+ERP+Portal+of+IIT+Kharagpur%22`;
            chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
              tempMailTabId = tab.id;
            });
          }
        });
      }
    }

    // D. Check local python helper server if enabled
    chrome.storage.local.get(['otpSettings'], async (res) => {
      const settings = res.otpSettings || {};
      if (settings.useLocalServer && settings.localServerUrl) {
        try {
          const r = await fetch(settings.localServerUrl, { cache: 'no-store' });
          if (r.ok) {
            const data = await r.json();
            if (data && data.otp && /^\d{6}$/.test(String(data.otp).trim())) {
              broadcastOtpFound(String(data.otp).trim(), 'local-helper');
            }
          }
        } catch {}
      }
    });

    if (elapsedSeconds >= maxSeconds) {
      clearInterval(activeOtpWatchTimer);
      activeOtpWatchTimer = null;
      if (tempMailTabId) {
        chrome.tabs.remove(tempMailTabId).catch(() => {});
        tempMailTabId = null;
      }
    }
  }, 1500);
}

/**
 * Headless 1-Click Login from Background
 */
async function performOneClickLogin(pin = null) {
  if (loginState.inProgress) {
    return { success: false, message: 'Login is already in progress' };
  }

  try {
    updateLoginState('checking_session', 'Checking existing ERP session...');

    const stored = await chrome.storage.local.get(['authCredentials', 'otpSettings', 'googleOAuth']);
    const creds = stored.authCredentials;

    if (!creds || !creds.rollNumber || !creds.password) {
      updateLoginState('error', 'Credentials not configured! Please open extension options.');
      return { success: false, message: 'Credentials not configured' };
    }

    let password = creds.password;
    let qaPairs = creds.qaPairs || [];

    if (creds.requirePin) {
      if (!pin) {
        updateLoginState('error', 'PIN required to decrypt credentials');
        return { success: false, requirePin: true, message: 'PIN required' };
      }
      try {
        password = await CryptoUtil.decrypt(creds.password, pin);
        qaPairs = await Promise.all(
          qaPairs.map(async (pair) => ({
            question: pair.question,
            answer: await CryptoUtil.decrypt(pair.answer, pin)
          }))
        );
      } catch (err) {
        updateLoginState('error', 'Invalid PIN! Decryption failed.');
        return { success: false, message: 'Invalid PIN' };
      }
    }

    // Check if session is alive
    const isAlive = await ErpApi.checkSessionAlive();
    if (isAlive) {
      updateLoginState('success', 'Session already active! Opening ERP...');
      await openErpTab(ErpApi.HOMEPAGE_URL);
      return { success: true, message: 'Already logged in' };
    }

    // Obtain session token
    updateLoginState('session_token', 'Acquiring session token...');
    const sessionToken = await ErpApi.getSessionToken();

    // Fetch security question
    updateLoginState('security_question', 'Fetching security question...');
    const currentQuestion = await ErpApi.getSecurityQuestion(creds.rollNumber);

    const matchedAnswer = ErpApi.matchAnswer(currentQuestion, qaPairs);
    if (!matchedAnswer) {
      throw new Error(`Could not find answer for question: "${currentQuestion}". Please update your security answers.`);
    }

    // 1. Record baseline message ID BEFORE requesting OTP (prevents reading stale/old OTP)
    const baselineId = await GmailOtp.getLatestMessageId();
    recordedBaselineMessageId = baselineId;

    // 2. Request OTP
    updateLoginState('requesting_otp', 'Requesting OTP from ERP portal...');
    await ErpApi.requestOTP(creds.rollNumber, password, matchedAnswer, sessionToken);

    // 3. Start automated OTP watcher with baseline
    updateLoginState('waiting_otp', 'OTP requested! Waiting for incoming Gmail email...');
    const otpAccount = (stored.otpSettings && stored.otpSettings.gmailAccountIndex) || 0;
    startAutonomousOtpWatcher(otpAccount, baselineId);

    // Wait for OTP resolution
    const otp = await new Promise((resolve, reject) => {
      otpResolver = resolve;
      otpRejecter = reject;
      setTimeout(() => reject(new Error('OTP retrieval timed out after 60 seconds')), 62000);
    });

    // Authenticate
    updateLoginState('signing_in', `Authenticating with OTP (${otp})...`);
    const signinResult = await ErpApi.signIn(
      creds.rollNumber,
      password,
      matchedAnswer,
      otp,
      sessionToken,
      true
    );

    const targetUrl = signinResult.targetUrl || ErpApi.HOMEPAGE_URL;
    await openErpTab(targetUrl);

    updateLoginState('success', 'Logged in to IIT KGP ERP successfully!');

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'ERP 1-Click Login',
      message: `Welcome! Successfully logged in as ${creds.rollNumber}.`
    });

    return { success: true, targetUrl };
  } catch (err) {
    console.error('Login flow failed:', err);
    updateLoginState('error', err.message || 'Login failed');
    return { success: false, message: err.message };
  }
}

async function openErpTab(targetUrl) {
  return new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      const erpTab = tabs && tabs.find(t => t.url && t.url.includes('erp.iitkgp.ac.in'));
      if (erpTab) {
        chrome.tabs.update(erpTab.id, { url: targetUrl, active: true }, () => {
          chrome.windows.update(erpTab.windowId, { focused: true }, () => resolve(erpTab));
        });
      } else {
        chrome.tabs.create({ url: targetUrl, active: true }, (tab) => resolve(tab));
      }
    });
  });
}

// Runtime message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_LOGIN') {
    performOneClickLogin(message.pin).then(sendResponse);
    return true;
  }

  if (message.action === 'GET_LOGIN_STATE') {
    sendResponse({ state: { ...loginState } });
    return true;
  }

  // Pre-record baseline message ID from content script before clicking Get OTP
  if (message.action === 'RECORD_OTP_BASELINE') {
    if (sender && sender.tab && sender.tab.id) {
      activeErpTabId = sender.tab.id;
    }
    GmailOtp.getLatestMessageId().then((id) => {
      recordedBaselineMessageId = id;
      sendResponse({ baselineId: id });
    });
    return true;
  }

  // Triggered by content script when OTP is requested on the page
  if (message.action === 'START_OTP_WATCH') {
    if (sender && sender.tab && sender.tab.id) {
      activeErpTabId = sender.tab.id;
    }
    chrome.storage.local.get(['otpSettings'], (res) => {
      const idx = (res.otpSettings && res.otpSettings.gmailAccountIndex) || 0;
      startAutonomousOtpWatcher(idx, message.baselineId || recordedBaselineMessageId);
    });
    sendResponse({ status: 'watching' });
    return true;
  }

  // Manual OTP submit from popup or overlay
  if (message.action === 'SUBMIT_MANUAL_OTP') {
    const code = (message.otp || '').trim();
    if (/^\d{6}$/.test(code)) {
      broadcastOtpFound(code, 'manual-entry');
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, message: 'Invalid 6-digit OTP' });
    }
    return true;
  }

  // Received from mail-reader.js or other content scripts
  if (message.action === 'OTP_FOUND') {
    const code = (message.otp || '').trim();
    if (/^\d{6}$/.test(code)) {
      broadcastOtpFound(code, message.source || 'mail-tab');
    }
    sendResponse({ received: true });
    return true;
  }

  if (message.action === 'CLEAR_SESSIONS') {
    chrome.storage.local.get(['authCredentials'], async (res) => {
      const roll = (res.authCredentials && res.authCredentials.rollNumber) || message.rollNumber;
      if (roll) {
        const success = await ErpApi.clearAllSessions(roll);
        sendResponse({ success });
      } else {
        sendResponse({ success: false, message: 'Roll number not found' });
      }
    });
    return true;
  }

  if (message.action === 'LOGOUT') {
    ErpApi.logout().then((success) => {
      chrome.tabs.query({}, (tabs) => {
        if (tabs) {
          tabs.forEach((t) => {
            if (t.url && (t.url.includes('erp.iitkgp.ac.in') || t.url.includes('SSOAdministration') || t.url.includes('IIT_ERP3'))) {
              chrome.tabs.sendMessage(t.id, { action: 'USER_LOGGED_OUT' }).catch(() => {});
            }
          });
        }
      });
      sendResponse({ success });
    });
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'quick-login') {
    openErpTab(ErpApi.HOMEPAGE_URL);
  }
});
