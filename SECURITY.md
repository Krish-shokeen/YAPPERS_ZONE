# Security Policy

## 🔒 Sensitive Files

The following files contain sensitive information and are excluded from version control:

### Backend
- `.env` - Environment variables with credentials
- `serviceAccountKey.json` - Firebase service account private key
- `accountkey.json` - Alternative service account key name
- `node_modules/` - Dependencies

### Frontend
- `.env` - Environment variables
- `node_modules/` - Dependencies

## ⚠️ Important Security Notes

### 1. Environment Variables
Never commit `.env` files to version control. Always use `.env.example` as a template.

**Sensitive variables:**
- `MONGODB_URI` - Contains database credentials
- `FIREBASE_PRIVATE_KEY` - Firebase service account private key
- `JWT_SECRET` - Secret for signing JWT tokens

### 2. Firebase Service Account Key
The `serviceAccountKey.json` file contains highly sensitive credentials:
- Never commit this file
- Never share it publicly
- Store it securely
- Rotate keys if compromised

### 3. Firebase Client Configuration
The Firebase client configuration (API key, auth domain, etc.) in the frontend is **safe to expose**. These are public identifiers meant for client-side use and are protected by Firebase security rules.

### 4. MongoDB Credentials
- Use strong passwords
- Enable IP whitelisting in MongoDB Atlas
- Use connection strings with authentication
- Rotate credentials regularly

### 5. JWT Secrets
- Use strong, random secrets (minimum 32 characters)
- Different secrets for development and production
- Never use default or example secrets in production

## 🛡️ Best Practices

1. **Use Environment Variables**: All secrets should be in `.env` files
2. **Verify .gitignore**: Ensure sensitive files are listed
3. **Regular Audits**: Run `npm audit` regularly
4. **Update Dependencies**: Keep packages up to date
5. **HTTPS Only**: Use HTTPS in production
6. **CORS Configuration**: Restrict to specific origins
7. **Rate Limiting**: Implement rate limiting on API endpoints

## 🚨 If Credentials Are Compromised

If you accidentally commit sensitive information:

1. **Immediately rotate all credentials:**
   - Generate new Firebase service account key
   - Change MongoDB password
   - Generate new JWT secret

2. **Remove from Git history:**
   ```bash
   git filter-branch --force --index-filter \
   "git rm --cached --ignore-unmatch path/to/sensitive/file" \
   --prune-empty --tag-name-filter cat -- --all
   ```

3. **Force push (if safe to do so):**
   ```bash
   git push origin --force --all
   ```

4. **Notify team members** to pull the cleaned repository

## 📋 Security Checklist Before Deployment

- [ ] All `.env` files are in `.gitignore`
- [ ] Service account keys are not committed
- [ ] Strong JWT secret is set
- [ ] MongoDB has IP whitelisting enabled
- [ ] CORS is configured for production domain
- [ ] HTTPS is enabled
- [ ] Rate limiting is implemented
- [ ] Dependencies are up to date
- [ ] Security headers are configured

## 📞 Reporting Security Issues

If you discover a security vulnerability, please email [your-email] instead of using the issue tracker.
