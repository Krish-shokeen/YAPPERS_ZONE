/**
 * ChatError — a typed error for all chat system operations.
 *
 * Why this exists:
 *   Instead of scattering res.status(401).json({ error: '...' }) across every
 *   route and socket handler, we throw a ChatError anywhere something goes wrong.
 *   The route handler or socket handler catches it once and formats the response.
 *
 * Usage:
 *   throw new ChatError('AUTH_TOKEN_MISSING', 401, 'Firebase ID token is required');
 *
 * The caller then does:
 *   catch (err) {
 *     if (err instanceof ChatError) {
 *       return res.status(err.statusCode).json({ code: err.code, message: err.message });
 *     }
 *   }
 */
export class ChatError extends Error {
  /**
   * @param {string} code        - Machine-readable error code (e.g. 'AUTH_TOKEN_MISSING')
   * @param {number} statusCode  - HTTP status code to send (e.g. 401, 400, 403)
   * @param {string} message     - Human-readable description
   */
  constructor(code, statusCode, message) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
