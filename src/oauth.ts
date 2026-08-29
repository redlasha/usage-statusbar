/** usage-api.ts와 identity.ts가 각자 선언하던 OAuth 요청 헤더/타임아웃을 공용화한 것 */
export const OAUTH_REQUEST_TIMEOUT_MS = 3000; // statusline은 매 렌더 호출되므로 매달리면 안 된다

export function oauthFetch(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
    signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
  });
}
