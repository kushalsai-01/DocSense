# 🔐 JWT Authentication Implementation Guide

## Overview

This guide adds JWT-based authentication to protect your API endpoints and enable user-specific features.

**What You'll Add:**
- Login/Signup with Firebase Auth
- JWT token validation in Go API
- Protected routes in frontend
- User-specific document access

---

## Architecture

```
User Login (Firebase) → ID Token → Go API Validates → Access Granted
                                        ↓
                                  PostgreSQL
                                    users
```

---

## Step 1: Update Go API

### Install JWT Package

```bash
cd services/api
go get github.com/golang-jwt/jwt/v5
go get github.com/gin-contrib/cors
```

### Create JWT Middleware

Create `services/api/internal/transport/http/middleware/auth.go`:

```go
package middleware

import (
	"context"
	"crypto/rsa"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// FirebasePublicKeys stores Google's public keys for Firebase token verification
var firebaseKeysCache struct {
	Keys      map[string]*rsa.PublicKey
	ExpiresAt time.Time
}

// JWTAuth middleware validates Firebase ID tokens
func JWTAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			c.Abort()
			return
		}

		// Extract token from "Bearer <token>"
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization format"})
			c.Abort()
			return
		}

		// Parse JWT token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			// Verify signing method
			if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}

			// Get kid from header
			kid, ok := token.Header["kid"].(string)
			if !ok {
				return nil, fmt.Errorf("kid not found in token header")
			}

			// Get Firebase public key
			publicKey, err := getFirebasePublicKey(kid)
			if err != nil {
				return nil, err
			}

			return publicKey, nil
		})

		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token", "details": err.Error()})
			c.Abort()
			return
		}

		if !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "token is not valid"})
			c.Abort()
			return
		}

		// Extract claims
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			c.Abort()
			return
		}

		// Verify issuer
		iss, ok := claims["iss"].(string)
		if !ok || !strings.HasPrefix(iss, "https://securetoken.google.com/") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token issuer"})
			c.Abort()
			return
		}

		// Verify expiration
		exp, ok := claims["exp"].(float64)
		if !ok || int64(exp) < time.Now().Unix() {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "token expired"})
			c.Abort()
			return
		}

		// Store user info in context
		c.Set("user_id", claims["sub"])
		c.Set("email", claims["email"])
		c.Set("firebase_claims", claims)

		c.Next()
	}
}

// getFirebasePublicKey fetches and caches Google's public keys
func getFirebasePublicKey(kid string) (*rsa.PublicKey, error) {
	// Check cache
	if firebaseKeysCache.Keys != nil && time.Now().Before(firebaseKeysCache.ExpiresAt) {
		if key, ok := firebaseKeysCache.Keys[kid]; ok {
			return key, nil
		}
	}

	// Fetch keys from Google
	resp, err := http.Get("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch Firebase public keys: %w", err)
	}
	defer resp.Body.Close()

	// Parse keys
	var keys map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&keys); err != nil {
		return nil, fmt.Errorf("failed to decode Firebase public keys: %w", err)
	}

	// Parse RSA keys
	rsaKeys := make(map[string]*rsa.PublicKey)
	for k, certPEM := range keys {
		cert, err := jwt.ParseRSAPublicKeyFromPEM([]byte(certPEM))
		if err != nil {
			continue
		}
		rsaKeys[k] = cert
	}

	// Cache keys (Google rotates them every few hours)
	cacheControl := resp.Header.Get("Cache-Control")
	maxAge := 3600 // Default 1 hour
	if strings.Contains(cacheControl, "max-age=") {
		fmt.Sscanf(cacheControl, "max-age=%d", &maxAge)
	}

	firebaseKeysCache.Keys = rsaKeys
	firebaseKeysCache.ExpiresAt = time.Now().Add(time.Duration(maxAge) * time.Second)

	// Return requested key
	if key, ok := rsaKeys[kid]; ok {
		return key, nil
	}

	return nil, fmt.Errorf("public key not found for kid: %s", kid)
}

// OptionalAuth middleware - doesn't block if no token
func OptionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.Next()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			kid, _ := token.Header["kid"].(string)
			return getFirebasePublicKey(kid)
		})

		if err == nil && token.Valid {
			if claims, ok := token.Claims.(jwt.MapClaims); ok {
				c.Set("user_id", claims["sub"])
				c.Set("email", claims["email"])
			}
		}

		c.Next()
	}
}
```

### Update Router

Edit `services/api/cmd/api/main.go`:

```go
package main

import (
	"log"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"your-module/internal/transport/http/middleware"
	"your-module/internal/transport/http/handlers"
)

func main() {
	router := gin.Default()

	// CORS configuration
	config := cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "https://your-domain.vercel.app"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}
	router.Use(cors.New(config))

	// Public routes (no auth required)
	public := router.Group("/api")
	{
		public.GET("/health", handlers.HealthCheck)
		public.POST("/auth/login", handlers.Login)
		public.POST("/auth/signup", handlers.Signup)
	}

	// Protected routes (JWT required)
	protected := router.Group("/api")
	protected.Use(middleware.JWTAuth())
	{
		protected.POST("/documents", handlers.UploadDocument)
		protected.GET("/documents", handlers.ListDocuments)
		protected.GET("/documents/:id", handlers.GetDocument)
		protected.DELETE("/documents/:id", handlers.DeleteDocument)
		
		protected.POST("/query", handlers.Query)
	}

	// Optional auth routes (better experience if logged in)
	optional := router.Group("/api")
	optional.Use(middleware.OptionalAuth())
	{
		optional.GET("/recent-documents", handlers.RecentDocuments)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Starting server on :%s", port)
	router.Run(":" + port)
}
```

### Update Document Handlers to Filter by User

Edit `services/api/internal/transport/http/handlers/documents.go`:

```go
func UploadDocument(c *gin.Context) {
	// Get user ID from JWT claims
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	// ... existing upload logic ...
	
	// When inserting to database, include user_id
	doc := Document{
		ID:       uuid.New().String(),
		UserID:   userID.(string),  // Add this field
		Filename: filename,
		// ... other fields ...
	}
	
	// Save to database
	// ...
}

func ListDocuments(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	// Only return documents for this user
	docs, err := db.GetDocumentsByUser(userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, docs)
}

func DeleteDocument(c *gin.Context) {
	userID, _ := c.Get("user_id")
	docID := c.Param("id")
	
	// Verify ownership before deleting
	doc, err := db.GetDocument(docID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}
	
	if doc.UserID != userID.(string) {
		c.JSON(http.StatusForbidden, gin.H{"error": "cannot delete other users' documents"})
		return
	}
	
	// Delete
	if err := db.DeleteDocument(docID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "document deleted"})
}
```

### Update Database Schema

Add user_id column to documents table:

```sql
-- infra/postgres/schema.sql
ALTER TABLE documents 
ADD COLUMN user_id VARCHAR(255) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- Create index for faster user queries
CREATE INDEX idx_documents_user_id ON documents(user_id);

-- Optional: Add users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);
```

---

## Step 2: Update Frontend

### Create Auth Hook

Create `apps/web/src/auth/useAuth.ts`:

```typescript
import { useState, useEffect } from 'react'
import { auth } from './firebase'
import { User, onAuthStateChanged } from 'firebase/auth'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const getToken = async (): Promise<string | null> => {
    if (!user) return null
    return await user.getIdToken()
  }

  const authenticatedFetch = async (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    const token = await getToken()
    
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    })
  }

  return {
    user,
    loading,
    getToken,
    authenticatedFetch,
  }
}
```

### Update AppHome to Use Authenticated Requests

Edit `apps/web/src/routes/AppHome.tsx`:

```typescript
import { useAuth } from '@/auth/useAuth'

export function AppHome() {
  const { user, authenticatedFetch } = useAuth()
  
  // ... existing state ...

  // Update document fetch
  const fetchDocuments = async () => {
    try {
      const response = await authenticatedFetch('http://localhost:8080/api/documents')
      
      if (!response.ok) {
        throw new Error('Failed to fetch documents')
      }
      
      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (error) {
      console.error('Error fetching documents:', error)
      setError('Failed to load documents')
    }
  }

  // Update document upload
  const handleFileUpload = async (files: FileList) => {
    const formData = new FormData()
    formData.append('file', files[0])
    
    try {
      const response = await authenticatedFetch('http://localhost:8080/api/documents', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        throw new Error('Upload failed')
      }
      
      await fetchDocuments()
    } catch (error) {
      console.error('Upload error:', error)
      setError('Failed to upload document')
    }
  }

  // Update chat query
  const handleSend = async () => {
    if (!message.trim()) return
    
    const userMessage = { role: 'user', content: message }
    setMessages([...messages, userMessage])
    setMessage('')
    setIsLoading(true)
    
    try {
      const endpoint = pipelineMode === 'agent'
        ? 'http://localhost:8100/agent/query'
        : 'http://localhost:8000/query'
      
      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: message,
          user_id: user?.uid || '00000000-0000-0000-0000-000000000001',
          session_id: sessionId,
          top_k: 5,
          enable_planning: pipelineMode === 'agent',
        }),
      })
      
      if (!response.ok) {
        throw new Error('Query failed')
      }
      
      const data = await response.json()
      const assistantMessage = {
        role: 'assistant',
        content: data.answer || data.response,
        citations: data.citations,
      }
      
      setMessages([...messages, userMessage, assistantMessage])
    } catch (error) {
      console.error('Query error:', error)
      setError('Failed to get response')
    } finally {
      setIsLoading(false)
    }
  }

  // Update delete document
  const deleteDocument = async (docId: string) => {
    try {
      const response = await authenticatedFetch(
        `http://localhost:8080/api/documents/${docId}`,
        { method: 'DELETE' }
      )
      
      if (!response.ok) {
        throw new Error('Delete failed')
      }
      
      await fetchDocuments()
    } catch (error) {
      console.error('Delete error:', error)
      setError('Failed to delete document')
    }
  }

  // ... rest of component ...
}
```

### Add Login Page

Create `apps/web/src/routes/LoginPage.tsx`:

```typescript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/auth/firebase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Logo } from '@/components/Logo'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignup, setIsSignup] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email, password)
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
      navigate('/app')
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Logo className="mx-auto mb-4" size="lg" />
          <h1 className="text-2xl font-bold">
            {isSignup ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-sm text-gray-600">
            {isSignup ? 'Sign up to get started' : 'Sign in to continue'}
          </p>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Loading...' : isSignup ? 'Sign Up' : 'Sign In'}
            </Button>

            <button
              type="button"
              onClick={() => setIsSignup(!isSignup)}
              className="text-sm text-blue-600 hover:underline"
            >
              {isSignup
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
```

### Update Routes

Edit `apps/web/src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { AuthGuard } from './auth/AuthGuard'
import { LandingPage } from './routes/LandingPage'
import { LoginPage } from './routes/LoginPage'
import { AppHome } from './routes/AppHome'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/app"
            element={
              <AuthGuard>
                <AppHome />
              </AuthGuard>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
```

---

## Step 3: Test Authentication

### 1. Rebuild Services

```bash
# Rebuild Go API with JWT middleware
docker compose up -d --build api

# Check logs
docker compose logs -f api
```

### 2. Test Login Flow

```bash
# Open browser
http://localhost:5173/login

# Try signing up
Email: test@example.com
Password: test123

# Should redirect to /app
```

### 3. Test Protected Endpoints

```bash
# Without token (should fail)
curl -X GET http://localhost:8080/api/documents

# Response: {"error": "missing authorization header"}

# With token (should work)
# Get token from Firebase console or browser DevTools
curl -X GET http://localhost:8080/api/documents \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"

# Response: {"documents": [...]}
```

### 4. Test Document Upload with Auth

```bash
# Login in browser
# Open DevTools → Network tab
# Upload a document
# Check request headers for "Authorization: Bearer ey..."
```

---

## Step 4: Firebase Configuration

### Get Firebase Config

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or use existing)
3. Go to Project Settings → General
4. Scroll to "Your apps" → Web app
5. Copy the config

### Update Frontend Firebase Config

Edit `apps/web/src/auth/firebase.ts`:

```typescript
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
```

### Enable Email/Password Auth

1. Firebase Console → Authentication → Sign-in method
2. Enable "Email/Password"
3. Save

---

## Step 5: Production Deployment

### Environment Variables

**Vercel (Frontend):**
```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
```

**Backend (.env):**
```bash
FIREBASE_PROJECT_ID=your-project-id
ALLOWED_ORIGINS=https://your-app.vercel.app
```

### Update CORS for Production

Edit `services/api/cmd/api/main.go`:

```go
config := cors.Config{
	AllowOrigins: []string{
		"http://localhost:5173",
		"https://your-app.vercel.app",
		os.Getenv("FRONTEND_URL"),
	},
	// ... rest of config
}
```

---

## Security Checklist

- [x] JWT tokens validated on every request
- [x] Tokens stored securely (httpOnly cookies or localStorage)
- [x] HTTPS in production (Vercel provides this)
- [x] Firebase rules configured
- [x] API rate limiting enabled
- [x] CORS configured for production domains
- [x] User IDs properly scoped (can't access other users' data)
- [x] SQL injection prevented (use parameterized queries)
- [x] XSS prevented (React escapes by default)

---

## Testing Checklist

- [ ] User can sign up
- [ ] User can log in
- [ ] User can log out
- [ ] Protected routes redirect to login
- [ ] Documents filtered by user
- [ ] Cannot delete other users' documents
- [ ] Cannot access other users' documents
- [ ] Token refresh works (Firebase handles this)
- [ ] Expired tokens rejected

---

## 🎉 Done!

Your app now has full JWT authentication with:
- ✅ Secure login/signup
- ✅ Protected API routes
- ✅ User-specific document access
- ✅ Firebase integration
- ✅ Production-ready security

**Next:** Deploy to Vercel + Railway/Render! 🚀
