# Mobile Client Data Architecture

## Overview
This mobile client application implements a **client-server architecture** with **user authentication** and a **cache-first strategy** for managing contacts and activities. The system provides secure user login, tracks communication activities with contacts, and maintains data isolation between users. The server serves as the authoritative data source with local caching for performance.

## Data Architecture

### Core Entities

#### Users
Users represent authenticated individuals with unique identifiers:
```javascript
{
    userGUID: 'uuid-v4-string',        // Unique user identifier
    name: 'string',                    // User's display name
    email: 'user@example.com'          // Email address (unique)
}
```

#### Activities
Activities represent all interactions with contacts (calls, messages, contact additions, etc.):
```javascript
{
    id: uuidv4(),                    // Unique identifier
    type: 'Phone|Message|WhatsApp|SIP|Client',
    datetime: '2025-02-23T01:15:00', // ISO timestamp
    duration: 45,                    // Duration in minutes
    identityValue: '+1 (555) 444-3333', // Phone/contact method
    contactGuid: 'contact-1'         // Links to contact
}
```

#### Contacts
Contacts store person/business information:
```javascript
{
    guid: 'contact-timestamp',
    firstName: 'string',
    lastName: 'string',
    company: 'string',
    identities: [
        { type: 'Phone|Message|WhatsApp|SIP|Client', value: 'contact_value' }
    ]
}
```

## Data Flow Architecture

### Client-Server Relationship
```
┌─────────────────┐    HTTP API    ┌──────────────────┐
│     Client      │ ←──────────────→ │      Server      │
│                 │                 │                  │
│ sessionStorage  │     Cache       │ ContactService   │
│ (5min cache)    │                 │ (Memory Maps)    │
│                 │                 │                  │
│ localStorage    │   Persistent    │ UserService      │
│ (auth data)     │                 │ (User Data)      │
└─────────────────┘                 └──────────────────┘
```

### Storage Strategy

#### Server-Side (Source of Truth)
- **UserService**: Manages user accounts and authentication with UUID-based identification
- **ContactService**: Manages contacts and activities in memory Maps per user
- **Data Structure**: `userGUID → contacts/activities → data` (complete user isolation)
- **API Endpoints**: RESTful endpoints for CRUD operations with user authentication

#### Client-Side Caching
- **sessionStorage**: User authentication data and activity cache (session-based)
- **Cache Keys**:
  - User session: `userGUID` + `userEmail` + `userName`
  - Activity cache: `activitiesCache` + `activitiesCacheTimestamp` (5-minute expiration)
- **Session Management**: Automatic validation and cleanup on authentication failures

## Key Workflows

### 1. User Authentication Flow
```
1. App startup → Check sessionStorage for userGUID
2. If userGUID exists → Validate with GET /users/{userGUID}
3. If valid → Load main view | If invalid → Clear session, show login
4. Login screen → User enters name and email
5. User registration → POST /users (creates new or returns existing userGUID)
6. Client stores → sessionStorage: userGUID, userEmail, userName
7. Navigation → Redirect to main view with authenticated session
```

### 2. Contact Addition Flow
```
1. Authenticated user → Access contact form from main view
2. User adds contact → Contact form submission with userGUID from session
3. Contact saved → POST /contacts/{userGUID} to server with user validation
4. Activity created → POST /activities/{userGUID} with duration: 0 (audit trail)
5. Cache invalidated → Remove activitiesCacheTimestamp from sessionStorage
6. Navigation → Return to main view with user session intact
7. UI refresh → Visibility change triggers fresh user-specific data fetch
8. Activities displayed → New contact appears in user's activity list
```

### 3. Activity Loading Flow
```
1. User authentication → Validate userGUID from sessionStorage
2. Check cache → User-specific activitiesCache age validation (5 minutes)
3. If fresh → Use cached user activities
4. If stale/missing → Fetch from GET /activities/{userGUID}
5. Server validation → Verify userGUID exists, return user-specific activities
6. Enrich data → Server adds contact info to user's activities
7. Cache update → Store fresh user data with timestamp
8. Render UI → Display user's activities with contact details
```

## Caching Strategy

### Cache Levels
1. **Session Authentication**: User credentials in sessionStorage (browser session)
2. **Activity Cache**: User-specific activity data (5-minute TTL)
3. **Form Data**: Temporary contact form data (cleared on submission)

### Cache Invalidation
- **Time-based**: Automatic after 5 minutes for activity cache
- **Action-based**: After contact/activity creation invalidates user's cache
- **Session-based**: Authentication failures clear all session data
- **Visibility-based**: When app regains focus triggers user data refresh
- **Manual**: User-triggered refresh validates session and updates cache

### Cache Management Code Locations
- **index.js** - Application bootstrap and session validation
- **login.js** - User authentication and session management
- **ActivityList.js:61-83** - User-specific cache validation and refresh logic
- **ActivityList.js:219-232** - Visibility change handler for authenticated users

## Activity-Contact Relationship

### Automatic Activity Creation
When an authenticated user adds a contact, the system automatically creates a user-specific activity:
- **Type**: "Phone"
- **Duration**: 0 (indicates contact addition, not an actual call)
- **Purpose**: Provides audit trail of when contacts were added per user
- **User Isolation**: Activity is tied to userGUID ensuring data privacy
- **Location**: `contact.js:133-158` (contact form creates activity via user-authenticated API)
- **Server handling**: `ContactService.addActivity()` stores activity with userGUID validation

### Data Enrichment
User-specific activities are enriched with contact information on server response:
```javascript
// Server enriches user's activities with their contact data
return activities.map(activity => {
    const contact = userContacts?.get(activity.contactGuid);
    return { ...activity, contact: contact || null };
});
```
**User Isolation**: Only contacts belonging to the authenticated user are used for enrichment.

## Troubleshooting Common Issues

### Authentication Issues
**Symptoms**: Login screen appears unexpectedly or session validation fails

**Possible Causes**:
1. **Invalid userGUID** - User session contains non-existent userGUID
2. **Server restart** - UserService lost in-memory user data
3. **Browser storage corruption** - sessionStorage contains invalid data
4. **API communication failure** - Network issues preventing user validation

**Debugging Steps**:
1. Check browser DevTools → Application → Session Storage for userGUID validity
2. Verify GET /users/{userGUID} returns 200 status in Network tab
3. Check server logs for user validation requests and UserService state
4. Clear sessionStorage and re-authenticate if corruption suspected

### Empty Activities List
**Symptoms**: Console shows "Fetched activities: []"

**Possible Causes**:
1. **Server not running** - API endpoints returning 404/500 errors
2. **No activities in server data** - Authenticated user has no activities yet
3. **Authentication failure** - User not properly authenticated before activity fetch
4. **User isolation** - Activities stored under different userGUID than current session
5. **Cache corruption** - Invalid activity cache preventing fresh data fetch

**Debugging Steps**:
1. Verify user authentication status in sessionStorage (userGUID, userEmail, userName)
2. Check network tab for GET /activities/{userGUID} API call success/failure
3. Verify server ContactService has data for current authenticated userGUID
4. Clear activity cache (activitiesCacheTimestamp) to force fresh data fetch
5. Check server logs for user-specific activity retrieval

### Data Sync Issues
**Symptoms**: Changes not persisting or appearing inconsistently

**Common Causes**:
1. **Cache timing** - 5-minute cache delay masking user-specific updates
2. **Authentication issues** - User session invalid during data operations
3. **Navigation timing** - Contact events fired after page navigation
4. **API failures** - Server errors during user-authenticated contact/activity creation
5. **User isolation errors** - Operations attempted without proper userGUID validation

## Performance Considerations

### Optimization Features
- **User-specific caching** reduces server requests while maintaining data isolation
- **Session-based authentication** eliminates server-side session storage overhead
- **Background refresh** on app focus maintains user data freshness
- **Event-driven updates** provide real-time feel with user context
- **Modular API service** enables easy endpoint changes with authentication

### Limitations
- **Memory-only server storage** - User data and sessions lost on server restart
- **Session-based authentication** - Users must re-authenticate after browser restart
- **No offline queue** - Failed requests not retried, requires re-authentication
- **No pagination** - All user activities loaded at once
- **No persistent cache** - Activity cache cleared on session end

## Development Notes

### Key Files
- **index.js** - Application bootstrap and session validation
- **login.js** - User authentication flow and session management
- **ApiService.js** - HTTP client with user authentication for server communication
- **ActivityList.js** - Main component managing user-specific activity display and caching
- **UserServices.js** - Server-side user account management and authentication
- **ContactService.js** - Server-side business logic for user-isolated contacts/activities
- **contact.js** - Contact form handling with user authentication

### Testing the Architecture
1. **Verify server running** - Check if user and contact API endpoints respond
2. **Test user authentication** - Ensure login flow creates valid sessions
3. **Test contact creation** - Ensure user contacts appear in user activities after navigation
4. **Validate user isolation** - Verify users only see their own data
5. **Validate caching** - Observe user-specific cache behavior with network throttling
6. **Check session persistence** - Verify sessions survive app refreshes but not browser restarts
7. **Monitor API calls** - Use browser DevTools and server logs to debug authenticated data flow

## Debugging Tools

### Server-Side Logging
The server provides comprehensive logging for debugging user-authenticated operations:
```bash
# User authentication logging
[UserService] getUserByEmail called for: user@example.com
[UserService] User registration/lookup: userGUID created/found
[API] GET /users/{userGUID} - User validation request
[UserService] User validation for userGUID: {userGUID}

# User-specific API request logging
[REQUEST] GET /activities/{userGUID} - Headers: {...}
[API] GET /activities/{userGUID} - Request received for authenticated user
[ContactService] getActivities called for userGUID: {userGUID}
[ContactService] Found X activities for user {userGUID}
```

### Client-Side Logging
The client logs user authentication and API calls:
```javascript
[Login] User login attempt: name, email
[Login] Authentication successful: userGUID received
[ApiService] Making GET request to /activities/{userGUID} for authenticated user
[ApiService] GET /activities/{userGUID} - Response status: 200
[Contact] Saving contact to server for user: {userGUID}
[Contact] Activity created for user: {userGUID}
```

### Common Debugging Scenarios

**Authentication Failures**:
1. Check sessionStorage for userGUID, userEmail, userName presence
2. Verify GET /users/{userGUID} returns 200 status for session validation
3. Monitor `[Login]` and `[UserService]` logs for authentication flow
4. Clear sessionStorage if corruption suspected

**Empty Activities List**:
1. Verify user authentication status before activity fetch
2. Check server logs for userGUID in ContactService dummy data
3. Verify API calls reach server with correct authenticated userGUID
4. Ensure server returns user-specific activities with contact enrichment

**Contact Creation Issues**:
1. Confirm user authentication before contact form access
2. Monitor contact form submission with `[Contact]` logs including userGUID
3. Verify both contact and activity API calls succeed with user context
4. Check cache invalidation removes user's `activitiesCacheTimestamp`
5. Confirm main page refreshes user-specific data on return

**User Data Isolation Issues**:
1. Verify different users see different data sets
2. Check server ContactService user data isolation in dummy data
3. Monitor API calls include correct userGUID for each operation
4. Validate session userGUID matches server user validation

This architecture provides a solid foundation for a secure, multi-user mobile contact/activity tracking application with user authentication, data isolation, comprehensive logging, and debugging capabilities for development and troubleshooting.