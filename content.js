/**
 * Content Script for IIT KGP ERP Portal (erp.iitkgp.ac.in).
 * Handles in-page autofill, security question matching, OTP auto-detection, and auto-submission.
 */

(() => {
  // Check if we are on the login page or a page containing the login form
  const isLoginPage = () => {
    return (
      window.location.href.includes('SSOAdministration/login.htm') ||
      window.location.href.includes('IIT_ERP3') ||
      document.getElementById('user_id') !== null ||
      document.getElementById('loginForm') !== null
    );
  };

  if (!isLoginPage()) {
    return;
  }

  let cardElem = null;
  let statusTextElem = null;
  let spinnerElem = null;
  let otpSectionElem = null;
  let manualSectionElem = null;
  let otpInputElem = null;
  let countdownTimer = null;
  let isSubmitting = false;
  let currentCreds = null;

  // Global listener: flags when user clicks any logout link anywhere on ERP
  document.addEventListener('click', (e) => {
    const target = e.target.closest('a, button, input[type="button"], span');
    if (target) {
      const href = (target.getAttribute('href') || '').toLowerCase();
      const text = (target.innerText || '').toLowerCase();
      const onclick = (target.getAttribute('onclick') || '').toLowerCase();
      if (
        href.includes('logout') ||
        text.includes('logout') ||
        text.includes('log out') ||
        text.includes('sign out') ||
        onclick.includes('logout')
      ) {
        console.log('[ERP Content] User clicked logout. Flagging erp_just_logged_out.');
        sessionStorage.setItem('erp_just_logged_out', 'true');
      }
    }
  }, true);

  /**
   * Checks if the user reached this page via a logout action
   */
  const isLogoutPage = () => {
    const search = window.location.search.toLowerCase();
    const href = window.location.href.toLowerCase();
    const justLoggedOut = sessionStorage.getItem('erp_just_logged_out') === 'true';
    return (
      search.includes('logout') ||
      href.includes('logout') ||
      justLoggedOut
    );
  };

  chrome.storage.local.get(['authCredentials', 'otpSettings', 'autoLogin'], async (res) => {
    const creds = res.authCredentials;
    if (!creds || !creds.rollNumber || !creds.password) {
      console.log('ERP 1-Click Login: Credentials not configured yet.');
      return;
    }

    currentCreds = creds;
    const isAutoLoginEnabled = (res.autoLogin !== undefined) ? res.autoLogin : (creds.autoLogin !== false);

    // Wait until DOM is fully interactive
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => init(creds, isAutoLoginEnabled));
    } else {
      init(creds, isAutoLoginEnabled);
    }
  });

  function init(creds, isAutoLoginEnabled) {
    const userIdInput = document.getElementById('user_id');
    if (!userIdInput) {
      return;
    }

    // Strip any eye toggle buttons or password reveal mechanisms on ERP
    const stripEyeButtons = () => {
      document.querySelectorAll('.toggle-password, .show-password, [id*="toggle-pwd"], [id*="togglePassword"], .fa-eye, .fa-eye-slash').forEach((el) => {
        try { el.remove(); } catch {}
      });
      const pwd = document.getElementById('password');
      if (pwd) {
        pwd.type = 'password';
        pwd.setAttribute('type', 'password');
      }
    };
    stripEyeButtons();
    setTimeout(stripEyeButtons, 500);
    setTimeout(stripEyeButtons, 1500);

    renderCard(creds.rollNumber, creds);

    // 1. If user explicitly logged out, PAUSE auto-login so they aren't trapped in a loop
    if (isLogoutPage()) {
      console.log('ERP 1-Click Login: User logged out. Auto-login paused.');
      updateStatus('You have logged out of ERP.', false, false);
      showManualLoginButton();
      return;
    }

    // 2. If General Behavior "Auto-Login on Page Visit" is disabled (turned off)
    if (!isAutoLoginEnabled) {
      console.log('ERP 1-Click Login: Auto-login is disabled in General Behavior settings.');
      updateStatus('Auto-login disabled in General Behavior.', false, false);
      showManualLoginButton();
      return;
    }

    // 3. Check if the page already has an OTP mismatch error from previous submit
    const bodyText = document.body ? document.body.innerText.toLowerCase() : '';
    if (bodyText.includes('otp mismatch') || bodyText.includes('invalid otp')) {
      updateStatus('Previous OTP mismatch. Click Resend OTP or enter code.', true);
      if (otpSectionElem) otpSectionElem.style.display = 'block';
      return;
    }

    // 4. Normal auto-login flow
    startInPageLogin(creds);
  }

  function showManualLoginButton() {
    if (spinnerElem) spinnerElem.style.display = 'none';
    if (manualSectionElem) manualSectionElem.style.display = 'block';
  }

  /**
   * Renders the floating status and quick-control overlay
   */
  function renderCard(rollNumber, creds) {
    if (document.getElementById('erp-auto-login-card')) return;

    cardElem = document.createElement('div');
    cardElem.id = 'erp-auto-login-card';
    cardElem.innerHTML = `
      <div class="erp-card-header">
        <div class="erp-card-title">
          <svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>ERP 1-Click Login</span>
        </div>
        <div class="erp-card-badge">${rollNumber}</div>
      </div>
      <div class="erp-status-box">
        <div class="erp-spinner" id="erp-spinner"></div>
        <div class="erp-status-text" id="erp-status-text">
          Initializing 1-Click Login...
        </div>
      </div>
      <div class="erp-manual-section" id="erp-manual-section" style="display: none; margin-bottom: 12px;">
        <button type="button" class="erp-btn erp-btn-primary" style="width: 100%; font-size: 13.5px; padding: 11px; font-weight: 700; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);" id="erp-manual-login-btn">
          <svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>1-Click Login to ERP</span>
        </button>
      </div>
      <div class="erp-otp-section" id="erp-otp-section" style="width: 100%; box-sizing: border-box;">
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 6px;">
          OTP requested. Fetching from Gmail API...
        </div>
        <div class="erp-otp-input-group" style="display: flex; gap: 8px; width: 100%; box-sizing: border-box; align-items: stretch; margin-bottom: 10px;">
          <input type="password" class="erp-otp-field" id="erp-overlay-otp" maxlength="6" placeholder="••••••" autocomplete="one-time-code" style="flex: 1 1 0%; min-width: 0; width: 0; box-sizing: border-box;" />
          <button type="button" class="erp-btn erp-btn-secondary" id="erp-paste-btn" style="flex: 0 0 auto; flex-shrink: 0; white-space: nowrap; box-sizing: border-box;">
            <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            <span>Paste</span>
          </button>
        </div>
        <button type="button" class="erp-btn erp-btn-primary" style="width: 100%; box-sizing: border-box;" id="erp-submit-otp-btn">
          <svg class="icon-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          <span>Instant Submit (<span id="erp-countdown">60</span>s)</span>
        </button>
      </div>
      <div class="erp-actions-row">
        <span>Press <strong>Alt+Shift+L</strong> anytime</span>
        <button type="button" class="erp-link-btn" id="erp-clear-sessions-btn">Clear Sessions</button>
      </div>
    `;

    document.body.appendChild(cardElem);

    statusTextElem = document.getElementById('erp-status-text');
    spinnerElem = document.getElementById('erp-spinner');
    otpSectionElem = document.getElementById('erp-otp-section');
    manualSectionElem = document.getElementById('erp-manual-section');
    otpInputElem = document.getElementById('erp-overlay-otp');

    // Manual login button handler (used when auto-login is disabled or after logout)
    const manualBtn = document.getElementById('erp-manual-login-btn');
    if (manualBtn) {
      manualBtn.addEventListener('click', () => {
        sessionStorage.removeItem('erp_just_logged_out');
        if (manualSectionElem) manualSectionElem.style.display = 'none';
        if (spinnerElem) spinnerElem.style.display = 'block';
        startInPageLogin(creds || currentCreds);
      });
    }

    // Paste button handler
    const pasteBtn = document.getElementById('erp-paste-btn');
    if (pasteBtn) {
      pasteBtn.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          const match = text.match(/\b\d{6}\b/);
          if (match) {
            handleOtpFound(match[0]);
          } else {
            updateStatus('No 6-digit OTP found in clipboard');
          }
        } catch {
          updateStatus('Clipboard access denied');
        }
      });
    }

    // Submit button handler
    const submitBtn = document.getElementById('erp-submit-otp-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        if (otpInputElem && otpInputElem.value.trim().length === 6) {
          handleOtpFound(otpInputElem.value.trim());
        }
      });
    }

    // Auto-submit as soon as 6 digits are typed into overlay input
    if (otpInputElem) {
      otpInputElem.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val;
        if (val.length === 6) {
          handleOtpFound(val);
        }
      });
    }

    // Clear sessions link
    const clearBtn = document.getElementById('erp-clear-sessions-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        updateStatus('Clearing all active sessions...');
        await ErpApi.clearAllSessions(rollNumber);
        updateStatus('Active sessions cleared! Refreshing...');
        setTimeout(() => window.location.reload(), 1000);
      });
    }
  }

  function updateStatus(msg, isError = false, isSuccess = false) {
    if (statusTextElem) {
      statusTextElem.innerHTML = msg;
    }
    if (cardElem) {
      cardElem.classList.remove('erp-card-error', 'erp-card-success');
      if (isError) cardElem.classList.add('erp-card-error');
      if (isSuccess) cardElem.classList.add('erp-card-success');
    }
    if (spinnerElem) {
      spinnerElem.style.display = (isError || isSuccess) ? 'none' : 'block';
    }
  }

  /**
   * Main login orchestration on the live ERP DOM
   */
  async function startInPageLogin(creds) {
    try {
      updateStatus('Filling Roll Number...');

      let password = creds.password;
      let qaPairs = creds.qaPairs || [];

      // Handle PIN if required
      if (creds.requirePin) {
        updateStatus('PIN required to decrypt credentials...');
        const pin = prompt('Enter your 4-digit PIN for ERP Auto-Login:');
        if (!pin) {
          updateStatus('Login cancelled: PIN not provided', true);
          return;
        }
        password = await CryptoUtil.decrypt(creds.password, pin);
        qaPairs = await Promise.all(
          qaPairs.map(async (pair) => ({
            question: pair.question,
            answer: await CryptoUtil.decrypt(pair.answer, pin)
          }))
        );
      }

      const userIdInput = document.getElementById('user_id');
      const passwordInput = document.getElementById('password');
      const answerInput = document.getElementById('answer');

      if (!userIdInput) {
        updateStatus('Could not find user_id input on page', true);
        return;
      }

      // 1. Enter roll number
      userIdInput.value = creds.rollNumber;
      userIdInput.dispatchEvent(new Event('input', { bubbles: true }));
      userIdInput.dispatchEvent(new Event('change', { bubbles: true }));

      // 2. Trigger ERP's native blur to fetch security question
      updateStatus('Fetching security question...');
      userIdInput.focus();
      userIdInput.blur();

      // 3. Wait for ERP to populate #question label or fetch via API fallback
      const questionText = await waitForSecurityQuestion(creds.rollNumber);
      updateStatus(`Question: "${questionText.substring(0, 30)}..."`);

      // 4. Match answer
      const answer = ErpApi.matchAnswer(questionText, qaPairs);
      if (!answer) {
        throw new Error(`No saved answer matching: "${questionText}". Please update settings.`);
      }

      // 5. Fill Password (ensure type remains password)
      if (passwordInput) {
        passwordInput.type = 'password';
        passwordInput.value = password;
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 6. Fill Answer
      if (answerInput) {
        answerInput.readOnly = false;
        answerInput.removeAttribute('readonly');
        answerInput.value = answer;
        answerInput.dispatchEvent(new Event('input', { bubbles: true }));
        answerInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Populate sessionToken from URL query if empty
      const sessionTokenInput = document.getElementById('sessionToken');
      if (sessionTokenInput && !sessionTokenInput.value) {
        const urlToken = new URLSearchParams(window.location.search).get('sessionToken');
        if (urlToken) sessionTokenInput.value = urlToken;
      }

      // Wait a moment for ERP jQuery event loop
      await new Promise(r => setTimeout(r, 350));

      // 7. Check if OTP was already requested recently or cooldown is active on page
      const getOtpBtn = document.getElementById('getotp');
      const lastRequested = parseInt(sessionStorage.getItem('erp_otp_requested_time') || '0', 10);
      const isCooldownActive = (Date.now() - lastRequested < 55000) || (getOtpBtn && getOtpBtn.innerText.includes('Resend ('));

      let baselineId = null;

      if (isCooldownActive) {
        console.log('[ERP Content] OTP was already requested recently. Waiting for incoming code without re-triggering.');
        updateStatus('Waiting for incoming OTP from Gmail...');
      } else {
        // Pre-record baseline message ID before clicking Get OTP
        try {
          const baselineRes = await chrome.runtime.sendMessage({ action: 'RECORD_OTP_BASELINE' });
          if (baselineRes && baselineRes.baselineId) {
            baselineId = baselineRes.baselineId;
          }
        } catch {}

        // Request OTP from ERP
        updateStatus('Requesting OTP from ERP...');
        sessionStorage.setItem('erp_otp_requested_time', Date.now().toString());
        await triggerOtpRequest(creds.rollNumber, password, answer);
      }

      // 8. Show OTP Input & Listener UI
      if (otpSectionElem) {
        otpSectionElem.style.display = 'block';
        if (otpInputElem) otpInputElem.focus();
      }

      startCountdown();
      watchClipboardForOtp();

      // 9. Notify background to start watching Gmail with baseline
      chrome.runtime.sendMessage({
        action: 'START_OTP_WATCH',
        baselineId: baselineId,
        timestamp: Date.now()
      }).catch(() => {});

    } catch (err) {
      console.error('In-page login error:', err);
      updateStatus(`Error: ${err.message}`, true);
    }
  }

  /**
   * Waits for #question label to receive the security question text
   */
  function waitForSecurityQuestion(rollNumber) {
    return new Promise((resolve, reject) => {
      const getQuestionText = () => {
        const qElem = document.getElementById('question');
        if (qElem && qElem.innerText) {
          const txt = qElem.innerText.trim();
          if (txt.length > 3 && txt.toLowerCase() !== 'security question') {
            return txt;
          }
        }
        const answerDiv = document.getElementById('answer_div');
        if (answerDiv) {
          const label = answerDiv.querySelector('label');
          if (label && label.innerText) {
            const txt = label.innerText.trim();
            if (txt.length > 3 && txt.toLowerCase() !== 'security question') {
              return txt;
            }
          }
        }
        return null;
      };

      const existing = getQuestionText();
      if (existing) return resolve(existing);

      let resolved = false;
      const targetNode = document.getElementById('question') || document.getElementById('answer_div');

      const observer = new MutationObserver(() => {
        const txt = getQuestionText();
        if (txt) {
          resolved = true;
          observer.disconnect();
          resolve(txt);
        }
      });

      if (targetNode) {
        observer.observe(targetNode, { childList: true, subtree: true, characterData: true });
      }

      // Fallback: Query API directly if ERP page didn't populate within 2 seconds
      setTimeout(async () => {
        if (!resolved) {
          try {
            const q = await ErpApi.getSecurityQuestion(rollNumber);
            resolved = true;
            observer.disconnect();
            const qElem = document.getElementById('question');
            if (qElem) qElem.innerText = q;
            resolve(q);
          } catch (err) {
            observer.disconnect();
            reject(err);
          }
        }
      }, 2000);
    });
  }

  /**
   * Triggers the OTP request via native button or fetch
   */
  async function triggerOtpRequest(rollNumber, password, answer) {
    const getOtpBtn = document.getElementById('getotp');
    const emailOtpInput = document.getElementById('email_otp1');
    const submitBtn = document.getElementById('loginFormSubmitButton');

    // Ensure sessionToken is in the form before serialize
    const sessionTokenInput = document.getElementById('sessionToken');
    if (sessionTokenInput && !sessionTokenInput.value) {
      const urlToken = new URLSearchParams(window.location.search).get('sessionToken');
      if (urlToken) sessionTokenInput.value = urlToken;
    }

    // Ensure answer is present so ERP's getEmailOTP serializes it
    const answerInput = document.getElementById('answer');
    if (answerInput && !answerInput.value) {
      answerInput.readOnly = false;
      answerInput.value = answer;
    }

    // 1. If getotp button exists, enable and click it to use ERP's native getEmailOTP('SI')
    if (getOtpBtn) {
      if (!getOtpBtn.innerText.includes('Resend (')) {
        getOtpBtn.disabled = false;
        getOtpBtn.removeAttribute('disabled');
        getOtpBtn.click();
      }

      // Automatically dismiss any SweetAlert popup that appears
      dismissSweetAlert();
      const swalDismissTimer = setInterval(dismissSweetAlert, 200);
      setTimeout(() => clearInterval(swalDismissTimer), 3500);

      // Ensure fields become editable immediately
      if (emailOtpInput) {
        emailOtpInput.readOnly = false;
        emailOtpInput.removeAttribute('readonly');
      }
      if (submitBtn) {
        submitBtn.classList.remove('d-none', 'hidden');
        submitBtn.disabled = false;
        submitBtn.removeAttribute('disabled');
      }

      updateStatus('OTP requested! Listening to Gmail...');
      return;
    }

    // 2. Direct API fallback
    const sessionToken = sessionTokenInput ? sessionTokenInput.value : '';
    await ErpApi.requestOTP(rollNumber, password, answer, sessionToken);
    updateStatus('OTP sent to email! Listening to Gmail...');
  }

  /**
   * Dismisses SweetAlert modal if open
   */
  function dismissSweetAlert() {
    try {
      if (window.Swal && typeof window.Swal.close === 'function') {
        window.Swal.close();
      }
    } catch {}

    // Page-world SweetAlert dismissal
    try {
      const pageScript = document.createElement('script');
      pageScript.textContent = 'if (window.Swal && typeof window.Swal.close === "function") { window.Swal.close(); }';
      (document.head || document.documentElement).appendChild(pageScript);
      pageScript.remove();
    } catch {}

    const swalConfirm = document.querySelector('.swal2-confirm');
    if (swalConfirm) swalConfirm.click();

    document.querySelectorAll('.swal2-container, .swal2-backdrop').forEach((el) => {
      try { el.remove(); } catch {}
    });

    document.body.classList.remove('swal2-shown', 'swal2-height-auto');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }

  /**
   * Countdown timer for OTP
   */
  function startCountdown() {
    let seconds = 60;
    const countdownElem = document.getElementById('erp-countdown');
    if (countdownTimer) clearInterval(countdownTimer);

    countdownTimer = setInterval(() => {
      seconds--;
      if (countdownElem) countdownElem.innerText = seconds;
      if (seconds <= 0) {
        clearInterval(countdownTimer);
        sessionStorage.removeItem('erp_otp_requested_time');
        updateStatus('OTP expired or taking too long. Click Resend OTP.');
      }
    }, 1000);
  }

  /**
   * Silently monitors clipboard for 6-digit OTP copied by the user
   */
  function watchClipboardForOtp() {
    const interval = setInterval(async () => {
      if (isSubmitting) {
        clearInterval(interval);
        return;
      }
      try {
        if (document.hasFocus()) {
          const text = await navigator.clipboard.readText();
          const match = text.match(/\b\d{6}\b/);
          if (match && !isSubmitting) {
            clearInterval(interval);
            handleOtpFound(match[0]);
          }
        }
      } catch {}
    }, 1500);
  }

  /**
   * Submits the OTP into the ERP login form INSTANTANEOUSLY (0ms delay)
   */
  async function handleOtpFound(otp) {
    if (isSubmitting) return;
    isSubmitting = true;
    if (countdownTimer) clearInterval(countdownTimer);
    sessionStorage.removeItem('erp_otp_requested_time');

    updateStatus('Auto-filling OTP (••••••) & logging in...', false, true);

    // 1. Instantly eliminate SweetAlert
    dismissSweetAlert();

    // 2. Fill into the floating overlay field
    if (otpInputElem) otpInputElem.value = otp;

    // 3. Fill into the actual ERP form input (#email_otp1) with type="password" to keep code hidden
    const pageOtpInput = document.getElementById('email_otp1');
    if (pageOtpInput) {
      pageOtpInput.readOnly = false;
      pageOtpInput.removeAttribute('readonly');
      pageOtpInput.type = 'password';
      pageOtpInput.value = otp;
      pageOtpInput.dispatchEvent(new Event('input', { bubbles: true }));
      pageOtpInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 4. Ensure sessionToken is present in form
    const sessionTokenInput = document.getElementById('sessionToken');
    if (sessionTokenInput && !sessionTokenInput.value) {
      const urlToken = new URLSearchParams(window.location.search).get('sessionToken');
      if (urlToken) sessionTokenInput.value = urlToken;
    }

    // 5. Ensure core form inputs dispatch change events and keep password hidden
    const userIdInput = document.getElementById('user_id');
    const passwordInput = document.getElementById('password');
    const answerInput = document.getElementById('answer');
    if (userIdInput) userIdInput.dispatchEvent(new Event('change', { bubbles: true }));
    if (passwordInput) {
      passwordInput.type = 'password';
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (answerInput) answerInput.dispatchEvent(new Event('change', { bubbles: true }));

    // 6. INSTANT SUBMISSION: Execute immediately without waiting
    const submitBtn = document.getElementById('loginFormSubmitButton');
    const form = document.getElementById('loginForm') || document.querySelector('form[action*="auth.htm"]');

    if (submitBtn) {
      submitBtn.classList.remove('d-none', 'hidden');
      submitBtn.removeAttribute('disabled');
    }

    // Channel A: Page-world execution of ERP's $("#loginForm").submit()
    try {
      const pageScript = document.createElement('script');
      pageScript.textContent = `
        try {
          if (window.Swal && typeof window.Swal.close === 'function') window.Swal.close();
          if (window.$ && $("#loginForm").length) {
            $("#loginForm").submit();
          } else {
            document.getElementById('loginForm')?.submit();
          }
        } catch (e) {
          document.getElementById('loginForm')?.submit();
        }
      `;
      (document.head || document.documentElement).appendChild(pageScript);
      pageScript.remove();
    } catch {}

    // Channel B: Native DOM form submit
    try {
      if (form) {
        HTMLFormElement.prototype.submit.call(form);
      }
    } catch {}

    // Channel C: Button click
    if (submitBtn) {
      try { submitBtn.click(); } catch {}
    }

    // Watch for "previous session is still active" error on page
    watchForActiveSessionError();
  }

  /**
   * Detects "previous session is still active" and auto-recovers
   */
  function watchForActiveSessionError() {
    setTimeout(async () => {
      const pageText = document.body ? document.body.innerText.toLowerCase() : '';
      if (pageText.includes('previous session is still active')) {
        updateStatus('Previous session was active! Auto-clearing and retrying...');
        const userElem = document.getElementById('user_id');
        const roll = userElem ? userElem.value : '';
        if (roll) {
          await ErpApi.clearAllSessions(roll);
          setTimeout(() => {
            const submitBtn = document.getElementById('loginFormSubmitButton');
            if (submitBtn) submitBtn.click();
          }, 800);
        }
      }
    }, 1500);
  }

  // Listen for messages from background or popup
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'USER_LOGGED_OUT') {
      sessionStorage.setItem('erp_just_logged_out', 'true');
      updateStatus('You have logged out of ERP.', false, false);
      showManualLoginButton();
    }
    if (message.action === 'OTP_FOUND' && message.otp) {
      handleOtpFound(message.otp);
    }
  });

  // Listen for storage changes (e.g. toggling Auto-login in Options or Popup)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.autoLogin !== undefined || changes.authCredentials) {
        chrome.storage.local.get(['authCredentials', 'autoLogin'], (res) => {
          const enabled = res.autoLogin !== undefined ? res.autoLogin : (res.authCredentials && res.authCredentials.autoLogin !== false);
          if (!enabled) {
            updateStatus('Auto-login disabled in General Behavior.', false, false);
            showManualLoginButton();
          }
        });
      }
    }
  });
})();
