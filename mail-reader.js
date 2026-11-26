/**
 * Mail Reader Content Script for IIT KGP ERP 1-Click Login.
 * Runs on mail.google.com and iitkgpmail.iitkgp.ac.in.
 * Silently detects incoming ERP OTP emails and relays the code to the extension.
 */

(() => {
  let isListeningForOtp = false;
  let otpRequestedTime = 0;
  const usedOtps = new Set();
  let domObserver = null;
  let intervalId = null;

  // 1. Check shared storage on startup in case login was already initiated
  chrome.storage.local.get(['erp_active_login'], (res) => {
    const active = res.erp_active_login;
    if (active && active.status === 'waiting_for_otp' && Date.now() - (active.requestedAt || 0) < 180000) {
      console.log('[MailReader] Found active ERP login request in shared storage. Starting scanner.');
      isListeningForOtp = true;
      otpRequestedTime = active.requestedAt;
      usedOtps.clear();
      scanForOtp();
    }
  });

  // 2. React instantaneously to storage changes (cross-tab sync)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.erp_active_login) {
      const active = changes.erp_active_login.newValue;
      if (active && active.status === 'waiting_for_otp' && Date.now() - (active.requestedAt || 0) < 180000) {
        console.log('[MailReader] Storage flagged waiting_for_otp. Starting scanner.');
        isListeningForOtp = true;
        otpRequestedTime = active.requestedAt;
        usedOtps.clear();
        scanForOtp();
      }
    }
  });

  // 3. Listen for instructions from background worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_OTP_WATCH') {
      isListeningForOtp = true;
      otpRequestedTime = message.timestamp || Date.now();
      usedOtps.clear();
      scanForOtp();
      sendResponse({ status: 'watching' });
      return true;
    }

    if (message.action === 'SCAN_OTP_NOW') {
      const otp = extractOtpFromPage();
      sendResponse({ otp: otp });
      return true;
    }
  });

  /**
   * Helper to verify if text contains ERP OTP keywords
   */
  function isErpOtpText(text) {
    if (!text) return false;
    return (
      text.includes("OTP for Sign In") ||
      (text.includes("OTP") && (text.includes("ERP") || text.includes("Sign In") || text.includes("IIT Kharagpur")))
    );
  }

  /**
   * Helper to parse a 6-digit OTP from email text snippet.
   * If an email thread contains multiple codes, selects the latest (last) valid code.
   */
  function parseOtpFromText(text) {
    if (!text) return null;

    const clean = text
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Pattern 1: Strict match like "OTP for Sign In into ERP Portal is 123456" or "OTP is 123456"
    const strictMatches = Array.from(clean.matchAll(/(?:OTP[\s\S]{1,60}?is|OTP[\s\:\-]+|code[\s\:\-is]+)\s*(\d{6})\b/gi));
    if (strictMatches.length > 0) {
      const valid = strictMatches.map(m => m[1]).filter(code => code !== '721302');
      if (valid.length > 0) {
        return valid[valid.length - 1];
      }
    }

    // Pattern 2: "... is 123456. Valid for 10 minutes"
    const validForMatches = Array.from(clean.matchAll(/\bis\s+(\d{6})\b[^\d]{1,25}valid\s+for/gi));
    if (validForMatches.length > 0) {
      const valid = validForMatches.map(m => m[1]).filter(code => code !== '721302');
      if (valid.length > 0) {
        return valid[valid.length - 1];
      }
    }

    // Pattern 3: Fallback - find 6-digit numbers, filter out Kharagpur PIN 721302, take latest
    const allDigits = clean.match(/\b\d{6}\b/g) || [];
    const candidates = allDigits.filter(code => code !== '721302');
    if (candidates.length > 0) {
      return candidates[candidates.length - 1];
    }

    return null;
  }

  /**
   * Scans the current page DOM for any ERP OTP email text or snippets.
   */
  function extractOtpFromPage() {
    // 1. Priority 1: Currently open email thread in Gmail (.a3s, .ii.gt, .adn)
    const openEmailBodies = document.querySelectorAll('.a3s, div[role="main"] .ii.gt, div[role="main"] .adn, [data-message-id]');
    for (const body of openEmailBodies) {
      const text = body.innerText || '';
      if (isErpOtpText(text) || text.includes('OTP')) {
        const otp = parseOtpFromText(text);
        if (otp && !usedOtps.has(otp)) {
          console.log('[MailReader] Found OTP in open email view:', '••••••');
          return otp;
        }
      }
    }

    // 2. Priority 2: Unread Gmail rows (tr.zA.zE or tr.zE)
    const unreadRows = document.querySelectorAll('tr.zA.zE, tr.zE');
    for (const row of unreadRows) {
      const text = row.innerText || '';
      if (isErpOtpText(text)) {
        const otp = parseOtpFromText(text);
        if (otp && !usedOtps.has(otp)) {
          console.log('[MailReader] Found OTP in unread email row:', '••••••');
          return otp;
        }
      }
    }

    // 3. Priority 3: Topmost email row (newest received email in the inbox)
    const gmailRows = document.querySelectorAll('tr.zA');
    if (gmailRows.length > 0) {
      const topRow = gmailRows[0];
      const text = topRow.innerText || '';
      if (isErpOtpText(text)) {
        const otp = parseOtpFromText(text);
        if (otp && !usedOtps.has(otp)) {
          console.log('[MailReader] Found OTP in topmost email row:', '••••••');
          return otp;
        }
      }
    }

    // 4. Priority 4: Zimbra webmail (iitkgpmail.iitkgp.ac.in)
    const unreadZimbra = document.querySelectorAll('.Row.Unread, tr.Unread');
    for (const row of unreadZimbra) {
      const text = row.innerText || '';
      if (isErpOtpText(text)) {
        const otp = parseOtpFromText(text);
        if (otp && !usedOtps.has(otp)) {
          return otp;
        }
      }
    }

    const zimbraRows = document.querySelectorAll('.Row, .MsgList, #zv__CLV__Body, [id*="MsgBody"]');
    for (const row of zimbraRows) {
      const text = row.innerText || '';
      if (isErpOtpText(text)) {
        const otp = parseOtpFromText(text);
        if (otp && !usedOtps.has(otp)) {
          return otp;
        }
      }
    }

    // 5. Priority 5: General scan across all email list items and snippets
    const allRows = document.querySelectorAll('tr.zA, div[role="main"] div[role="listitem"], .y6, .y2');
    for (const row of allRows) {
      const text = row.innerText || '';
      if (isErpOtpText(text)) {
        const otp = parseOtpFromText(text);
        if (otp && !usedOtps.has(otp)) {
          return otp;
        }
      }
    }

    // 6. Priority 6: Full body text fallback
    const pageText = document.body ? document.body.innerText : '';
    if (isErpOtpText(pageText)) {
      const otp = parseOtpFromText(pageText);
      if (otp && !usedOtps.has(otp)) {
        return otp;
      }
    }

    return null;
  }

  /**
   * Periodic scanner when OTP watch is active
   */
  function scanForOtp() {
    let attempts = 0;
    const maxAttempts = 60; // 60 * 1000ms = 60s

    const cleanup = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
      }
    };

    const checkNow = () => {
      if (!isListeningForOtp) return false;
      const otp = extractOtpFromPage();
      if (otp) {
        cleanup();
        isListeningForOtp = false;
        notifyOtpFound(otp);
        return true;
      }
      return false;
    };

    // 1. Immediate check
    if (checkNow()) return;

    // 2. Interval poller
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => {
      attempts++;
      if (checkNow() || attempts >= maxAttempts || !isListeningForOtp) {
        cleanup();
      }
    }, 1000);

    // 3. Dynamic DOM observer for live email arrival in Gmail inbox
    try {
      if (domObserver) domObserver.disconnect();
      domObserver = new MutationObserver(() => {
        checkNow();
      });
      domObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } catch (e) {
      console.warn('[MailReader] MutationObserver error:', e);
    }
  }

  /**
   * Relays detected OTP to shared storage and runtime message
   */
  function notifyOtpFound(otp) {
    usedOtps.add(otp);
    console.log('[MailReader] Relaying valid ERP OTP (••••••) via storage & message.');

    // 1. Write directly to shared storage for instant cross-tab pickup
    chrome.storage.local.set({
      erp_latest_otp: {
        otp: otp,
        timestamp: Date.now(),
        source: window.location.hostname
      }
    });

    // 2. Send runtime message to background / active tab
    chrome.runtime.sendMessage({
      action: 'OTP_FOUND',
      otp: otp,
      source: window.location.hostname
    }).catch(() => {});

    showOtpBadge(otp);
  }

  /**
   * Visual feedback badge on mail tab
   */
  function showOtpBadge(otp) {
    const badge = document.createElement('div');
    badge.id = 'erp-otp-detected-badge';
    badge.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: linear-gradient(135deg, #1e3a8a, #0284c7);
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: erpSlideUp 0.3s ease;
    `;
    badge.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      <div>
        <div style="font-weight: 600;">IIT KGP ERP OTP Detected</div>
        <div style="font-size: 13px; opacity: 0.9;">Code securely transferred to ERP Auto-Login.</div>
      </div>
    `;

    document.body.appendChild(badge);
    setTimeout(() => {
      badge.style.opacity = '0';
      badge.style.transition = 'opacity 0.5s ease';
      setTimeout(() => badge.remove(), 500);
    }, 4500);
  }
})();
