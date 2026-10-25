/**
 * Mail Reader Content Script for IIT KGP ERP 1-Click Login.
 * Runs on mail.google.com and iitkgpmail.iitkgp.ac.in.
 * Silently detects incoming ERP OTP emails and relays the code to the extension.
 */

(() => {
  const ERP_SUBJECT_KEYWORD = "OTP for Sign In in ERP Portal of IIT Kharagpur";
  let isListeningForOtp = false;
  let otpRequestedTime = 0;

  // Listen for instructions from the background worker or popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_OTP_WATCH') {
      chrome.storage.local.get(['googleOAuth'], (res) => {
        // If Google OAuth API is enabled, let background handle it with strict baseline IDs
        if (res.googleOAuth && (res.googleOAuth.accessToken || res.googleOAuth.refreshToken)) {
          console.log('[MailReader] Google OAuth API is active. Skipping DOM mail scraper.');
          return;
        }
        isListeningForOtp = true;
        otpRequestedTime = message.timestamp || Date.now();
        scanForOtp();
      });
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
        !pageText.includes("IIT Kharagpur") &&
        !pageText.includes("ERP Portal")) {
      return null;
    }

    // Try finding specific email row or preview containers
    // 1. Gmail selectors
    const gmailRows = document.querySelectorAll('tr.zA, div[role="main"] div[role="listitem"], .y6, .y2');
    for (const row of gmailRows) {
      const text = row.innerText || '';
      if (text.includes("OTP for Sign In") || text.includes("IIT Kharagpur")) {
        const otp = parseOtpFromText(text);
        if (otp) return otp;
      }
    }

    // 2. Zimbra (iitkgpmail) selectors
    const zimbraRows = document.querySelectorAll('.Row, .MsgList, #zv__CLV__Body, [id*="MsgBody"]');
    for (const row of zimbraRows) {
      const text = row.innerText || '';
      if (text.includes("OTP for Sign In") || text.includes("IIT Kharagpur")) {
        const otp = parseOtpFromText(text);
        if (otp) return otp;
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
      if (text.includes("Sign In") || text.includes("Kharagpur")) {
        const otp = parseOtpFromText(text);
        if (otp) return otp;
      }
    }

    return null;
  }

  /**
   * Helper to parse a 6-digit OTP from email text snippet.
   */
  function parseOtpFromText(text) {
    if (!text) return null;

    // Pattern 1: "OTP is 123456" or "OTP: 123456" or "code is 123456"
    const explicitMatch = text.match(/(?:OTP|code|password)[\s\:\-is]+(\d{6})\b/i);
    if (explicitMatch && explicitMatch[1]) {
      return explicitMatch[1];
    }

    // Pattern 2: Find all 6-digit numbers in text that mentions ERP or IIT Kharagpur
    const matches = text.match(/\b\d{6}\b/g);
    if (matches && matches.length > 0) {
      // The OTP is usually the last 6-digit number in the notification/email
      return matches[matches.length - 1];
    }

    return null;
  }

  /**
   * Periodic scanner when OTP watch is active
   */
  function scanForOtp() {
    let attempts = 0;
    const maxAttempts = 30; // 30 * 1.5s = 45s

    const interval = setInterval(() => {
      attempts++;
      const otp = extractOtpFromPage();
      if (otp) {
        clearInterval(interval);
        isListeningForOtp = false;
        notifyOtpFound(otp);
      } else if (attempts >= maxAttempts || !isListeningForOtp) {
        clearInterval(interval);
      }
    }, 1500);
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
