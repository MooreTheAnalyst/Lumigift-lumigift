# CORS Policy Implementation

This document describes the CORS (Cross-Origin Resource Sharing) policy implemented for the Lumigift API.

## Overview

The CORS middleware enforces a strict policy that only allows requests from configured origins. This prevents unauthorized cross-origin requests while allowing legitimate frontend applications to communicate with the API.

## Configuration

### Environment Variables

Configure allowed origins via the `CORS_ALLOWED_ORIGINS` environment variable:

```bash
# Single origin (default for development)
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Multiple origins (comma-separated)
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Wildcard subdomains (development only)
CORS_ALLOWED_ORIGINS=*.yourdomain.com,http://localhost:3000
```

### Default Configuration

- **Development**: `http://localhost:3000`
- **Production**: Must be explicitly configured via environment variables

## Features

### 1. Preflight Request Handling

The middleware automatically handles OPTIONS requests:

```
OPTIONS /api/v1/gifts HTTP/1.1
Origin: https://yourdomain.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Content-Type, Authorization
```

Response:
```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://yourdomain.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token
Access-Control-Max-Age: 86400
Access-Control-Allow-Credentials: true
```

### 2. Credentials Support

Cookies and authorization headers are allowed for same-origin requests:

```
Access-Control-Allow-Credentials: true
```

### 3. Origin Validation

- Exact origin matching (e.g., `https://yourdomain.com`)
- Wildcard subdomain matching (e.g., `*.yourdomain.com`)
- Returns 403 Forbidden for disallowed origins

### 4. Exposed Headers

The following headers are exposed to the client:

- `Content-Length`
- `X-API-Version`
- `x-correlation-id`

## Usage in API Routes

### Basic Usage

Wrap your route handler with the `withCors` middleware:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, withCors } from "@/server/middleware";
import type { ApiResponse } from "@/types";

export const GET = withErrorHandler(withCors(async (req: NextRequest) => {
  return NextResponse.json<ApiResponse<{ message: string }>>({
    success: true,
    data: { message: "Hello from CORS-protected endpoint" },
  });
}));
```

### With Authentication

Combine CORS with other middleware:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandler, withCors, withCsrf } from "@/server/middleware";
import type { ApiResponse } from "@/types";

export const POST = withErrorHandler(withCors(withCsrf(async (req: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Your handler logic here
  return NextResponse.json<ApiResponse<{ success: boolean }>>({
    success: true,
    data: { success: true },
  });
})));
```

## Testing CORS

### Test with curl

```bash
# Preflight request
curl -X OPTIONS http://localhost:3000/api/v1/gifts \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -v

# Actual request
curl -X GET http://localhost:3000/api/v1/gifts \
  -H "Origin: http://localhost:3000" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -v
```

### Test with unauthorized origin

```bash
# This should return 403 Forbidden
curl -X GET http://localhost:3000/api/v1/gifts \
  -H "Origin: https://unauthorized.com" \
  -v
```

### Test with browser

```javascript
// From https://yourdomain.com
fetch('https://api.yourdomain.com/api/v1/gifts', {
  method: 'GET',
  credentials: 'include', // Include cookies
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error('CORS error:', err));
```

## Security Considerations

### 1. Strict Origin Matching

- Origins must match exactly (case-sensitive)
- Wildcards are only supported for subdomains (e.g., `*.yourdomain.com`)
- Avoid using `*` in production (allows any origin)

### 2. Credentials Handling

- Credentials are only allowed for configured origins
- Cookies are sent with requests to same-origin endpoints
- Authorization headers are validated per-request

### 3. Preflight Caching

- Preflight responses are cached for 24 hours (`Access-Control-Max-Age: 86400`)
- Reduces preflight requests for repeated cross-origin calls

### 4. Sensitive Headers

- The `Authorization` header is explicitly allowed
- Custom headers like `X-CSRF-Token` are allowed
- Sensitive headers are never exposed to the client

## Troubleshooting

### CORS Error: "No 'Access-Control-Allow-Origin' header"

**Cause**: The origin is not in the allowed list.

**Solution**: Add the origin to `CORS_ALLOWED_ORIGINS`:

```bash
CORS_ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:3000
```

### CORS Error: "Credentials mode is 'include' but Access-Control-Allow-Credentials is missing"

**Cause**: The middleware is not properly configured.

**Solution**: Ensure the route handler is wrapped with `withCors`:

```typescript
export const GET = withErrorHandler(withCors(async (req) => {
  // ...
}));
```

### Preflight Request Fails

**Cause**: The OPTIONS method is not handled.

**Solution**: The `withCors` middleware automatically handles OPTIONS requests. Ensure it's applied to all HTTP methods.

## Environment-Specific Configuration

### Development

```bash
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### Staging

```bash
CORS_ALLOWED_ORIGINS=https://staging.yourdomain.com
```

### Production

```bash
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

## Related Documentation

- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [OWASP: Cross-Origin Resource Sharing](https://owasp.org/www-community/attacks/csrf)
- [Next.js: API Routes](https://nextjs.org/docs/api-routes/introduction)
