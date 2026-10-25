"""
Local Python OTP Helper Server for IIT KGP ERP 1-Click Login Extension.
Uses the Gmail API to listen for ERP OTP emails and serves them to the Chrome Extension over http://127.0.0.1:5000/otp.
Derived from iitkgp-erp-login-pypi.
"""

import os
import sys
import time
import base64
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

PORT = 5000
SUBJECT = "OTP for Sign In in ERP Portal of IIT Kharagpur"
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

def get_gmail_service():
    """Authenticates and returns the Gmail API service instance."""
    creds = None
    token_path = os.path.join(os.path.dirname(__file__), "token.json")
    credentials_path = os.path.join(os.path.dirname(__file__), "credentials.json")

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(credentials_path):
                print(f"[!] credentials.json not found in {os.path.dirname(__file__)}")
                print("[!] Download credentials.json from Google Cloud Console (Gmail API enabled)")
                return None
            flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(token_path, "w") as token:
            token.write(creds.to_json())

    return build("gmail", "v1", credentials=creds)

def fetch_latest_erp_otp():
    """Fetches the latest ERP OTP code from Gmail."""
    try:
        service = get_gmail_service()
        if not service:
            return None

        query = f'subject:"{SUBJECT}"'
        results = service.users().messages().list(userId="me", q=query, maxResults=1).execute()
        messages = results.get("messages", [])

        if not messages:
            return None

        msg = service.users().messages().get(userId="me", id=messages[0]["id"]).execute()
        
        # Check snippet or payload
        snippet = msg.get("snippet", "")
        body_text = snippet

        if "payload" in msg and "body" in msg["payload"] and "data" in msg["payload"]["body"]:
            data = msg["payload"]["body"]["data"]
            decoded = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
            body_text += " " + decoded

        # Extract digits
        parts = [p for p in body_text.split() if p.isdigit() and len(p) == 6]
        if parts:
            return parts[-1]
        
        # Regex search for 6 digit sequence
        import re
        matches = re.findall(r'\b\d{6}\b', body_text)
        if matches:
            return matches[-1]

        return None
    except Exception as e:
        print(f"[!] Error reading OTP from Gmail: {e}")
        return None

class OtpRequestHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        if self.path.startswith("/otp"):
            otp = fetch_latest_erp_otp()
            response = {
                "status": "success" if otp else "waiting",
                "otp": otp,
                "timestamp": int(time.time())
            }
        else:
            response = {"status": "ok", "message": "IIT KGP ERP OTP Helper Running"}

        self.wfile.write(json.dumps(response).encode("utf-8"))

    def log_message(self, format, *args):
        # Concise logging
        print(f"[HTTP] {self.address_string()} - {format % args}")

def run_server():
    server_address = ("127.0.0.1", PORT)
    httpd = HTTPServer(server_address, OtpRequestHandler)
    print("=" * 60)
    print(f"🚀 IIT KGP ERP OTP Helper Server running on http://127.0.0.1:{PORT}")
    print(f"👉 Chrome Extension can read OTP from http://127.0.0.1:{PORT}/otp")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down helper server.")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
