const { google } = require('googleapis');
const { makeTextResponse } = require('./_shared');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPage(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #eef6ff; color: #0d1b2a; margin: 0; padding: 32px; }
  .card { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 20px; padding: 28px; box-shadow: 0 20px 60px rgba(49,130,206,0.16); }
  h1 { margin-top: 0; font-size: 28px; }
  pre { white-space: pre-wrap; word-break: break-word; background: #f7fbff; border: 1px solid #d1e9f7; border-radius: 14px; padding: 18px; }
  a { color: #2b6cb0; }
</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    ${body}
  </div>
</body>
</html>`;
}

function buildAuthUrl() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const scope = 'https://www.googleapis.com/auth/calendar';

  if (!clientId || !redirectUri) {
    return '';
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

exports.handler = async (event) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const code = event.queryStringParameters && event.queryStringParameters.code;

  if (!clientId || !clientSecret || !redirectUri) {
    return makeTextResponse(
      500,
      renderPage(
        'Google OAuth Not Configured',
        '<p>Set <strong>GOOGLE_CLIENT_ID</strong>, <strong>GOOGLE_CLIENT_SECRET</strong>, and <strong>GOOGLE_REDIRECT_URI</strong> in your environment, then retry.</p>'
      ),
      'text/html; charset=utf-8'
    );
  }

  if (!code) {
    const authUrl = buildAuthUrl();
    const body = authUrl
      ? `<p>Open the authorization URL below, approve access, and Google will redirect back here with your refresh token details.</p><p><a href="${escapeHtml(authUrl)}">${escapeHtml(authUrl)}</a></p><p>Use <code>prompt=consent</code> so Google returns a refresh token.</p>`
      : '<p>Unable to build the authorization URL because the Google OAuth environment variables are incomplete.</p>';

    return makeTextResponse(200, renderPage('Google OAuth Helper', body), 'text/html; charset=utf-8');
  }

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token || '';
    const accessToken = tokens.access_token || '';

    const body = [
      '<p>Copy the refresh token into <strong>GOOGLE_REFRESH_TOKEN</strong> in Netlify.</p>',
      '<p>If Google did not return a refresh token, revoke the app in your Google account and rerun the consent flow with <code>prompt=consent</code>.</p>',
      `<h2>Refresh Token</h2><pre>${escapeHtml(refreshToken || 'No refresh token was returned.')}</pre>`,
      '<h2>Access Token</h2><pre>' + escapeHtml(accessToken || 'No access token returned.') + '</pre>'
    ].join('');

    return makeTextResponse(200, renderPage('Google OAuth Complete', body), 'text/html; charset=utf-8');
  } catch (error) {
    console.error('google-auth-callback failed:', error);
    return makeTextResponse(
      500,
      renderPage(
        'OAuth Exchange Failed',
        `<p>Google did not exchange the authorization code successfully.</p><pre>${escapeHtml(error && error.message ? error.message : 'Unknown error')}</pre>`
      ),
      'text/html; charset=utf-8'
    );
  }
};