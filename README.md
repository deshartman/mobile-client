# Mobile Client Application

A secure, multi-user web-based mobile client application with user authentication, contact management, and activity tracking capabilities.

## Project Structure

```
MobileClient/
├── client/          # Frontend application
│   ├── components/  # Reusable UI components
│   ├── services/    # API and service integrations
│   ├── view/        # Application views/pages
│   └── index.html   # Main HTML file
└── server/          # Backend Node.js server
    ├── services/    # Backend services
    ├── utils/       # Utility functions
    └── server.js    # Main server file
```

## Prerequisites

- Node.js (version 14 or higher)
- pnpm (package manager)

## Getting Started

### 1. Install Dependencies

Navigate to the server directory and install dependencies:

```bash
cd server
pnpm install
```

### 2. Environment Setup

Create a `.env` file in the server directory with your Twilio credentials:

```bash
# Copy this template and fill in your values
cp .env.example .env
```

### 3. Start the Server

From the `server` directory:

```bash
# Development mode with auto-restart
pnpm run dev

# Production mode
pnpm start
```

The server will start on an available port (auto port selection enabled).

### 4. Access the Client

The client is served as static files by the Express server. Once the server is running:

1. Open your browser
2. Navigate to `http://localhost:[PORT]` (e.g., `http://127.0.0.1:3001/`)
3. The client application will load automatically

**Note**: The client files are served from the root path, not from `/client/`.

## User Authentication

The application includes a secure login system:

### First-Time Users
1. Navigate to the application URL (e.g., `http://127.0.0.1:3001/`)
2. You'll be presented with a login screen
3. Enter your name and email address
4. The system will create a new user account and automatically log you in

### Returning Users
1. Enter the same email address used previously
2. The system will log you in with your existing account
3. Your contacts and activities will be preserved

### Pre-configured Test Users
For development and testing, the following users are pre-configured:
- **John Doe**: john.doe@example.com
- **Jane Smith**: jane.smith@example.com  
- **Des Hartman**: dhartman@twilio.com

Each test user has sample contacts and activities for testing purposes.

## Available Scripts

### Server Scripts
- `pnpm start` - Start the server in production mode
- `pnpm run dev` - Start the server in development mode with nodemon

## Features

- **User Authentication**: Secure login with email-based user management
- **Contact Management**: Manage and organize user-specific contacts
- **Activity Tracking**: View call history and activities per user
- **Data Isolation**: Complete user data separation and privacy
- **Responsive Design**: Mobile-optimized interface
- **Session Management**: Browser session-based authentication
- **Cache Strategy**: 5-minute activity cache for performance

## Development

The application uses a secure client-server architecture:
- **Frontend**: Vanilla JavaScript with modular components and user authentication
- **Backend**: Express.js server with user management and data isolation
- **Authentication**: Session-based authentication with userGUID
- **Communication**: REST API endpoints with user validation
- **Data Storage**: In-memory storage with user-specific data isolation

## Troubleshooting

### Common Issues

1. **Port Issues**: The server uses auto port selection. Check console output for the actual port.
2. **Dependencies**: Run `pnpm install` in the server directory if you encounter module errors.

### Login and Authentication Issues

3. **Login Screen Appears Unexpectedly**: 
   - Check browser DevTools → Application → Session Storage for valid userGUID
   - Clear session storage and re-authenticate if corrupted
   - Verify server is running and accessible

4. **Empty Activities/Contacts**:
   - Ensure you're logged in with a valid user account
   - Check browser Network tab for successful API calls
   - Verify server logs show your userGUID in requests

5. **Data Not Persisting**:
   - Remember that server uses in-memory storage - data is lost on server restart
   - Verify your session is valid (userGUID, userEmail, userName in sessionStorage)
   - Check that contact creation triggers activity cache invalidation

### Development and Debugging

6. **Session Management**: 
   - Sessions persist only during browser session (not after browser restart)
   - Use pre-configured test users for consistent testing
   - Monitor console logs for authentication flow

7. **User Data Isolation**: 
   - Different users will see completely different data
   - Use multiple browser profiles or incognito windows to test multi-user scenarios
   - Check server logs to verify userGUID isolation

For detailed debugging information, see the `CLAUDE.md` file which contains comprehensive troubleshooting guides and architecture details.