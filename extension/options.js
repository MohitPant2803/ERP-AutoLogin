/**
 * Options Controller for IIT KGP ERP 1-Click Login.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // SVG Icon Templates
  const ICONS = {
    copy: `<svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    check: `<svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="20 6 9 17 4 12"/></svg>`,
    key: `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 2l-2 2m-1.5 1.5L14 9l-1.5-1.5-3 3L11 12l-7 7a2 2 0 0 0 0 3 2 2 0 0 0 3 0l7-7 1.5 1.5 3-3-1.5-1.5 3.5-3.5a2 2 0 0 0 0-2.83l-1.67-1.67a2 2 0 0 0-2.83 0z"/></svg>`,
    refresh: `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    save: `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    test: `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    trash: `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`
  };

  // Elements
  const optRoll = document.getElementById('opt-roll');
  const optPassword = document.getElementById('opt-password');
  const optBtnFetchQs = document.getElementById('opt-btn-fetch-qs');

  const optQ1 = document.getElementById('opt-q1');
  const optA1 = document.getElementById('opt-a1');
  const optQ2 = document.getElementById('opt-q2');
  const optA2 = document.getElementById('opt-a2');
  const optQ3 = document.getElementById('opt-q3');
  const optA3 = document.getElementById('opt-a3');

  const optTogglePin = document.getElementById('opt-toggle-pin');
  const pinContainer = document.getElementById('pin-input-container');
  const optPin = document.getElementById('opt-pin');

  const optScanMailTabs = document.getElementById('opt-scan-mail-tabs');
  const optScanClipboard = document.getElementById('opt-scan-clipboard');
  const optUseLocalServer = document.getElementById('opt-use-local-server');
  const localServerSettings = document.getElementById('local-server-settings');
  const optLocalServerUrl = document.getElementById('opt-local-server-url');
  const btnTestLocalServer = document.getElementById('btn-test-local-server');

  // Google OAuth Elements
  const optOauthRedirectUri = document.getElementById('opt-oauth-redirect-uri');
  const btnCopyRedirectUri = document.getElementById('btn-copy-redirect-uri');
  const optGoogleClientId = document.getElementById('opt-google-client-id');
  const optGoogleClientSecret = document.getElementById('opt-google-client-secret');
  const btnConnectGoogle = document.getElementById('btn-connect-google');
  const btnImportTokenJson = document.getElementById('btn-import-token-json');
  const fileTokenJson = document.getElementById('file-token-json');
  const btnTestGmailApi = document.getElementById('btn-test-gmail-api');
  const btnDisconnectGoogle = document.getElementById('btn-disconnect-google');
  const googleConnStatus = document.getElementById('google-conn-status');
  const gmailTestResult = document.getElementById('gmail-test-result');

  const optAutoLogin = document.getElementById('opt-auto-login');

  const btnSaveAll = document.getElementById('btn-save-all');
  const btnHeaderTest = document.getElementById('btn-header-test');

  const btnExportCreds = document.getElementById('btn-export-creds');
  const btnImportCreds = document.getElementById('btn-import-creds');
  const fileImportInput = document.getElementById('file-import-input');
  const btnClearSessionsOpt = document.getElementById('btn-clear-sessions-opt');
  const diagnosticsLog = document.getElementById('diagnostics-log');

  // Display Extension Redirect URI for Google Cloud Console setup
  if (optOauthRedirectUri) {
    optOauthRedirectUri.value = GmailOtp.getRedirectUrl();
  }

  // Load existing settings
  loadSettings();
  loadGoogleAuthStatus();

  // Copy redirect URI
  if (btnCopyRedirectUri) {
    btnCopyRedirectUri.addEventListener('click', () => {
      navigator.clipboard.writeText(optOauthRedirectUri.value);
      btnCopyRedirectUri.innerHTML = `${ICONS.check} <span>Copied!</span>`;
      setTimeout(() => {
        btnCopyRedirectUri.innerHTML = `${ICONS.copy} <span>Copy</span>`;
      }, 2000);
    });
  }

  // General Behavior: Auto-Login toggle - saves IMMEDIATELY on change
  optAutoLogin.addEventListener('change', () => {
    const isAuto = optAutoLogin.checked;
    chrome.storage.local.get(['authCredentials'], (res) => {
      const creds = res.authCredentials || {};
      creds.autoLogin = isAuto;
      chrome.storage.local.set({ authCredentials: creds, autoLogin: isAuto }, () => {
        console.log(`[Options] General Behavior autoLogin set to: ${isAuto}`);
      });
    });
  });

  // Method 1: Scan mail tabs - saves immediately on change
  optScanMailTabs.addEventListener('change', () => {
    chrome.storage.local.get(['otpSettings'], (res) => {
      const otp = res.otpSettings || {};
      otp.scanMailTabs = optScanMailTabs.checked;
      chrome.storage.local.set({ otpSettings: otp });
    });
  });

  // Method 2: Scan clipboard - saves immediately on change
  optScanClipboard.addEventListener('change', () => {
    chrome.storage.local.get(['otpSettings'], (res) => {
      const otp = res.otpSettings || {};
      otp.scanClipboard = optScanClipboard.checked;
      chrome.storage.local.set({ otpSettings: otp });
    });
  });

  // PIN toggle visibility
  optTogglePin.addEventListener('change', () => {
    pinContainer.classList.toggle('hidden', !optTogglePin.checked);
  });

  // Local helper toggle
  optUseLocalServer.addEventListener('change', () => {
    localServerSettings.classList.toggle('hidden', !optUseLocalServer.checked);
    chrome.storage.local.get(['otpSettings'], (res) => {
      const otp = res.otpSettings || {};
      otp.useLocalServer = optUseLocalServer.checked;
      chrome.storage.local.set({ otpSettings: otp });
    });
  });

  // Load settings from chrome storage
  function loadSettings() {
    chrome.storage.local.get(['authCredentials', 'otpSettings', 'autoLogin'], (res) => {
      const creds = res.authCredentials;
      const isAuto = res.autoLogin !== undefined ? res.autoLogin : (creds ? creds.autoLogin !== false : true);
      optAutoLogin.checked = isAuto;

      if (creds) {
        optRoll.value = creds.rollNumber || '';
        optPassword.value = creds.password || '';
        optTogglePin.checked = creds.requirePin || false;
        pinContainer.classList.toggle('hidden', !creds.requirePin);

        const qa = creds.qaPairs || [];
        if (qa[0]) { optQ1.value = qa[0].question || ''; optA1.value = qa[0].answer || ''; }
        if (qa[1]) { optQ2.value = qa[1].question || ''; optA2.value = qa[1].answer || ''; }
        if (qa[2]) { optQ3.value = qa[2].question || ''; optA3.value = qa[2].answer || ''; }
      }

      const otp = res.otpSettings || {};
      optScanMailTabs.checked = otp.scanMailTabs !== false;
      optScanClipboard.checked = otp.scanClipboard !== false;
      optUseLocalServer.checked = otp.useLocalServer || false;
      localServerSettings.classList.toggle('hidden', !otp.useLocalServer);
      if (otp.localServerUrl) optLocalServerUrl.value = otp.localServerUrl;
    });
  }

  // Load Google Auth Status
  function loadGoogleAuthStatus() {
    chrome.storage.local.get(['googleOAuth'], (res) => {
      const auth = res.googleOAuth;
      if (auth && (auth.accessToken || auth.refreshToken)) {
        if (googleConnStatus) {
          googleConnStatus.style.background = 'rgba(34, 197, 94, 0.2)';
          googleConnStatus.style.color = '#4ade80';
          googleConnStatus.innerText = `Connected (${auth.email || 'Google User'})`;
        }
        if (optGoogleClientId && auth.clientId) optGoogleClientId.value = auth.clientId;
        if (optGoogleClientSecret && auth.clientSecret) optGoogleClientSecret.value = auth.clientSecret;
        if (btnDisconnectGoogle) btnDisconnectGoogle.classList.remove('hidden');
        if (btnConnectGoogle) {
          btnConnectGoogle.innerHTML = `${ICONS.refresh} <span>Re-authorize Google</span>`;
        }
      } else {
        if (googleConnStatus) {
          googleConnStatus.style.background = 'rgba(100, 116, 139, 0.3)';
          googleConnStatus.style.color = '#94a3b8';
          googleConnStatus.innerText = 'Not Connected';
        }
        if (btnDisconnectGoogle) btnDisconnectGoogle.classList.add('hidden');
        if (btnConnectGoogle) {
          btnConnectGoogle.innerHTML = `${ICONS.key} <span>Connect with Google</span>`;
        }
      }
    });
  }

  // Connect with Google Button
  if (btnConnectGoogle) {
    btnConnectGoogle.addEventListener('click', async () => {
      const clientId = optGoogleClientId.value.trim();
      const clientSecret = optGoogleClientSecret.value.trim();

      if (!clientId) {
        alert('Please enter your Google OAuth 2.0 Client ID.\n\nTo get one:\n1. Go to console.cloud.google.com\n2. Enable Gmail API\n3. Create OAuth Client ID (Web Application)\n4. Add Extension Redirect URI to Authorized redirect URIs.');
        optGoogleClientId.focus();
        return;
      }

      btnConnectGoogle.innerText = 'Connecting...';
      btnConnectGoogle.disabled = true;

      try {
        const result = await GmailOtp.startAuthFlow(clientId, clientSecret);
        alert(`Successfully connected to Google Account: ${result.email || 'Authorized'}!\nAutonomous OTP fetching via Gmail API is now active.`);
        loadGoogleAuthStatus();
      } catch (err) {
        alert('Google Sign-in failed: ' + err.message);
      } finally {
        btnConnectGoogle.disabled = false;
        loadGoogleAuthStatus();
      }
    });
  }

  // Import token.json or credentials.json
  if (btnImportTokenJson) {
    btnImportTokenJson.addEventListener('click', () => {
      fileTokenJson.click();
    });
  }

  if (fileTokenJson) {
    fileTokenJson.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = JSON.parse(event.target.result);
          const result = await GmailOtp.importJsonCredentials(json);
          alert(`Successfully imported Google credentials!\nAccount: ${result.email || 'Configured'}`);
          loadGoogleAuthStatus();
        } catch (err) {
          alert('Failed to import JSON: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // Test Gmail Connection Button
  if (btnTestGmailApi) {
    btnTestGmailApi.addEventListener('click', async () => {
      btnTestGmailApi.innerText = 'Testing...';
      btnTestGmailApi.disabled = true;
      gmailTestResult.innerHTML = '<span style="color: #38bdf8;">Querying Gmail API...</span>';

      try {
        const testRes = await GmailOtp.testConnection();
        gmailTestResult.innerHTML = `
          <div style="color: #4ade80; margin-top: 6px;">
            Connected to <strong>${testRes.email}</strong>!<br>
            • Total emails in account: ${testRes.totalMessages}<br>
            • Found recent IIT KGP ERP emails: <strong>${testRes.recentErpMessagesFound}</strong><br>
            Autonomous OTP resolution is ready.
          </div>
        `;
      } catch (err) {
        gmailTestResult.innerHTML = `<span style="color: #f87171;">Connection failed: ${err.message}</span>`;
      } finally {
        btnTestGmailApi.innerHTML = `${ICONS.test} <span>Test Gmail</span>`;
        btnTestGmailApi.disabled = false;
      }
    });
  }

  // Disconnect Google Button
  if (btnDisconnectGoogle) {
    btnDisconnectGoogle.addEventListener('click', async () => {
      if (confirm('Disconnect your Google account from the extension?')) {
        await chrome.storage.local.remove(['googleOAuth']);
        gmailTestResult.innerText = '';
        loadGoogleAuthStatus();
        alert('Google account disconnected.');
      }
    });
  }

  // Fetch Questions from ERP
  optBtnFetchQs.addEventListener('click', async () => {
    const roll = optRoll.value.trim().toUpperCase();
    if (!roll) {
      alert('Please enter your Roll Number first.');
      optRoll.focus();
      return;
    }

    optBtnFetchQs.innerText = 'Querying ERP...';
    optBtnFetchQs.disabled = true;

    try {
      const questions = await ErpApi.fetchAllQuestions(roll, (foundList) => {
        if (foundList[0]) optQ1.value = foundList[0];
        if (foundList[1]) optQ2.value = foundList[1];
        if (foundList[2]) optQ3.value = foundList[2];
      });

      if (questions.length === 0) {
        alert('Could not retrieve security questions. Please ensure your roll number is correct.');
      } else {
        optBtnFetchQs.innerHTML = `${ICONS.check} <span>Fetched ${questions.length} Questions</span>`;
        setTimeout(() => {
          optBtnFetchQs.innerHTML = `${ICONS.refresh} <span>Fetch Questions</span>`;
          optBtnFetchQs.disabled = false;
        }, 2500);
      }
    } catch (err) {
      alert('Failed to fetch security questions: ' + err.message);
      optBtnFetchQs.innerHTML = `${ICONS.refresh} <span>Fetch Questions</span>`;
      optBtnFetchQs.disabled = false;
    }
  });

  // Save All Settings
  btnSaveAll.addEventListener('click', async () => {
    const roll = optRoll.value.trim().toUpperCase();
    let pwd = optPassword.value;
    const q1 = optQ1.value.trim();
    let a1 = optA1.value.trim();
    const q2 = optQ2.value.trim();
    let a2 = optA2.value.trim();
    const q3 = optQ3.value.trim();
    let a3 = optA3.value.trim();

    if (!roll || !pwd) {
      alert('Please enter both your Roll Number and ERP Password.');
      return;
    }

    const requirePin = optTogglePin.checked;
    const pin = optPin.value.trim();

    if (requirePin && (!pin || pin.length < 4)) {
      alert('Please enter a PIN of at least 4 digits to enable PIN encryption.');
      optPin.focus();
      return;
    }

    // Encrypt if PIN is enabled
    if (requirePin) {
      try {
        pwd = await CryptoUtil.encrypt(pwd, pin);
        if (a1) a1 = await CryptoUtil.encrypt(a1, pin);
        if (a2) a2 = await CryptoUtil.encrypt(a2, pin);
        if (a3) a3 = await CryptoUtil.encrypt(a3, pin);
      } catch (err) {
        alert('Encryption failed: ' + err.message);
        return;
      }
    }

    const qaPairs = [
      { question: q1, answer: a1 },
      { question: q2, answer: a2 },
      { question: q3, answer: a3 }
    ].filter(p => p.question && p.answer);

    const authCredentials = {
      rollNumber: roll,
      password: pwd,
      qaPairs: qaPairs,
      autoLogin: optAutoLogin.checked,
      requirePin: requirePin
    };

    const otpSettings = {
      scanMailTabs: optScanMailTabs.checked,
      scanClipboard: optScanClipboard.checked,
      useLocalServer: optUseLocalServer.checked,
      localServerUrl: optLocalServerUrl.value.trim()
    };

    const autoLogin = optAutoLogin.checked;
    chrome.storage.local.set({ authCredentials, otpSettings, autoLogin }, () => {
      btnSaveAll.innerHTML = `${ICONS.check} <span>Settings Saved!</span>`;
      showTopPopup('Settings Saved Successfully!', 'Your ERP credentials and automation settings have been stored securely.', 'success', 3500);
      setTimeout(() => {
        btnSaveAll.innerHTML = `${ICONS.save} <span>Save Settings</span>`;
      }, 1500);
    });
  });

  // Top Popup Toast Utility
  let topPopupTimer = null;

  function showTopPopup(title, desc, type = 'success', duration = 4000) {
    if (topPopupTimer) clearTimeout(topPopupTimer);

    const topPopup = document.getElementById('top-popup');
    const topPopupIcon = document.getElementById('top-popup-icon');
    const topPopupTitle = document.getElementById('top-popup-title');
    const topPopupDesc = document.getElementById('top-popup-desc');

    if (!topPopup) return;

    topPopup.className = `top-popup ${type}`;
    topPopupTitle.innerText = title;
    topPopupDesc.innerText = desc || '';

    if (type === 'success') {
      topPopupIcon.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      topPopupIcon.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
      topPopupIcon.innerHTML = `<svg class="icon-svg spinner" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>`;
    }

    if (duration > 0) {
      topPopupTimer = setTimeout(() => {
        hideTopPopup();
      }, duration);
    }
  }

  function hideTopPopup() {
    if (topPopupTimer) clearTimeout(topPopupTimer);
    const topPopup = document.getElementById('top-popup');
    if (topPopup) topPopup.classList.add('hidden');
  }

  const topPopupClose = document.getElementById('top-popup-close');
  if (topPopupClose) {
    topPopupClose.addEventListener('click', hideTopPopup);
  }

  // Test local server
  btnTestLocalServer.addEventListener('click', async () => {
    btnTestLocalServer.innerText = 'Testing...';
    const url = optLocalServerUrl.value.trim();
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        showTopPopup('Helper Server Connected!', `Server at ${url} is running and responding.`, 'success', 4000);
      } else {
        showTopPopup('Helper Server Error', `Server responded with HTTP ${res.status}`, 'error', 4500);
      }
    } catch (err) {
      showTopPopup('Connection Failed', `Could not connect to helper server at ${url}. Ensure Python companion is running.`, 'error', 5000);
    } finally {
      btnTestLocalServer.innerText = 'Test Server Connection';
    }
  });

  // Test Connection: Only a success or fail message appears on top as popup
  btnHeaderTest.addEventListener('click', async () => {
    const originalContent = btnHeaderTest.innerHTML;
    btnHeaderTest.disabled = true;
    btnHeaderTest.innerHTML = `<svg class="icon-svg spinner" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg> <span>Testing...</span>`;

    showTopPopup('Testing Connection...', 'Connecting to IIT KGP ERP portal...', 'info', 0);

    try {
      // 1. Test Homepage reachability & session token
      const token = await ErpApi.getSessionToken();
      
      // 2. Test Session status
      const isAlive = await ErpApi.checkSessionAlive();

      const roll = optRoll ? optRoll.value.trim() : '';
      let extra = '';
      if (roll) {
        try {
          const q = await ErpApi.getSecurityQuestion(roll);
          if (q) extra = ' Security question service responding.';
        } catch {}
      }

      const statusDetail = isAlive ? 'Active session found (Logged In).' : 'ERP portal is online and responsive.';
      showTopPopup('Connection Successful!', `${statusDetail}${extra}`, 'success', 4500);
    } catch (err) {
      console.error('Test Connection error:', err);
      showTopPopup('Connection Failed', err.message || 'Could not reach ERP portal. Please verify your internet or ERP availability.', 'error', 5500);
    } finally {
      btnHeaderTest.disabled = false;
      btnHeaderTest.innerHTML = originalContent;
    }
  });

  function logDiagnostic(msg) {
    diagnosticsLog.innerText += `${new Date().toLocaleTimeString()} ${msg}\n`;
    diagnosticsLog.scrollTop = diagnosticsLog.scrollHeight;
  }

  // Export Credentials
  btnExportCreds.addEventListener('click', () => {
    chrome.storage.local.get(['authCredentials', 'otpSettings', 'googleOAuth'], (res) => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(res, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', 'erp_login_config_backup.json');
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  });

  // Import Credentials
  btnImportCreds.addEventListener('click', () => {
    fileImportInput.click();
  });

  fileImportInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (imported.authCredentials) {
          chrome.storage.local.set(imported, () => {
            alert('Successfully imported credentials backup.');
            loadSettings();
            loadGoogleAuthStatus();
          });
        } else {
          alert('Invalid backup file format.');
        }
      } catch (err) {
        alert('Failed to parse JSON backup file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // Clear Sessions from Options
  btnClearSessionsOpt.addEventListener('click', async () => {
    const roll = optRoll.value.trim().toUpperCase();
    if (!roll) {
      alert('Please enter your roll number first.');
      return;
    }
    btnClearSessionsOpt.innerText = 'Clearing...';
    const success = await ErpApi.clearAllSessions(roll);
    btnClearSessionsOpt.innerHTML = `${ICONS.trash} <span>Clear Sessions</span>`;
    if (success) {
      alert(`Successfully cleared active ERP sessions for ${roll}.`);
    } else {
      alert('Failed to clear sessions.');
    }
  });
});
