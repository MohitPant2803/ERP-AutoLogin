# IIT KGP ERP 1-Click Login — Chrome Extension

An ultra-fast, secure, and modern Chrome Extension (Manifest V3) for IIT Kharagpur students that automates the entire ERP login process in **one single click** or a **single keyboard shortcut** (`Alt + Shift + L`).

Say goodbye to manually typing your roll number, password, answering security questions, or hunting for email OTPs every time you get logged out.

---

## Table of Contents
1. [Key Features](#-key-features)
2. [Step 1: Install in Chrome (Developer Mode)](#step-1-install-in-chrome-developer-mode)
3. [Step 2: Save Your ERP Credentials](#step-2-save-your-erp-credentials)
4. [Step 3: Setup Google OAuth for Automated OTP (Step-by-Step)](#step-3-setup-google-oauth-for-automated-otp-step-by-step)
   - [3.1 Create a Google Cloud Project](#31-create-a-google-cloud-project)
   - [3.2 Enable the Gmail API](#32-enable-the-gmail-api)
   - [3.3 Configure the OAuth Consent Screen](#33-configure-the-oauth-consent-screen)
   - [3.4 Create OAuth Client ID](#34-create-oauth-client-id)
   - [3.5 Connect Your Google Account in the Extension](#35-connect-your-google-account-in-the-extension)
5. [Step 4: Daily Usage (3 Ways to Log In)](#step-4-daily-usage-3-ways-to-log-in)
6. [Settings & General Behavior](#settings--general-behavior)
7. [Troubleshooting & FAQs](#troubleshooting--faqs)
8. [Privacy & Security Guarantee](#privacy--security-guarantee)

---

## 🚀 Key Features

- **1-Click Instant Login**: Log into IIT KGP ERP headlessly from the Chrome toolbar or directly on `erp.iitkgp.ac.in`.
- **Keyboard Shortcut**: Press `Alt + Shift + L` anywhere in Chrome to log in instantaneously.
- **Auto-Fetch Security Questions**: Automatically queries ERP to discover all 3 of your registered security questions in seconds so you only have to provide the answers once.
- **Fully Automated OTP via Gmail API**: Uses Google OAuth to automatically retrieve the 6-digit ERP OTP directly in the background without needing to check your inbox.
- **Automatic Session Conflict Recovery**: Handles ERP's infamous `"previous session is still active"` error automatically by invoking session clearance and retrying seamlessly.
- **Complete Privacy & Zero Password Exposure**: All passwords, answers, and OTPs remain strictly masked (`••••••`). Zero plain-text exposure anywhere.
- **100% Local & Private**: Runs strictly inside your browser. Your credentials are never sent to any external server.

---

## Step 1: Install in Chrome (Developer Mode)

Because this is a custom extension built for IIT KGP students, you install it using Chrome's built-in **Developer Mode**. This is completely safe and takes less than 30 seconds.

### 1.1 Download the Code
- If you have Git installed:
  ```bash
  git clone https://github.com/MohitPant2803/ERP-AutoLogin.git
  ```
- *Or* click the green **Code** button at the top of this GitHub page and click **Download ZIP**, then extract the ZIP file to a folder on your computer.

### 1.2 Open the Extensions Page in Chrome
1. Open Google Chrome.
2. In the URL address bar at the top, type:
   ```text
   chrome://extensions
   ```
   and press **Enter**.
3. *(Alternative: Click the three dots ⋮ in the top-right corner of Chrome $\rightarrow$ **Extensions** $\rightarrow$ **Manage Extensions**).*

### 1.3 Enable Developer Mode
Look at the **top-right corner** of the `chrome://extensions` page. You will see a toggle switch labeled **Developer mode**. 
- Turn that switch **ON** (it turns blue).

### 1.4 Load the Extension
Once Developer mode is ON, three new buttons appear in the top-left corner:
1. Click the button labeled **Load unpacked**.
2. A folder picker window will open.
3. Browse to the downloaded folder and select the **`extension`** folder (or the root project folder containing `manifest.json`).
4. Click **Select Folder**.

### 1.5 Pin to Toolbar
1. Click the **puzzle piece icon** (🧩) in the top-right corner of Chrome's toolbar.
2. Find **ERP 1-Click Login** in the list.
3. Click the **Pin** icon next to it so it stays visible in your toolbar.

---

## Step 2: Save Your ERP Credentials

Setting up takes only 1 minute and you only do this once.

1. Click the **ERP 1-Click Login** icon in your Chrome toolbar.
2. Under **Saved Credentials**, enter your **Roll Number** (e.g. `21CS10001` or `23EE10045`).
3. Click the **Fetch Qs** button:
   - The extension automatically contacts the ERP portal to retrieve your 3 registered security questions.
4. Enter your **ERP Password**.
5. Enter the answers to your 3 registered questions.
6. Click **Save Credentials**.

> **Privacy Note**: Your password and answers are stored securely in your browser's local sandbox storage (`chrome.storage.local`). They are never displayed in plain text and never sent to any remote server.

---

## Step 3: Setup Google OAuth for Automated OTP (Step-by-Step)

IIT KGP ERP requires a 6-digit Email OTP for every login. By setting up Google OAuth, the extension can automatically and securely read incoming ERP OTP emails directly via the Gmail API in the background.

> If you have never used Google Cloud before, don't worry! Just follow these exact steps. It only takes about 3 minutes.

### 3.1 Create a Google Cloud Project
1. Open your browser and go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Log in with your Google account (the Gmail address where your ERP OTPs are received, e.g. your personal Gmail or your `@kgpian.iitkgp.ac.in` account).
3. At the very top bar, click the project dropdown menu next to the "Google Cloud" logo (it may say "Select a project").
4. In the window that pops up, click **NEW PROJECT** in the top-right corner.
5. In **Project name**, type: `ERP-AutoLogin`.
6. Click **CREATE** and wait a few seconds for Google to create the project.
7. Click the top dropdown menu again and select your newly created **ERP-AutoLogin** project.

### 3.2 Enable the Gmail API
1. In the search box at the top of the Google Cloud Console, type **Gmail API**.
2. Click on **Gmail API** in the search results.
3. Click the blue **ENABLE** button.

### 3.3 Configure the OAuth Consent Screen
1. In the left navigation menu, go to **APIs & Services** $\rightarrow$ **OAuth consent screen** (or search "OAuth consent screen" in the search box).
2. Under **User Type**, select **External**, then click **CREATE**.
3. In the form that appears:
   - **App name**: `ERP AutoLogin`
   - **User support email**: Select your email address from the dropdown.
   - Scroll down to the bottom to **Developer contact information**: Type your email address.
4. Click **SAVE AND CONTINUE**.
5. On the **Scopes** page: Click **SAVE AND CONTINUE** (no changes needed).
6. On the **Test users** page:
   - Click **+ ADD USERS**.
   - Type your Gmail address (the one that receives your ERP OTPs).
   - Click **ADD**.
7. Click **SAVE AND CONTINUE**, then click **BACK TO DASHBOARD**.

### 3.4 Create OAuth Client ID
1. In the left navigation menu, click **Credentials**.
2. At the top of the page, click **+ CREATE CREDENTIALS** $\rightarrow$ **OAuth client ID**.
3. In **Application type**, select **Web application** from the dropdown.
4. In **Name**, type: `ERP Extension Client`.
5. Under **Authorized redirect URIs**, click **+ ADD URI**.
6. Now get your extension's unique redirect URI:
   - In Chrome, click the **ERP 1-Click Login** toolbar icon $\rightarrow$ click the gear icon (⚙️) at the bottom to open **Settings**.
   - In Settings, look on the right side under **Method 4: Direct Google OAuth & Gmail API**.
   - You will see your **OAuth Redirect URI** (looks like: `https://<extension-id>.chromiumapp.org/`).
   - Click the **Copy** button next to it.
7. Go back to Google Cloud Console and paste that URI into the **Authorized redirect URIs** field.
8. Click **CREATE**.
9. A popup window will appear showing your **Client ID** (a long string ending in `.apps.googleusercontent.com`). Copy this Client ID!

### 3.5 Connect Your Google Account in the Extension
1. Go back to the extension **Settings** page (`options.html`).
2. Paste your copied **Client ID** into the **Google OAuth Client ID** field.
3. Click **Connect Google Account**.
4. A Google sign-in window will open:
   - Choose your Google account.
   - If Google displays a screen saying *"Google hasn't verified this app"*, click **Advanced** $\rightarrow$ **Go to ERP AutoLogin (unsafe)**. (This is normal because you created this app yourself for your own use).
   - Click **Continue** / **Allow** to give the extension permission to read your incoming OTP emails.
5. You will see a green badge saying **Connected as your-email@gmail.com**.

**Setup is complete!** The extension can now fetch your ERP OTPs in the background automatically.

---

## Step 4: Daily Usage (3 Ways to Log In)

Once configured, logging into ERP is completely effortless:

| Method | How to Do It |
| :--- | :--- |
| **Toolbar 1-Click** | Click the extension icon in your Chrome toolbar $\rightarrow$ click **1-Click Login to ERP**. |
| **Keyboard Shortcut** | Press **`Alt + Shift + L`** anywhere in Chrome. |
| **Direct Page Visit** | Simply visit [erp.iitkgp.ac.in](https://erp.iitkgp.ac.in/IIT_ERP3/). The extension detects the login page, enters credentials, answers the security challenge, retrieves the OTP, and completes authentication automatically. |

---

## Settings & General Behavior

Open Settings anytime by right-clicking the extension icon $\rightarrow$ **Options**, or clicking the gear icon (⚙️) in the popup.

### Symmetrical Layout
- **Left Column**:
  - **ERP Credentials**: Update your roll number, password, and registered security questions.
  - **General Behavior**: 
    - *Auto-Login on Page Visit*: When turned ON, visiting `erp.iitkgp.ac.in` automatically triggers the login sequence. When turned OFF, login only happens when you click the 1-Click button or press the keyboard shortcut.
    - *Keyboard Shortcut reminder*: `Alt + Shift + L`.
  - **Encryption & PIN Security (Optional)**: Protect your saved credentials with an optional 4-digit PIN using AES-GCM 256-bit encryption.
- **Right Column**:
  - **Automated OTP Handling**: Manage your Google OAuth connection.
  - **Backup & Diagnostics**: Export or import your saved configuration as a backup file, or clear existing ERP active sessions with one click.

### Test Connection
Click the **Test Connection** button at the top-right of the Settings page anytime:
- Verifies reachability of the IIT KGP ERP servers and checks session validity.
- Displays a clean floating status popup at the top of the screen confirming success or diagnosing failures without cluttering the screen.

---

## Troubleshooting & FAQs

### Q1: ERP says "Previous session is still active"?
ERP only permits one active session per roll number. If you closed a tab without logging out, ERP blocks you.
- **Fix**: The extension automatically detects this error and clears ghost sessions for you! You can also click **Clear Sessions** in the extension popup anytime.

### Q2: Is my password visible on screen?
No. All password inputs, answers, and OTP fields are strictly masked with bullets (`••••••`). The extension has removed all show-password eye icons and disabled browser reveal features so your credentials remain confidential.

### Q3: Why does ERP pause auto-login when I click Logout?
To prevent an infinite login loop! When you deliberately click "Logout" on the ERP portal, the extension detects this and temporarily pauses auto-login, showing a manual "1-Click Login to ERP" button so you can re-login whenever you are ready.

---

## Privacy & Security Guarantee

- **No Remote Telemetry**: Zero external tracking, analytics, or third-party servers.
- **Local Storage Only**: All information is stored in Chrome's sandboxed `chrome.storage.local`.
- **Zero Cleartext Logging**: Passwords, OTP codes, and security answers are never outputted in plain text to logs or screen badges.
- **Open Source**: All source code is completely inspectable.

---

## License

MIT License. Designed with ❤️ for the IIT Kharagpur student community.
