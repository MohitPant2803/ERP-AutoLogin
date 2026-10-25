/**
 * Popup Controller for IIT KGP ERP 1-Click Login.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // SVG Icon Templates
  const ICONS = {
    check: `<svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><polyline points="20 6 9 17 4 12"/></svg>`,
    refresh: `<svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2" fill="none"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    save: `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    trash: `<svg class="icon-svg" viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    logout: `<svg class="icon-svg" viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
  };

  // Elements
  const sessionStatusText = document.getElementById('session-status-text');
  const statusDot = document.getElementById('status-dot');
  const btnOneClickLogin = document.getElementById('btn-one-click-login');
  const loginBtnText = document.getElementById('login-btn-text');

  const progressBox = document.getElementById('login-progress-container');
  const progressStepTitle = document.getElementById('progress-step-title');
  const progressStepDesc = document.getElementById('progress-step-desc');

  const quickOtpBox = document.getElementById('quick-otp-container');
  const popupOtpInput = document.getElementById('popup-otp-input');
  const btnPasteOtp = document.getElementById('btn-paste-otp');
  const btnSubmitOtp = document.getElementById('btn-submit-otp');
  const otpTimerElem = document.getElementById('otp-timer');

  const credsToggle = document.getElementById('credentials-toggle');
  const credsChevron = document.getElementById('creds-chevron');
  const credsFormBody = document.getElementById('credentials-form-body');
  const credsSavedBadge = document.getElementById('creds-saved-badge');

  const inputRoll = document.getElementById('input-roll');
  const inputPassword = document.getElementById('input-password');
  const btnFetchQuestions = document.getElementById('btn-fetch-questions');

  const inputQ1 = document.getElementById('input-q1');
  const inputA1 = document.getElementById('input-a1');
  const inputQ2 = document.getElementById('input-q2');
  const inputA2 = document.getElementById('input-a2');
  const inputQ3 = document.getElementById('input-q3');
  const inputA3 = document.getElementById('input-a3');

  const toggleAutoLogin = document.getElementById('toggle-auto-login');
  const btnSaveCreds = document.getElementById('btn-save-creds');

  const btnOpenErp = document.getElementById('btn-open-erp');
  const btnClearSessions = document.getElementById('btn-clear-sessions');
  const btnLogout = document.getElementById('btn-logout');
  const btnOpenOptions = document.getElementById('btn-open-options');

  let countdownInterval = null;

  // 1. Check Session Status
  checkAndUpdateSession();

  // 2. Load Saved Credentials
  loadSavedCredentials();

  // 3. Sync with Background Login State
  syncBackgroundLoginState();

  // Toggle Credentials Accordion
  credsToggle.addEventListener('click', () => {
    const isCollapsed = credsFormBody.classList.toggle('hidden');
    credsChevron.classList.toggle('collapsed', isCollapsed);
  });

  // Check Session Status Function
  async function checkAndUpdateSession() {
    statusDot.className = 'status-dot loading';
    sessionStatusText.innerText = 'Checking...';
    try {
      const isAlive = await ErpApi.checkSessionAlive();
      if (isAlive) {
        statusDot.className = 'status-dot active';
        sessionStatusText.innerText = 'Logged In';
        loginBtnText.innerText = 'Open ERP Dashboard';
      } else {
        statusDot.className = 'status-dot';
        sessionStatusText.innerText = 'Not Logged In';
        loginBtnText.innerText = '1-Click Login to ERP';
      }
    } catch {
      statusDot.className = 'status-dot';
      sessionStatusText.innerText = 'Not Logged In';
      loginBtnText.innerText = '1-Click Login to ERP';
    }
  }

  // Auto-login toggle: updates IMMEDIATELY on change
  toggleAutoLogin.addEventListener('change', () => {
    const isAuto = toggleAutoLogin.checked;
    chrome.storage.local.get(['authCredentials'], (res) => {
      const creds = res.authCredentials || {};
      creds.autoLogin = isAuto;
      chrome.storage.local.set({ authCredentials: creds, autoLogin: isAuto }, () => {
        console.log('[Popup] Auto-login toggled immediately:', isAuto);
      });
    });
  });

  // Load Credentials & Google Status
  function loadSavedCredentials() {
    chrome.storage.local.get(['authCredentials', 'googleOAuth', 'autoLogin'], (res) => {
      const googlePill = document.getElementById('google-status-pill');
      if (googlePill) {
        if (res.googleOAuth && (res.googleOAuth.accessToken || res.googleOAuth.refreshToken)) {
          googlePill.style.color = '#4ade80';
          googlePill.innerText = `Connected (${res.googleOAuth.email || 'OAuth'})`;
        } else {
          googlePill.style.color = '#38bdf8';
          googlePill.innerText = 'Browser Session (Active)';
        }
      }

      const creds = res.authCredentials;
      const isAuto = res.autoLogin !== undefined ? res.autoLogin : (creds ? creds.autoLogin !== false : true);
      toggleAutoLogin.checked = isAuto;

      if (creds && creds.rollNumber && creds.password) {
        inputRoll.value = creds.rollNumber || '';
        inputPassword.value = creds.password || '';

        const qa = creds.qaPairs || [];
        if (qa[0]) { inputQ1.value = qa[0].question || ''; inputA1.value = qa[0].answer || ''; }
        if (qa[1]) { inputQ2.value = qa[1].question || ''; inputA2.value = qa[1].answer || ''; }
        if (qa[2]) { inputQ3.value = qa[2].question || ''; inputA3.value = qa[2].answer || ''; }

        credsSavedBadge.classList.remove('hidden');

        // Collapse by default if credentials already exist
        credsFormBody.classList.add('hidden');
        credsChevron.classList.add('collapsed');
      } else {
        // Expand by default if new user
        credsFormBody.classList.remove('hidden');
        credsChevron.classList.remove('collapsed');
        credsSavedBadge.classList.add('hidden');
      }
    });
  }

  // Fetch Questions from ERP
  btnFetchQuestions.addEventListener('click', async () => {
    const roll = inputRoll.value.trim().toUpperCase();
    if (!roll) {
      alert('Please enter your Roll Number first.');
      inputRoll.focus();
      return;
    }

    btnFetchQuestions.innerText = 'Fetching...';
    btnFetchQuestions.disabled = true;

    try {
      const questions = await ErpApi.fetchAllQuestions(roll, (foundList) => {
        if (foundList[0]) inputQ1.value = foundList[0];
        if (foundList[1]) inputQ2.value = foundList[1];
        if (foundList[2]) inputQ3.value = foundList[2];
      });

      if (questions.length === 0) {
        alert('Could not retrieve security questions. Please ensure your roll number is valid.');
      } else {
        btnFetchQuestions.innerHTML = `${ICONS.check} <span>Fetched ${questions.length}</span>`;
        setTimeout(() => {
          btnFetchQuestions.innerHTML = `${ICONS.refresh} <span>Fetch Qs</span>`;
          btnFetchQuestions.disabled = false;
        }, 2000);
      }
    } catch (err) {
      alert('Failed to fetch security questions: ' + err.message);
      btnFetchQuestions.innerHTML = `${ICONS.refresh} <span>Fetch Qs</span>`;
      btnFetchQuestions.disabled = false;
    }
  });

  // Save Credentials
  btnSaveCreds.addEventListener('click', async () => {
    const roll = inputRoll.value.trim().toUpperCase();
    const pwd = inputPassword.value;
    const q1 = inputQ1.value.trim();
    const a1 = inputA1.value.trim();
    const q2 = inputQ2.value.trim();
    const a2 = inputA2.value.trim();
    const q3 = inputQ3.value.trim();
    const a3 = inputA3.value.trim();

    if (!roll || !pwd) {
      alert('Please enter both Roll Number and ERP Password.');
      return;
    }

    if (!q1 || !a1) {
      alert('Please provide at least Question 1 and Answer 1.');
      return;
    }

    const qaPairs = [
      { question: q1, answer: a1 },
      { question: q2, answer: a2 },
      { question: q3, answer: a3 }
    ].filter(p => p.question && p.answer);

    const isAuto = toggleAutoLogin.checked;
    const creds = {
      rollNumber: roll,
      password: pwd,
      qaPairs: qaPairs,
      autoLogin: isAuto,
      requirePin: false
    };

    chrome.storage.local.set({ authCredentials: creds, autoLogin: isAuto }, () => {
      btnSaveCreds.innerHTML = `${ICONS.check} <span>Saved Successfully!</span>`;
      credsSavedBadge.classList.remove('hidden');
      setTimeout(() => {
        btnSaveCreds.innerHTML = `${ICONS.save} <span>Save Credentials</span>`;
        credsFormBody.classList.add('hidden');
        credsChevron.classList.add('collapsed');
      }, 1000);
    });
  });

  // 1-Click Login Trigger: Automatically opens ERP and carries out the login
  btnOneClickLogin.addEventListener('click', async () => {
    // Check credentials first
    const res = await chrome.storage.local.get(['authCredentials']);
    const creds = res.authCredentials;

    if (!creds || !creds.rollNumber || !creds.password) {
      credsFormBody.classList.remove('hidden');
      credsChevron.classList.remove('collapsed');
      alert('Please enter and save your credentials first.');
      return;
    }

    // Opens ERP tab directly where the automated login script will run
    chrome.tabs.query({}, (tabs) => {
      const erpTab = tabs && tabs.find(t => t.url && t.url.includes('erp.iitkgp.ac.in'));
      if (erpTab) {
        chrome.tabs.update(erpTab.id, { url: ErpApi.HOMEPAGE_URL, active: true }, () => {
          chrome.windows.update(erpTab.windowId, { focused: true });
        });
      } else {
        chrome.tabs.create({ url: ErpApi.HOMEPAGE_URL, active: true });
      }
      window.close(); // Close popup so user sees the ERP tab launching
    });
  });

  // Sync background state
  function syncBackgroundLoginState() {
    chrome.runtime.sendMessage({ action: 'GET_LOGIN_STATE' }, (res) => {
      if (res && res.state && res.state.inProgress) {
        handleStateUpdate(res.state);
      }
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'LOGIN_STATE_CHANGED' && message.state) {
        handleStateUpdate(message.state);
      }
    });
  }

  function handleStateUpdate(state) {
    if (!state) return;
    if (state.inProgress) {
      btnOneClickLogin.disabled = true;
      showProgress(getStepTitle(state.step), state.message || '');
      if (state.step === 'waiting_otp') {
        quickOtpBox.classList.remove('hidden');
        popupOtpInput.focus();
        startOtpCountdown();
      } else {
        quickOtpBox.classList.add('hidden');
      }
    } else {
      btnOneClickLogin.disabled = false;
      if (state.step === 'success') {
        showProgress('Success!', 'Logged into ERP', false);
        statusDot.className = 'status-dot active';
        sessionStatusText.innerText = 'Logged In';
        setTimeout(() => {
          progressBox.classList.add('hidden');
          quickOtpBox.classList.add('hidden');
        }, 2000);
      } else if (state.step === 'error') {
        showProgress('Login Error', state.message || 'Failed', true);
      }
    }
  }

  function getStepTitle(step) {
    switch (step) {
      case 'checking_session': return 'Checking ERP Session...';
      case 'session_token': return 'Acquiring Token...';
      case 'security_question': return 'Security Question...';
      case 'requesting_otp': return 'Requesting OTP...';
      case 'waiting_otp': return 'Waiting for OTP...';
      case 'signing_in': return 'Authenticating...';
      default: return 'Working...';
    }
  }

  function showProgress(title, desc, isError = false) {
    progressBox.classList.remove('hidden');
    progressStepTitle.innerText = title;
    progressStepDesc.innerText = desc;
    if (isError) {
      progressStepTitle.style.color = '#ef4444';
    } else {
      progressStepTitle.style.color = '#f1f5f9';
    }
  }

  function startOtpCountdown() {
    let s = 60;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      s--;
      if (otpTimerElem) otpTimerElem.innerText = `${s}s`;
      if (s <= 0) clearInterval(countdownInterval);
    }, 1000);
  }

  // Quick OTP Handlers
  btnPasteOtp.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const match = text.match(/\b\d{6}\b/);
      if (match) {
        popupOtpInput.value = match[0];
        submitOtp(match[0]);
      } else {
        alert('No 6-digit OTP found in clipboard');
      }
    } catch {
      alert('Clipboard access denied');
    }
  });

  btnSubmitOtp.addEventListener('click', () => {
    submitOtp(popupOtpInput.value);
  });

  popupOtpInput.addEventListener('input', (e) => {
    const val = e.target.value.replace(/\D/g, '');
    e.target.value = val;
    if (val.length === 6) {
      submitOtp(val);
    }
  });

  function submitOtp(val) {
    const code = (val || '').trim();
    if (!/^\d{6}$/.test(code)) {
      alert('Please enter a valid 6-digit OTP');
      return;
    }
    chrome.runtime.sendMessage({ action: 'SUBMIT_MANUAL_OTP', otp: code });
    quickOtpBox.classList.add('hidden');
    showProgress('Authenticating...', 'Submitting OTP (••••••)...');
  }

  // Footer Button Handlers
  btnOpenErp.addEventListener('click', () => {
    chrome.tabs.create({ url: ErpApi.HOMEPAGE_URL });
  });

  btnClearSessions.addEventListener('click', async () => {
    const res = await chrome.storage.local.get(['authCredentials']);
    const roll = res.authCredentials && res.authCredentials.rollNumber;
    if (!roll) {
      alert('Roll number is needed to clear sessions.');
      return;
    }
    btnClearSessions.innerText = 'Clearing...';
    chrome.runtime.sendMessage({ action: 'CLEAR_SESSIONS', rollNumber: roll }, (response) => {
      if (response && response.success) {
        alert('Successfully cleared active ERP sessions.');
      } else {
        alert('Failed to clear sessions.');
      }
      btnClearSessions.innerHTML = `${ICONS.trash} <span>Clear Sessions</span>`;
    });
  });

  btnLogout.addEventListener('click', async () => {
    btnLogout.innerText = 'Logging out...';
    await ErpApi.logout();
    checkAndUpdateSession();
    btnLogout.innerHTML = `${ICONS.logout} <span>Log Out</span>`;

    // Notify all open ERP tabs that user explicitly logged out
    chrome.tabs.query({}, (tabs) => {
      if (tabs) {
        tabs.forEach((t) => {
          if (t.url && (t.url.includes('erp.iitkgp.ac.in') || t.url.includes('SSOAdministration') || t.url.includes('IIT_ERP3'))) {
            chrome.tabs.sendMessage(t.id, { action: 'USER_LOGGED_OUT' }).catch(() => {});
          }
        });
      }
    });

    alert('Logged out from ERP.');
  });

  btnOpenOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
