/**
 * Mail Reader Content Script for IIT KGP ERP 1-Click Login.
 * Runs on mail.google.com and iitkgpmail.iitkgp.ac.in.
 * Silently detects incoming ERP OTP emails and relays the code to the extension.
 */

(() => {
  const ERP_SUBJECT_KEYWORD = "OTP for Sign In in ERP Portal of IIT Kharagpur";
  let isListeningForOtp = false;
  let otpRequestedTime = 0;
  const staleOtps = new Set();
  let domObserver = null;

  function recordStaleOtps() {
    staleOtps.clear();
    const rows = document.querySelectorAll('tr.zA, div[role="main"] div[role="listitem"], .y6, .y2, .Row, .MsgList');
    rows.forEach((row) => {
      const text = row.innerText || '';
      if (text.includes("OTP for Sign In") || (text.includes("OTP") && (text.includes("ERP") || text.includes("Sign In")))) {
        const otp = parseOtpFromText(text);
        if (otp) staleOtps.add(otp);
      }
    });
    if (staleOtps.size > 0) {
      console.log('[MailReader] Baseline stale OTPs in view:', Array.from(staleOtps));
    }
  }

  // Listen for instructions from the background worker or popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_OTP_WATCH') {
      isListeningForOtp = true;
      otpRequestedTime = message.timestamp || Date.now();
      recordStaleOtps();
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
   * Scans the current page DOM for any ERP OTP email text or snippets.
   */
  function extractOtpFromPage() {
    const pageText = document.body ? document.body.innerText : '';

    // Check if the ERP OTP subject is present on the page
    if (!pageText.includes("OTP for Sign In in ERP Portal") &&
        !(pageText.includes("OTP") && (pageText.includes("ERP") || pageText.includes("IIT Kharagpur")))) {
      return null;
    }

    // Helper to verify if row text is genuinely an ERP OTP email
    const isErpOtpRow = (text) => {
      if (!text) return false;
      return text.includes("OTP for Sign In") ||
        (text.includes("OTP") && (text.includes("ERP") || text.includes("Sign In")));
    };

    // 1. Gmail selectors
    const gmailRows = document.querySelectorAll('tr.zA, div[role="main"] div[role="listitem"], .y6, .y2');
    for (const row of gmailRows) {
      const text = row.innerText || '';
      if (isErpOtpRow(text)) {
        const otp = parseOtpFromText(text);
        if (otp && !staleOtps.has(otp)) return otp;
      }
    }

    // 2. Zimbra (iitkgpmail) selectors
    const zimbraRows = document.querySelectorAll('.Row, .MsgList, #zv__CLV__Body, [id*="MsgBody"]');
    for (const row of zimbraRows) {
      const text = row.innerText || '';
      if (isErpOtpRow(text)) {
        const otp = parseOtpFromText(text);
        if (otp && !staleOtps.has(otp)) return otp;
      }
    }

    // 3. Fallback: scan any element containing the keyword
    const treeWalker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.nodeValue && node.nodeValue.includes("OTP")) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let currentNode;
    while ((currentNode = treeWalker.nextNode())) {
      const text = currentNode.parentElement ? currentNode.parentElement.innerText : currentNode.nodeValue;
      if (isErpOtpRow(text)) {
        const otp = parseOtpFromText(text);
        if (otp && !staleOtps.has(otp)) return otp;
      }
    }

    return null;
  }

  /**
   * Helper to parse a 6-digit OTP from email text snippet.
   */
  function parseOtpFromText(text) {
    if (!text) return null;

    const clean = text
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Pattern 1: "Your OTP for Sign In into ERP Portal is 123456" or "OTP is 123456" or "OTP: 123456"
    const strictMatch = clean.match(/(?:OTP[\s\S]{1,60}?is|OTP[\s\:\-]+|code[\s\:\-is]+)\s*(\d{6})\b/i);
    if (strictMatch && strictMatch[1] && strictMatch[1] !== '721302') {
      return strictMatch[1];
    }

    // Pattern 2: "... is 123456. Valid for 10 minutes"
    const validForMatch = clean.match(/\bis\s+(\d{6})\b[^\d]{1,25}valid\s+for/i);
    if (validForMatch && validForMatch[1] && validForMatch[1] !== '721302') {
      return validForMatch[1];
    }

    // Pattern 3: Fallback - find 6-digit numbers, filter out Kharagpur PIN 721302,
    // and take the FIRST one (index 0) because OTP is near the top of the email
    const allDigits = clean.match(/\b\d{6}\b/g) || [];
    const candidates = allDigits.filter(code => code !== '721302');
    if (candidates.length > 0) {
      return candidates[0];
    }

    return null;
  }

  /**
   * Periodic scanner when OTP watch is active
   */
  function scanForOtp() {
    let attempts = 0;
    const maxAttempts = 40; // 40 * 1.2s = 48s

    const checkNow = () => {
      if (!isListeningForOtp) return false;
      const otp = extractOtpFromPage();
      if (otp) {
        if (interval) clearInterval(interval);
        if (domObserver) {
          domObserver.disconnect();
          domObserver = null;
        }
        isListeningForOtp = false;
        notifyOtpFound(otp);
        return true;
      }
      return false;
    };

    // Immediate check
    if (checkNow()) return;

    // Interval poller
    const interval = setInterval(() => {
      attempts++;
      if (checkNow() || attempts >= maxAttempts || !isListeningForOtp) {
        clearInterval(interval);
        if (domObserver) {
          domObserver.disconnect();
          domObserver = null;
        }
      }
    }, 1200);

    // Dynamic DOM observer for live email arrival in Gmail inbox
    try {
      if (domObserver) domObserver.disconnect();
      domObserver = new MutationObserver(() => {
        checkNow();
      });
      domObserver.observe(document.body, { childList: true, subtree: true });
    } catch {}
  }

  /**
   * Notifies background script and shows subtle indicator
   */
  function notifyOtpFound(otp) {
    chrome.runtime.sendMessage({
      action: 'OTP_FOUND',
      otp: otp,
      source: window.location.hostname
    });

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

  // Observe DOM additions in Gmail / Webmail for real-time detection
  const observer = new MutationObserver(() => {
    if (isListeningForOtp) {
      const otp = extractOtpFromPage();
      if (otp) {
        isListeningForOtp = false;
        notifyOtpFound(otp);
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
})();
